import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/sidebar';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Grid3X3, RefreshCw, AlertTriangle, CheckCircle, Users, BookOpen, Filter, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Teacher, Class, Subject, Assignment } from '@shared/schema';

type DataComparison = {
  differences: {
    id: string;
    issue: string;
    description: string;
    matrixData?: Assignment;
    schedulesData?: Assignment;
  }[];
  summary: {
    total: number;
    missing: number;
    conflicts: number;
    consistent: number;
    extraInSchedules: number;
  };
};

type AssignmentData = Assignment & {
  teacher?: Teacher;
  class?: Class;
  subject?: Subject;
};

// Memoized matrix cell component for performance
const MatrixCell = React.memo(({ 
  classId, 
  subjectId, 
  subjectShortName,
  assignment, 
  qualifiedTeachers,
  remainingHoursByTeacher,
  onUpdate 
}: {
  classId: string;
  subjectId: string;
  subjectShortName: string;
  assignment?: AssignmentData;
  qualifiedTeachers: Teacher[];
  remainingHoursByTeacher: Map<string, number>;
  onUpdate: (classId: string, subjectId: string, teacherId: string | null) => void;
}) => {
  return (
    <td className="p-2 border-r">
      <Select
        value={assignment?.teacherId || 'unassigned'}
        onValueChange={(teacherId) => 
          onUpdate(classId, subjectId, teacherId === 'unassigned' ? null : teacherId)
        }
      >
        <SelectTrigger className="w-full h-8 text-xs">
          <SelectValue placeholder="--" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">--</SelectItem>
          {qualifiedTeachers.map(teacher => {
            const remainingHours = remainingHoursByTeacher.get(teacher.id) || 0;
            return (
              <SelectItem key={teacher.id} value={teacher.id}>
                {teacher.shortName} ({remainingHours}h frei)
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </td>
  );
});

export default function LehrerFaecherZuordnung() {
  const { toast } = useToast();
  const [selectedSemester, setSelectedSemester] = useState<"1" | "2">("1");
  const [gradeFilter, setGradeFilter] = useState<string>("alle");
  const [subjectFilter, setSubjectFilter] = useState<string>("alle");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Definierte Reihenfolge der deutschen Schulfächer
  const SUBJECT_ORDER = ['D', 'M', 'E', 'Fs', 'SW', 'PK', 'GE', 'EK', 'BI', 'PH', 'CH', 'TC', 'If', 'HW', 'KU', 'MU', 'Tx', 'ER', 'KR', 'PP', 'SO', 'BO', 'SP'];

  // Data fetching with proper error handling
  const { data: teachers = [], isLoading: teachersLoading } = useQuery<Teacher[]>({ 
    queryKey: ['/api/teachers'],
    select: (data: Teacher[]) => data?.filter(t => t.isActive) || [],
    staleTime: 30000,
    retry: false
  });

  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({ 
    queryKey: ['/api/classes'],
    select: (data: Class[]) => data?.sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)) || [],
    staleTime: 30000,
    retry: false
  });

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({ 
    queryKey: ['/api/subjects'],
    select: (data: Subject[]) => {
      if (!data) return [];
      return data
        .filter(subject => SUBJECT_ORDER.includes(subject.shortName))
        .sort((a, b) => {
          const indexA = SUBJECT_ORDER.indexOf(a.shortName);
          const indexB = SUBJECT_ORDER.indexOf(b.shortName);
          return indexA - indexB;
        });
    },
    staleTime: 30000,
    retry: false
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<AssignmentData[]>({ 
    queryKey: ['/api/assignments', selectedSemester],
    queryFn: () => fetch(`/api/assignments?semester=${selectedSemester}&minimal=true`).then(res => res.json()),
    staleTime: 30000,
    retry: false
  });

  // Show loading state while data is loading
  const isLoading = teachersLoading || classesLoading || subjectsLoading || assignmentsLoading;

  // Abgleich mit Stundenpläne-Daten (vollständige API)
  const { refetch: refetchFullAssignments } = useQuery<AssignmentData[]>({ 
    queryKey: ['/api/assignments-full', selectedSemester],
    queryFn: () => fetch(`/api/assignments?semester=${selectedSemester}`).then(res => res.json()),
    enabled: false // Nur auf Anfrage laden
  });

  // Datenabgleich zwischen Matrix und Stundenplänen
  const [comparisonResult, setComparisonResult] = useState<DataComparison | null>(null);
  const [isComparingData, setIsComparingData] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const performDataComparison = useCallback(async () => {
    setIsComparingData(true);
    try {
      // Hole frische Daten von der vollständigen API
      const { data: schedules = [] } = await refetchFullAssignments();
      
      const differences: DataComparison['differences'] = [];
      const summary = { 
        total: 0, 
        missing: 0,      // Nur in Matrix
        conflicts: 0,    // Unterschiedliche Daten
        consistent: 0,   // Gleiche Daten
        extraInSchedules: 0 // Nur in Stundenplänen
      };

      // Erstelle Maps für einfachen Vergleich
      const matrixMap = new Map<string, AssignmentData>();
      const schedulesMap = new Map<string, AssignmentData>();

      assignments.forEach(a => {
        const key = `${a.classId}-${a.subjectId}-${a.semester}`;
        matrixMap.set(key, a);
      });

      schedules.forEach(a => {
        const key = `${a.classId}-${a.subjectId}-${a.semester}`;
        schedulesMap.set(key, a);
      });

      // Vergleiche alle Matrix-Einträge
      matrixMap.forEach((matrixAssignment, key) => {
        summary.total++;
        const scheduleAssignment = schedulesMap.get(key);
        
        if (!scheduleAssignment) {
          summary.missing++;
          differences.push({
            id: `missing-${key}`,
            issue: 'Nur in Matrix',
            description: `Zuordnung existiert in Matrix aber nicht in Stundenplänen`,
            matrixData: matrixAssignment
          });
        } else if (
          matrixAssignment.teacherId !== scheduleAssignment.teacherId ||
          Number(matrixAssignment.hoursPerWeek) !== Number(scheduleAssignment.hoursPerWeek)
        ) {
          summary.conflicts++;
          differences.push({
            id: `conflict-${key}`,
            issue: 'Datenkonflikte',
            description: `Matrix: ${matrixAssignment.teacherId || 'Nicht zugeordnet'} (${matrixAssignment.hoursPerWeek}h) ≠ Stundenpläne: ${scheduleAssignment.teacherId || 'Nicht zugeordnet'} (${scheduleAssignment.hoursPerWeek}h)`,
            matrixData: matrixAssignment,
            schedulesData: scheduleAssignment
          });
        } else {
          summary.consistent++;
        }
      });

      // Prüfe auf zusätzliche Einträge in Stundenplänen
      schedulesMap.forEach((scheduleAssignment, key) => {
        if (!matrixMap.has(key)) {
          summary.extraInSchedules++;
          differences.push({
            id: `extra-${key}`,
            issue: 'Nur in Stundenplänen',
            description: `Zuordnung existiert nur in Stundenplänen, nicht in Matrix`,
            schedulesData: scheduleAssignment
          });
        }
      });

      setComparisonResult({ differences, summary });
    } catch (error) {
      console.error('Fehler beim Datenabgleich:', error);
      toast({
        title: "Fehler beim Datenabgleich",
        description: "Die Daten konnten nicht verglichen werden.",
        variant: "destructive"
      });
    } finally {
      setIsComparingData(false);
    }
  }, [assignments, refetchFullAssignments, toast]);


  // Pre-computed indexes for O(1) lookups
  const computedData = useMemo(() => {
    // Assignment index: classId-subjectId-semester -> assignment
    const assignmentIndex = new Map<string, AssignmentData>();
    assignments.forEach(assignment => {
      const key = `${assignment.classId}-${assignment.subjectId}-${assignment.semester}`;
      assignmentIndex.set(key, assignment);
    });

    // Teachers by subject short name (lowercased)
    const teachersBySubjectShort = new Map<string, Teacher[]>();
    subjects.forEach(subject => {
      const qualified = teachers.filter(teacher => 
        teacher.subjects.some(s => 
          s.toLowerCase() === subject.shortName.toLowerCase() ||
          s.toLowerCase().includes(subject.shortName.toLowerCase())
        )
      );
      teachersBySubjectShort.set(subject.shortName.toLowerCase(), qualified);
    });

    // PERFORMANCE OPTIMIZATION: Pre-aggregate hours by teacher and semester for O(1) lookup
    // Use combined key to include semester, avoiding per-teacher filtering
    const hoursByTeacherAndSemester = new Map<string, number>();
    assignments.forEach(assignment => {
      // Skip assignments without a teacherId
      if (!assignment.teacherId) return;
      
      const key = `${assignment.teacherId}-${assignment.semester}`;
      const currentHours = hoursByTeacherAndSemester.get(key) || 0;
      const additionalHours = parseFloat(assignment.hoursPerWeek) || 0;
      hoursByTeacherAndSemester.set(key, currentHours + additionalHours);
    });

    // OPTIMIZED: Remaining hours by teacher - O(1) lookup per teacher
    const remainingHoursByTeacher = new Map<string, number>();
    teachers.forEach(teacher => {
      const key = `${teacher.id}-${selectedSemester}`;
      const assignedHours = hoursByTeacherAndSemester.get(key) || 0;
      
      const maxHours = parseFloat(teacher.maxHours);
      const remaining = Math.max(0, maxHours - assignedHours);
      remainingHoursByTeacher.set(teacher.id, remaining);
    });

    return {
      assignmentIndex,
      teachersBySubjectShort,
      remainingHoursByTeacher
    };
  }, [assignments, teachers, subjects, selectedSemester]);

  // Filter logic
  const filteredClasses = useMemo(() => {
    if (gradeFilter === 'alle') return classes;
    return classes.filter(c => c.grade.toString() === gradeFilter);
  }, [classes, gradeFilter]);

  const filteredSubjects = useMemo(() => {
    if (subjectFilter === 'alle') return subjects;
    return subjects.filter(s => s.id === subjectFilter);
  }, [subjects, subjectFilter]);

  // O(1) lookup functions
  const getAssignment = useCallback((classId: string, subjectId: string) => {
    const key = `${classId}-${subjectId}-${selectedSemester}`;
    return computedData.assignmentIndex.get(key);
  }, [computedData.assignmentIndex, selectedSemester]);

  const getQualifiedTeachers = useCallback((subjectShortName: string) => {
    return computedData.teachersBySubjectShort.get(subjectShortName.toLowerCase()) || [];
  }, [computedData.teachersBySubjectShort]);

  const getRemainingHours = useCallback((teacherId: string) => {
    return computedData.remainingHoursByTeacher.get(teacherId) || 0;
  }, [computedData.remainingHoursByTeacher]);

  // Get required hours from existing assignments or use default
  const getRequiredHours = (subjectId: string) => {
    const existingAssignments = assignments.filter(a => a.subjectId === subjectId);
    if (existingAssignments.length > 0) {
      return parseFloat(existingAssignments[0].hoursPerWeek);
    }
    return 2; // Default
  };

  // Mutations
  const createAssignmentMutation = useMutation({
    mutationFn: async (assignment: { teacherId: string; classId: string; subjectId: string; hoursPerWeek: number; semester: string }) => {
      return apiRequest('POST', '/api/assignments', assignment);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments', selectedSemester] });
      toast({ title: "Zuordnung erstellt", description: "Die Zuordnung wurde erfolgreich gespeichert." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Fehler", 
        description: error.message || "Zuordnung konnte nicht erstellt werden.",
        variant: "destructive" 
      });
    }
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; teacherId?: string; hoursPerWeek?: number }) => {
      return apiRequest('PATCH', `/api/assignments/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments', selectedSemester] });
      queryClient.invalidateQueries({ queryKey: ['/api/assignments-full', selectedSemester] });
      toast({ title: "Zuordnung aktualisiert", description: "Die Zuordnung wurde erfolgreich geändert." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Fehler", 
        description: error.message || "Zuordnung konnte nicht aktualisiert werden.",
        variant: "destructive" 
      });
    }
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/assignments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments', selectedSemester] });
      toast({ title: "Zuordnung gelöscht", description: "Die Zuordnung wurde entfernt." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Fehler", 
        description: error.message || "Zuordnung konnte nicht gelöscht werden.",
        variant: "destructive" 
      });
    }
  });

  // Synchronisationsfunktion
  const performDataSynchronization = useCallback(async () => {
    if (!comparisonResult || comparisonResult.differences.length === 0) {
      toast({
        title: "Keine Synchronisation erforderlich",
        description: "Es wurden keine Unterschiede zum Synchronisieren gefunden.",
        variant: "default"
      });
      return;
    }

    setIsSyncing(true);
    try {
      // Filtere nur "Nur in Stundenplänen" Einträge für Synchronisation
      const toSync = comparisonResult.differences.filter(diff => 
        diff.issue === 'Nur in Stundenplänen' && diff.schedulesData
      );

      let syncedCount = 0;
      let errorCount = 0;

      // Synchronisiere jeden fehlenden Eintrag
      for (const diff of toSync) {
        if (diff.schedulesData) {
          try {
            // Erstelle den Assignment in der Matrix
            await createAssignmentMutation.mutateAsync({
              teacherId: diff.schedulesData.teacherId,
              classId: diff.schedulesData.classId,
              subjectId: diff.schedulesData.subjectId,
              hoursPerWeek: Number(diff.schedulesData.hoursPerWeek),
              semester: diff.schedulesData.semester
            });
            syncedCount++;
          } catch (error) {
            console.error('Fehler beim Synchronisieren des Eintrags:', error);
            errorCount++;
          }
        }
      }

      // Erfolgs-/Fehlermeldung
      if (syncedCount > 0) {
        toast({
          title: "Synchronisation erfolgreich",
          description: `${syncedCount} Zuordnungen wurden erfolgreich synchronisiert${errorCount > 0 ? `, ${errorCount} Fehler aufgetreten` : ''}.`,
          variant: "default"
        });
        
        // Aktualisiere die Daten und führe neuen Abgleich durch
        await new Promise(resolve => setTimeout(resolve, 1000)); // Kurz warten
        performDataComparison();
      } else if (errorCount > 0) {
        toast({
          title: "Synchronisation fehlgeschlagen",
          description: `${errorCount} Einträge konnten nicht synchronisiert werden.`,
          variant: "destructive"
        });
      }

    } catch (error) {
      console.error('Fehler bei der Synchronisation:', error);
      toast({
        title: "Synchronisation fehlgeschlagen",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  }, [comparisonResult, createAssignmentMutation, toast, performDataComparison]);

  // Memoized update assignment function to prevent unnecessary re-renders
  const updateAssignment = useCallback((classId: string, subjectId: string, teacherId: string | null) => {
    const hours = getRequiredHours(subjectId);
    const existingAssignment = getAssignment(classId, subjectId);

    // Finde das Fach und die Klasse für Differenzierungsfach-Logik
    const subject = subjects.find(s => s.id === subjectId);
    const currentClass = classes.find(c => c.id === classId);
    
    console.log('🔧 updateAssignment called:', { 
      classId, 
      subjectId, 
      teacherId,
      subjectFound: !!subject, 
      classFound: !!currentClass,
      subjectName: subject?.shortName,
      className: currentClass?.name
    });
    
    // Differenzierungsfächer für Jahrgänge 7-10 (normalisiert auf Großbuchstaben)
    const differenzierungsFaecher = ['FS', 'SW', 'NW', 'IF', 'TC', 'MUS'];
    const isDifferenzierungsfach = subject && differenzierungsFaecher.includes(subject.shortName.toUpperCase().trim());
    const isGrade7to10 = currentClass && currentClass.grade >= 7 && currentClass.grade <= 10;

    console.log('🔍 Differenzierungsfach-Check:', {
      subject: subject?.shortName,
      normalized: subject?.shortName.toUpperCase().trim(),
      isDiff: isDifferenzierungsfach,
      class: currentClass?.name,
      grade: currentClass?.grade,
      isGrade7to10,
      willReplicate: isDifferenzierungsfach && isGrade7to10
    });

    if (teacherId === null || teacherId === 'unassigned') {
      if (existingAssignment) {
        deleteAssignmentMutation.mutate(existingAssignment.id);
      }
      
      // Bei Differenzierungsfächern auch für alle anderen Klassen der Jahrgangsstufe löschen
      if (isDifferenzierungsfach && isGrade7to10 && currentClass) {
        const sameGradeClasses = classes.filter(c => 
          c.grade === currentClass.grade && c.id !== currentClass.id
        );
        
        sameGradeClasses.forEach(cls => {
          const otherAssignment = getAssignment(cls.id, subjectId);
          if (otherAssignment) {
            deleteAssignmentMutation.mutate(otherAssignment.id);
          }
        });
      }
    } else if (existingAssignment) {
      updateAssignmentMutation.mutate({
        id: existingAssignment.id,
        teacherId,
        hoursPerWeek: hours
      });
      
      // Bei Differenzierungsfächern auch für alle anderen Klassen der Jahrgangsstufe aktualisieren
      if (isDifferenzierungsfach && isGrade7to10 && currentClass) {
        const sameGradeClasses = classes.filter(c => 
          c.grade === currentClass.grade && c.id !== currentClass.id
        );
        
        sameGradeClasses.forEach(cls => {
          const otherAssignment = getAssignment(cls.id, subjectId);
          if (otherAssignment) {
            updateAssignmentMutation.mutate({
              id: otherAssignment.id,
              teacherId,
              hoursPerWeek: hours
            });
          } else {
            createAssignmentMutation.mutate({
              teacherId,
              classId: cls.id,
              subjectId,
              hoursPerWeek: hours,
              semester: selectedSemester
            });
          }
        });
      }
    } else {
      createAssignmentMutation.mutate({
        teacherId,
        classId,
        subjectId,
        hoursPerWeek: hours,
        semester: selectedSemester
      });
      
      // Bei Differenzierungsfächern auch für alle anderen Klassen der Jahrgangsstufe erstellen
      if (isDifferenzierungsfach && isGrade7to10 && currentClass) {
        const sameGradeClasses = classes.filter(c => 
          c.grade === currentClass.grade && c.id !== currentClass.id
        );
        
        console.log('📋 Repliziere zu anderen Klassen:', {
          currentClass: currentClass.name,
          subject: subject?.shortName,
          sameGradeClassesCount: sameGradeClasses.length,
          sameGradeClasses: sameGradeClasses.map(c => c.name),
          semester: selectedSemester
        });
        
        sameGradeClasses.forEach(cls => {
          const otherAssignment = getAssignment(cls.id, subjectId);
          console.log(`  → ${cls.name}: ${otherAssignment ? 'existiert bereits' : 'wird erstellt'}`);
          if (!otherAssignment) {
            createAssignmentMutation.mutate({
              teacherId,
              classId: cls.id,
              subjectId,
              hoursPerWeek: hours,
              semester: selectedSemester
            });
          }
        });
      }
    }
  }, [selectedSemester, getRequiredHours, getAssignment, createAssignmentMutation, updateAssignmentMutation, deleteAssignmentMutation, subjects, classes]);

  return (
    <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Lehrer-Fächer-Zuordnung</h2>
              {isLoading && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span className="text-sm text-orange-600 font-medium">Daten werden geladen... (kann bis zu 10 Sekunden dauern)</span>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="p-6">
          {/* Semester Tabs */}
          <Tabs value={selectedSemester} onValueChange={(value) => setSelectedSemester(value as "1" | "2")} className="mb-6">
            <TabsList className="grid w-fit grid-cols-2">
              <TabsTrigger value="1" data-testid="tab-semester-1">1. Halbjahr</TabsTrigger>
              <TabsTrigger value="2" data-testid="tab-semester-2">2. Halbjahr</TabsTrigger>
            </TabsList>

            <TabsContent value={selectedSemester} className="space-y-6">
              {/* Statistik-Kacheln */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card data-testid="card-assignments">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-muted-foreground text-xs font-medium">Zuordnungen</p>
                        <p className="text-2xl font-bold text-foreground" data-testid="text-assignments-count">
                          {isLoading ? '...' : assignments.filter(a => {
                            // Filter by current filters and search
                            const matchesGrade = gradeFilter === 'alle' || classes.find(c => c.id === a.classId)?.grade.toString() === gradeFilter;
                            const matchesSubject = subjectFilter === 'alle' || a.subjectId === subjectFilter;
                            const matchesSearch = searchQuery === '' || (() => {
                              const teacher = teachers.find(t => t.id === a.teacherId);
                              if (!teacher) return false;
                              const query = searchQuery.toLowerCase();
                              return teacher.firstName.toLowerCase().includes(query) ||
                                     teacher.lastName.toLowerCase().includes(query) ||
                                     teacher.shortName.toLowerCase().includes(query);
                            })();
                            return matchesGrade && matchesSubject && matchesSearch;
                          }).length}
                        </p>
                      </div>
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950 rounded-lg flex items-center justify-center">
                        <Grid3X3 className="text-blue-600 dark:text-blue-400 h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {selectedSemester}. Halbjahr
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-classes">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-muted-foreground text-xs font-medium">Klassen</p>
                        <p className="text-2xl font-bold text-foreground" data-testid="text-classes-count">
                          {isLoading ? '...' : filteredClasses.filter(classData => {
                            if (searchQuery === '') return true;
                            const classAssignments = filteredSubjects.map(subject => 
                              getAssignment(classData.id, subject.id)
                            ).filter(Boolean);
                            return classAssignments.some(assignment => {
                              const teacher = teachers.find(t => t.id === assignment?.teacherId);
                              if (!teacher) return false;
                              const query = searchQuery.toLowerCase();
                              return (
                                teacher.firstName.toLowerCase().includes(query) ||
                                teacher.lastName.toLowerCase().includes(query) ||
                                teacher.shortName.toLowerCase().includes(query)
                              );
                            });
                          }).length}
                        </p>
                      </div>
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-950 rounded-lg flex items-center justify-center">
                        <Users className="text-green-600 dark:text-green-400 h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {gradeFilter === 'alle' ? 'Alle Jahrgänge' : `Jahrgang ${gradeFilter}`}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-subjects">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-muted-foreground text-xs font-medium">Fächer</p>
                        <p className="text-2xl font-bold text-foreground" data-testid="text-subjects-count">
                          {filteredSubjects.length}
                        </p>
                      </div>
                      <div className="w-10 h-10 bg-orange-100 dark:bg-orange-950 rounded-lg flex items-center justify-center">
                        <BookOpen className="text-orange-600 dark:text-orange-400 h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {subjectFilter === 'alle' ? 'Alle Fächer' : 'Gefiltert'}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-search">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-muted-foreground text-xs font-medium">Suche / Filter</p>
                      </div>
                      <div className="w-10 h-10 bg-purple-100 dark:bg-purple-950 rounded-lg flex items-center justify-center">
                        <Search className="text-purple-600 dark:text-purple-400 h-5 w-5" />
                      </div>
                    </div>
                    <Input
                      type="text"
                      placeholder="Lehrer suchen..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 text-xs"
                      data-testid="input-search-teacher"
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Filter Controls */}
              <div className="flex gap-6 items-center">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="filter-grade">Jahrgangsstufe</Label>
                  <Select value={gradeFilter} onValueChange={setGradeFilter}>
                    <SelectTrigger className="w-40" id="filter-grade" data-testid="select-grade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">Alle Klassen</SelectItem>
                      <SelectItem value="5">Jahrgang 5</SelectItem>
                      <SelectItem value="6">Jahrgang 6</SelectItem>
                      <SelectItem value="7">Jahrgang 7</SelectItem>
                      <SelectItem value="8">Jahrgang 8</SelectItem>
                      <SelectItem value="9">Jahrgang 9</SelectItem>
                      <SelectItem value="10">Jahrgang 10</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex flex-col gap-2">
                  <Label htmlFor="filter-subject">Fach</Label>
                  <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                    <SelectTrigger className="w-48" id="filter-subject" data-testid="select-subject">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">Alle Fächer</SelectItem>
                      {subjects.map(subject => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Datenabgleich-Button */}
                <div className="flex flex-col gap-2 ml-auto">
                  <Label>&nbsp;</Label>
                  <Button 
                    onClick={performDataComparison}
                    disabled={isComparingData}
                    variant="outline"
                    size="sm"
                    data-testid="button-data-comparison"
                  >
                    {isComparingData ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Datenabgleich
                  </Button>
                </div>
              </div>

              {/* Abgleichsergebnis anzeigen */}
              {comparisonResult && (
                <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex items-center justify-between mb-2">
                      <strong>Datenabgleich-Ergebnis ({selectedSemester}. Halbjahr)</strong>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setComparisonResult(null)}
                        className="h-6 px-2 text-xs"
                      >
                        ✕
                      </Button>
                    </div>
                    <div className="grid grid-cols-5 gap-3 text-sm mb-3">
                      <div className="text-center" data-testid="summary-consistent">
                        <div className="font-semibold text-green-600">{comparisonResult.summary.consistent}</div>
                        <div className="text-xs text-muted-foreground">Konsistent</div>
                      </div>
                      <div className="text-center" data-testid="summary-missing">
                        <div className="font-semibold text-blue-600">{comparisonResult.summary.missing}</div>
                        <div className="text-xs text-muted-foreground">Nur Matrix</div>
                      </div>
                      <div className="text-center" data-testid="summary-extra">
                        <div className="font-semibold text-orange-600">{comparisonResult.summary.extraInSchedules}</div>
                        <div className="text-xs text-muted-foreground">Nur Stundenpläne</div>
                      </div>
                      <div className="text-center" data-testid="summary-conflicts">
                        <div className="font-semibold text-red-600">{comparisonResult.summary.conflicts}</div>
                        <div className="text-xs text-muted-foreground">Konflikte</div>
                      </div>
                      <div className="text-center" data-testid="summary-total">
                        <div className="font-semibold">{comparisonResult.summary.total + comparisonResult.summary.extraInSchedules}</div>
                        <div className="text-xs text-muted-foreground">Gesamt verglichen</div>
                      </div>
                    </div>
                    {comparisonResult.differences.length > 0 ? (
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {comparisonResult.differences.slice(0, 5).map(diff => (
                          <div key={diff.id} className="text-xs p-2 bg-white dark:bg-slate-800 rounded border">
                            <span className="font-medium text-orange-600">{diff.issue}:</span> {diff.description}
                          </div>
                        ))}
                        {comparisonResult.differences.length > 5 && (
                          <div className="text-xs text-muted-foreground">
                            ... und {comparisonResult.differences.length - 5} weitere Unterschiede
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Alle Daten sind konsistent zwischen Matrix und Stundenplänen
                      </div>
                    )}
                    
                    {/* Synchronisations-Button */}
                    {comparisonResult.differences.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">
                            {comparisonResult.differences.filter(d => d.issue === 'Nur in Stundenplänen').length} Einträge können von Stundenplänen übernommen werden
                          </p>
                          <Button 
                            onClick={performDataSynchronization}
                            disabled={isSyncing}
                            size="sm"
                            variant="default"
                            data-testid="button-sync-data"
                          >
                            {isSyncing ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Synchronisieren
                          </Button>
                        </div>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Assignment Matrix */}
              <div className="bg-card border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-sm border-r bg-muted/80">KLASSE</th>
                        {filteredSubjects.map(subject => (
                          <th key={subject.id} className="text-center p-3 font-medium text-sm border-r min-w-[120px]">
                            {subject.shortName.toUpperCase()}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClasses.map(classData => {
                        // Prüfe ob Klasse basierend auf Suchquery angezeigt werden soll
                        const classAssignments = filteredSubjects.map(subject => 
                          getAssignment(classData.id, subject.id)
                        ).filter(Boolean);
                        
                        const hasMatchingTeacher = searchQuery === '' || classAssignments.some(assignment => {
                          const teacher = teachers.find(t => t.id === assignment?.teacherId);
                          if (!teacher) return false;
                          const query = searchQuery.toLowerCase();
                          return (
                            teacher.firstName.toLowerCase().includes(query) ||
                            teacher.lastName.toLowerCase().includes(query) ||
                            teacher.shortName.toLowerCase().includes(query)
                          );
                        });

                        if (!hasMatchingTeacher) return null;

                        return (
                          <tr key={classData.id} className="border-b hover:bg-muted/20">
                            <td className="p-3 font-medium border-r bg-muted/30 text-sm">
                              {classData.name}
                            </td>
                            {filteredSubjects.map(subject => {
                              const assignment = getAssignment(classData.id, subject.id);
                              const qualifiedTeachers = getQualifiedTeachers(subject.shortName);
                              
                              return (
                                <MatrixCell
                                  key={`${classData.id}-${subject.id}`}
                                  classId={classData.id}
                                  subjectId={subject.id}
                                  subjectShortName={subject.shortName}
                                  assignment={assignment}
                                  qualifiedTeachers={qualifiedTeachers}
                                  remainingHoursByTeacher={computedData.remainingHoursByTeacher}
                                  onUpdate={updateAssignment}
                                />
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}