import { storage } from './storage';
import { PdfLessonParser } from './pdf-lesson-parser';
import type { Subject, SubjectMapping, InsertSubjectMapping } from '@shared/schema';

export interface MappingConflict {
  id: string;
  pdfSubjectName: string;
  normalizedName: string;
  possibleMatches: {
    subject: Subject;
    confidence: number;
    reason: string;
  }[];
}

export interface IntelligentMappingResult {
  subjectId: string | null;
  conflict?: MappingConflict;
  autoResolved: boolean;
  mappingUsed?: SubjectMapping;
}

export class IntelligentMappingService {
  
  /**
   * Attempts to intelligently map a PDF subject name to a system subject ID
   * @param pdfSubjectName Original subject name from PDF
   * @param allSubjects All available system subjects
   * @returns Mapping result with either resolved subject ID or conflict details
   */
  async mapSubject(pdfSubjectName: string, allSubjects: Subject[]): Promise<IntelligentMappingResult> {
    const normalizedName = PdfLessonParser.normalizeSubjectName(pdfSubjectName);
    
    // 1. Check for existing mapping
    const existingMapping = await storage.findSubjectMappingByName(normalizedName);
    if (existingMapping) {
      // Increment usage counter
      await storage.incrementMappingUsage(existingMapping.id);
      
      return {
        subjectId: existingMapping.systemSubjectId,
        autoResolved: true,
        mappingUsed: existingMapping
      };
    }
    
    // 2. Try fuzzy matching against existing subjects
    const matches = this.findPossibleMatches(normalizedName, allSubjects);
    
    // 3. If high-confidence match found, auto-resolve
    const highConfidenceMatch = matches.find(m => m.confidence >= 0.9);
    if (highConfidenceMatch) {
      // Create mapping for future use
      await this.createMapping(pdfSubjectName, normalizedName, highConfidenceMatch.subject.id, highConfidenceMatch.confidence);
      
      return {
        subjectId: highConfidenceMatch.subject.id,
        autoResolved: true
      };
    }
    
    // 4. Return conflict for manual resolution
    return {
      subjectId: null,
      conflict: {
        id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        pdfSubjectName,
        normalizedName,
        possibleMatches: matches.slice(0, 5) // Top 5 matches
      },
      autoResolved: false
    };
  }
  
  /**
   * Manually resolve a conflict by creating a mapping
   * @param pdfSubjectName Original PDF subject name
   * @param selectedSubjectId Chosen system subject ID
   */
  async resolveConflict(pdfSubjectName: string, selectedSubjectId: string): Promise<SubjectMapping> {
    const normalizedName = PdfLessonParser.normalizeSubjectName(pdfSubjectName);
    return await this.createMapping(pdfSubjectName, normalizedName, selectedSubjectId, 1.0);
  }
  
  /**
   * Create a new subject mapping
   */
  private async createMapping(
    pdfSubjectName: string, 
    normalizedName: string, 
    systemSubjectId: string, 
    confidence: number
  ): Promise<SubjectMapping> {
    const mappingData: InsertSubjectMapping = {
      pdfSubjectName,
      normalizedName,
      systemSubjectId,
      confidence: confidence.toString(), // Convert to string for database
      usedCount: 1
    };
    
    return await storage.createSubjectMapping(mappingData);
  }
  
  /**
   * Find possible subject matches using fuzzy string matching
   */
  private findPossibleMatches(normalizedName: string, allSubjects: Subject[]): Array<{
    subject: Subject;
    confidence: number;
    reason: string;
  }> {
    const matches: Array<{ subject: Subject; confidence: number; reason: string; }> = [];
    
    for (const subject of allSubjects) {
      const subjectNormalized = subject.name.toLowerCase().trim();
      const shortNameNormalized = subject.shortName.toLowerCase().trim();
      
      // Exact match on normalized name
      if (subjectNormalized === normalizedName || shortNameNormalized === normalizedName) {
        matches.push({
          subject,
          confidence: 1.0,
          reason: 'Exakte Übereinstimmung'
        });
        continue;
      }
      
      // Contains match
      if (subjectNormalized.includes(normalizedName) || normalizedName.includes(subjectNormalized)) {
        matches.push({
          subject,
          confidence: 0.8,
          reason: 'Teilweise Übereinstimmung'
        });
        continue;
      }
      
      // Word similarity
      const similarity = this.calculateWordSimilarity(normalizedName, subjectNormalized);
      if (similarity >= 0.7) {
        matches.push({
          subject,
          confidence: similarity,
          reason: `${Math.round(similarity * 100)}% Ähnlichkeit`
        });
      }
    }
    
    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Calculate word similarity using Levenshtein distance
   */
  private calculateWordSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Get all existing mappings for management/review
   */
  async getAllMappings(): Promise<SubjectMapping[]> {
    return await storage.getSubjectMappings();
  }
  
  /**
   * Delete a mapping (if incorrect)
   */
  async deleteMapping(mappingId: string): Promise<void> {
    await storage.deleteSubjectMapping(mappingId);
  }
}

export const intelligentMappingService = new IntelligentMappingService();