import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/sidebar';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Grid3X3, RefreshCw, AlertTriangle, CheckCircle, Users, BookOpen, Search } from 'lucide-react';
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

// Memoized matrix cell component for performance - NOW WITH TWO DROPDOWNS AND HOURS INPUT
const MatrixCell = React.memo(({ 
  classId, 
  subjectId, 
  subjectShortName,
  assignmentSem1,
  assignmentSem2, 
  qualifiedTeachers,
  remainingHoursByTeacherSem1,
  remainingHoursByTeacherSem2,
  onUpdate,
  onHoursUpdate 
}: {
  classId: string;
  subjectId: string;
  subjectShortName: string;
  assignmentSem1?: AssignmentData;
  assignmentSem2?: AssignmentData;
  qualifiedTeachers: Teacher[];
  remainingHoursByTeacherSem1: Map<string, number>;
  remainingHoursByTeacherSem2: Map<string, number>;
  onUpdate: (classId: string, subjectId: string, semester: "1" | "2", teacherId: string | null) => void;
  onHoursUpdate: (classId: string, subjectId: string, semester: "1" | "2", hours: number) => void;
}) => {
  return (
    <td className="p-2 border-r">
      <div className="flex flex-col gap-1">
        {/* 1. Halbjahr Dropdown + Hours Input */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground font-medium w-8">1.HJ</span>
          <Select
            value={assignmentSem1?.teacherId || 'unassigned'}
            onValueChange={(teacherId) => 
              onUpdate(classId, subjectId, "1", teacherId === 'unassigned' ? null : teacherId)
            }
          >
            <SelectTrigger className="w-24 h-7 text-xs">
              <SelectValue placeholder="--" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">--</SelectItem>
              {qualifiedTeachers.map(teacher => {
                const remainingHours = remainingHoursByTeacherSem1.get(teacher.id) || 0;
                return (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.shortName} ({remainingHours}h frei)
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={assignmentSem1?.hoursPerWeek || ''}
            onChange={(e) => {
              const value = e.target.value;
              if (value && assignmentSem1) {
                onHoursUpdate(classId, subjectId, "1", parseFloat(value));
              }
            }}
            className="w-14 h-7 text-xs text-center"
            placeholder="0"
            disabled={!assignmentSem1}
            data-testid={`input-hours-s1-${classId}-${subjectId}`}
          />
          <span className="text-xs text-muted-foreground">h</span>
        </div>
        
        {/* 2. Halbjahr Dropdown + Hours Input */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground font-medium w-8">2.HJ</span>
          <Select
            value={assignmentSem2?.teacherId || 'unassigned'}
            onValueChange={(teacherId) => 
              onUpdate(classId, subjectId, "2", teacherId === 'unassigned' ? null : teacherId)
            }
          >
            <SelectTrigger className="w-24 h-7 text-xs">
              <SelectValue placeholder="--" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">--</SelectItem>
              {qualifiedTeachers.map(teacher => {
                const remainingHours = remainingHoursByTeacherSem2.get(teacher.id) || 0;
                return (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.shortName} ({remainingHours}h frei)
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={assignmentSem2?.hoursPerWeek || ''}
            onChange={(e) => {
              const value = e.target.value;
              if (value && assignmentSem2) {
                onHoursUpdate(classId, subjectId, "2", parseFloat(value));
              }
            }}
            className="w-14 h-7 text-xs text-center"
            placeholder="0"
            disabled={!assignmentSem2}
            data-testid={`input-hours-s2-${classId}-${subjectId}`}
          />
          <span className="text-xs text-muted-foreground">h</span>
        </div>
      </div>
    </td>
  );
});

export default function LehrerFaecherZuordnung() {
  const { toast } = useToast();
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'jahrgang' | 'einzelklasse' | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string>("alle");
  const [subjectFilter, setSubjectFilter] = useState<string>("alle");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Refs for always current values
  const subjectsRef = useRef<Subject[]>([]);
  const classesRef = useRef<Class[]>([]);

  // Definierte Reihenfolge der deutschen Schulfächer
  const SUBJECT_ORDER = ['D', 'M', 'E', 'FS', 'SW', 'PK', 'GE', 'EK', 'BI', 'PH', 'CH', 'TC', 'IF', 'HW', 'KU', 'MU', 'TX', 'ER', 'KR', 'PP', 'SO', 'BO', 'SP'];

  // Only load basic data first
  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({ 
    queryKey: ['/api/classes'],
    select: (data: Class[]) => data?.sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)) || [],
    staleTime: 30000,
    retry: false
  });

  // Load other data only when grade is selected
  const { data: teachers = [], isLoading: teachersLoading } = useQuery<Teacher[]>({ 
    queryKey: ['/api/teachers'],
    select: (data: Teacher[]) => data?.filter(t => t.isActive) || [],
    staleTime: 30000,
    retry: false,
    enabled: selectedGrade !== null
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
    retry: false,
    enabled: selectedGrade !== null
  });

  // Update refs whenever subjects or classes change
  useEffect(() => {
    subjectsRef.current = subjects;
  }, [subjects]);

  useEffect(() => {
    classesRef.current = classes;
  }, [classes]);

  // Load assignments for BOTH semesters only when grade is selected
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<AssignmentData[]>({ 
    queryKey: ['/api/assignments'],
    queryFn: () => fetch(`/api/assignments?minimal=true`).then(res => res.json()),
    staleTime: 30000,
    retry: false,
    enabled: selectedGrade !== null
  });

  // Show loading state while data is loading
  const isLoading = teachersLoading || classesLoading || subjectsLoading || assignmentsLoading;

  // Abgleich mit Stundenpläne-Daten (vollständige API)
  const { refetch: refetchFullAssignments } = useQuery<AssignmentData[]>({ 
    queryKey: ['/api/assignments-full'],
    queryFn: () => fetch(`/api/assignments`).then(res => res.json()),
    enabled: false
  });

  // Datenabgleich zwischen Matrix und Stundenplänen
  const [comparisonResult, setComparisonResult] = useState<DataComparison | null>(null);
  const [isComparingData, setIsComparingData] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const performDataComparison = useCallback(async () => {
    setIsComparingData(true);
    try {
      const { data: schedules = [] } = await refetchFullAssignments();
      
      const differences: DataComparison['differences'] = [];
      const summary = { 
        total: 0, 
        missing: 0,
        conflicts: 0,
        consistent: 0,
        extraInSchedules: 0
      };

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


  // Pre-computed indexes for O(1) lookups (for BOTH semesters)
  const computedData = useMemo(() => {
    const assignmentIndex = new Map<string, AssignmentData>();
    assignments.forEach(assignment => {
      const key = `${assignment.classId}-${assignment.subjectId}-${assignment.semester}`;
      assignmentIndex.set(key, assignment);
    });

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

    const hoursByTeacherAndSemester = new Map<string, number>();
    assignments.forEach(assignment => {
      if (!assignment.teacherId) return;
      
      const key = `${assignment.teacherId}-${assignment.semester}`;
      const currentHours = hoursByTeacherAndSemester.get(key) || 0;
      const additionalHours = parseFloat(assignment.hoursPerWeek) || 0;
      hoursByTeacherAndSemester.set(key, currentHours + additionalHours);
    });

    // Create separate maps for remaining hours by teacher for each semester
    const remainingHoursByTeacherSem1 = new Map<string, number>();
    const remainingHoursByTeacherSem2 = new Map<string, number>();
    
    teachers.forEach(teacher => {
      const assignedHoursSem1 = hoursByTeacherAndSemester.get(`${teacher.id}-1`) || 0;
      const assignedHoursSem2 = hoursByTeacherAndSemester.get(`${teacher.id}-2`) || 0;
      const maxHours = parseFloat(teacher.maxHours);
      
      remainingHoursByTeacherSem1.set(teacher.id, Math.max(0, maxHours - assignedHoursSem1));
      remainingHoursByTeacherSem2.set(teacher.id, Math.max(0, maxHours - assignedHoursSem2));
    });

    return {
      assignmentIndex,
      teachersBySubjectShort,
      hoursByTeacherAndSemester,
      remainingHoursByTeacherSem1,
      remainingHoursByTeacherSem2
    };
  }, [assignments, teachers, subjects]);

  // Filter logic
  const filteredClasses = useMemo(() => {
    if (gradeFilter === 'alle') return classes;
    return classes.filter(c => c.grade.toString() === gradeFilter);
  }, [classes, gradeFilter]);

  const filteredSubjects = useMemo(() => {
    if (subjectFilter === 'alle') return subjects;
    return subjects.filter(s => s.id === subjectFilter);
  }, [subjects, subjectFilter]);

  // Helper: Extract subject short name from course name
  const extractSubjectFromCourseName = (courseName: string): string | null => {
    // Match patterns like "10FS", "10INF_IF", "07NW_BI"
    const match = courseName.match(/^\d{2}([A-Z_]+)$/i);
    if (!match) return null;
    
    // If there's an underscore, take the part after it (e.g., "INF_IF" -> "IF")
    const extracted = match[1].toUpperCase();
    const underscoreIndex = extracted.indexOf('_');
    return underscoreIndex !== -1 ? extracted.substring(underscoreIndex + 1) : extracted;
  };

  // Get subjects relevant for a specific class
  const getSubjectsForClass = useCallback((classData: Class): Subject[] => {
    if (classData.type === 'kurs') {
      const courseSubject = extractSubjectFromCourseName(classData.name);
      if (courseSubject) {
        const subject = subjects.find(s => s.shortName.toUpperCase() === courseSubject);
        if (subject) {
          if (subjectFilter === 'alle' || subject.id === subjectFilter) {
            return [subject];
          }
          return [];
        }
      }
      return [];
    }
    
    return filteredSubjects;
  }, [subjects, filteredSubjects, subjectFilter]);

  // O(1) lookup functions (with semester parameter)
  const getAssignment = useCallback((classId: string, subjectId: string, semester: "1" | "2") => {
    const key = `${classId}-${subjectId}-${semester}`;
    return computedData.assignmentIndex.get(key);
  }, [computedData.assignmentIndex]);

  const getQualifiedTeachers = useCallback((subjectShortName: string) => {
    return computedData.teachersBySubjectShort.get(subjectShortName.toLowerCase()) || [];
  }, [computedData.teachersBySubjectShort]);

  const getRemainingHours = useCallback((teacherId: string, semester: "1" | "2") => {
    const key = `${teacherId}-${semester}`;
    const assignedHours = computedData.hoursByTeacherAndSemester.get(key) || 0;
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return 0;
    const maxHours = parseFloat(teacher.maxHours);
    return Math.max(0, maxHours - assignedHours);
  }, [computedData.hoursByTeacherAndSemester, teachers]);

  // Get required hours from existing assignments or use default
  const getRequiredHours = (subjectId: string) => {
    const existingAssignments = assignments.filter(a => a.subjectId === subjectId);
    if (existingAssignments.length > 0) {
      return parseFloat(existingAssignments[0].hoursPerWeek);
    }
    return 2;
  };

  // Mutations
  const createAssignmentMutation = useMutation({
    mutationFn: async (assignment: { teacherId: string; classId: string; subjectId: string; hoursPerWeek: number; semester: string }) => {
      return apiRequest('POST', '/api/assignments', assignment);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assignments-full'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/assignments'] });
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
      const toSync = comparisonResult.differences.filter(diff => 
        diff.issue === 'Nur in Stundenplänen' && diff.schedulesData
      );

      let syncedCount = 0;
      let errorCount = 0;

      for (const diff of toSync) {
        if (diff.schedulesData) {
          try {
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

      if (syncedCount > 0) {
        toast({
          title: "Synchronisation erfolgreich",
          description: `${syncedCount} Zuordnungen wurden erfolgreich synchronisiert${errorCount > 0 ? `, ${errorCount} Fehler aufgetreten` : ''}.`,
          variant: "default"
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
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

  // Updated updateAssignment function with semester parameter
  const updateAssignment = useCallback((classId: string, subjectId: string, semester: "1" | "2", teacherId: string | null) => {
    const hours = getRequiredHours(subjectId);
    const existingAssignment = getAssignment(classId, subjectId, semester);

    const subject = subjectsRef.current.find(s => s.id === subjectId);
    const currentClass = classesRef.current.find(c => c.id === classId);
    
    const differenzierungsFaecher = ['FS', 'SW', 'NW', 'IF', 'TC', 'MUS'];
    const isDifferenzierungsfach = subject && differenzierungsFaecher.includes(subject.shortName.toUpperCase().trim());
    const isGrade7to10 = currentClass && currentClass.grade >= 7 && currentClass.grade <= 10;

    if (teacherId === null || teacherId === 'unassigned') {
      if (existingAssignment) {
        deleteAssignmentMutation.mutate(existingAssignment.id);
      }
      
      if (isDifferenzierungsfach && isGrade7to10 && currentClass) {
        const sameGradeClasses = classesRef.current.filter(c => 
          c.grade === currentClass.grade && c.id !== currentClass.id && c.type === 'klasse'
        );
        
        sameGradeClasses.forEach(cls => {
          const otherAssignment = getAssignment(cls.id, subjectId, semester);
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
      
      if (isDifferenzierungsfach && isGrade7to10 && currentClass) {
        const sameGradeClasses = classesRef.current.filter(c => 
          c.grade === currentClass.grade && c.id !== currentClass.id && c.type === 'klasse'
        );
        
        sameGradeClasses.forEach(cls => {
          const otherAssignment = getAssignment(cls.id, subjectId, semester);
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
              semester
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
        semester
      });
      
      if (isDifferenzierungsfach && isGrade7to10 && currentClass) {
        const sameGradeClasses = classesRef.current.filter(c => 
          c.grade === currentClass.grade && c.id !== currentClass.id && c.type === 'klasse'
        );
        
        sameGradeClasses.forEach(cls => {
          const otherAssignment = getAssignment(cls.id, subjectId, semester);
          if (!otherAssignment) {
            createAssignmentMutation.mutate({
              teacherId,
              classId: cls.id,
              subjectId,
              hoursPerWeek: hours,
              semester
            });
          }
        });
      }
    }
  }, [getRequiredHours, getAssignment, createAssignmentMutation, updateAssignmentMutation, deleteAssignmentMutation]);

  // Update only hours for an existing assignment
  const updateHoursOnly = useCallback((classId: string, subjectId: string, semester: "1" | "2", hours: number) => {
    const existingAssignment = getAssignment(classId, subjectId, semester);
    
    if (existingAssignment && hours > 0 && hours <= 10) {
      updateAssignmentMutation.mutate({
        id: existingAssignment.id,
        hoursPerWeek: hours
      });
    }
  }, [getAssignment, updateAssignmentMutation]);

  // Group classes by grade
  const classesByGrade = useMemo(() => {
    const grouped = new Map<number, Class[]>();
    classes.forEach(cls => {
      if (!grouped.has(cls.grade)) {
        grouped.set(cls.grade, []);
      }
      grouped.get(cls.grade)!.push(cls);
    });
    return grouped;
  }, [classes]);

  // Selection screen
  if (selectedGrade === null) {
    return (
      <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
        <Sidebar />
        
        <main className="flex-1 overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Lehrer-Fächer-Zuordnung</h2>
                <p className="text-sm text-muted-foreground mt-1">Jahrgang auswählen</p>
              </div>
            </div>
          </header>

          <div className="p-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4">Bitte wählen Sie einen Jahrgang aus:</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[5, 6, 7, 8, 9, 10].map(grade => {
                    const gradeClasses = classesByGrade.get(grade) || [];
                    const classCount = gradeClasses.filter(c => c.type === 'klasse').length;
                    const courseCount = gradeClasses.filter(c => c.type === 'kurs').length;
                    
                    return (
                      <Button
                        key={grade}
                        onClick={() => {
                          setSelectedGrade(grade);
                          setGradeFilter(grade.toString());
                        }}
                        variant="outline"
                        className="h-auto py-6 flex flex-col items-center gap-2 hover:bg-primary/10 hover:border-primary"
                        data-testid={`button-select-grade-${grade}`}
                      >
                        <span className="text-3xl font-bold">{grade}</span>
                        <span className="text-sm text-muted-foreground">
                          {classCount} Klasse{classCount !== 1 ? 'n' : ''} • {courseCount} Kurs{courseCount !== 1 ? 'e' : ''}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Lehrer-Fächer-Zuordnung - Jahrgang {selectedGrade}</h2>
                <p className="text-sm text-muted-foreground mt-1">Beide Halbjahre gleichzeitig bearbeiten</p>
                {isLoading && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    <span className="text-sm text-orange-600 font-medium">Daten werden geladen...</span>
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={() => {
                setSelectedGrade(null);
                setGradeFilter("alle");
              }}
              variant="outline"
              size="sm"
              data-testid="button-back-to-selection"
            >
              ← Zurück zur Auswahl
            </Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Statistik-Kacheln */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-assignments">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">Zuordnungen</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-assignments-count">
                      {isLoading ? '...' : assignments.filter(a => {
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
                  Beide Halbjahre
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
                        const classSubjects = getSubjectsForClass(classData);
                        const classAssignments = classSubjects.flatMap(subject => [
                          getAssignment(classData.id, subject.id, "1"),
                          getAssignment(classData.id, subject.id, "2")
                        ]).filter(Boolean);
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
                  <strong>Datenabgleich-Ergebnis (Beide Halbjahre)</strong>
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
                    <th className="text-left p-3 font-medium text-sm border-r bg-muted/80 sticky left-0 z-10">KLASSE</th>
                    {filteredSubjects.map(subject => (
                      <th key={subject.id} className="text-center p-3 font-medium text-sm border-r min-w-[280px]">
                        {subject.shortName.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.map(classData => {
                    const classSubjects = getSubjectsForClass(classData);
                    
                    const classAssignments = classSubjects.flatMap(subject => [
                      getAssignment(classData.id, subject.id, "1"),
                      getAssignment(classData.id, subject.id, "2")
                    ]).filter(Boolean);
                    
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
                        <td className="p-3 font-medium border-r bg-muted/30 text-sm sticky left-0 z-10">
                          {classData.name}
                        </td>
                        {filteredSubjects.map(subject => {
                          const isRelevant = classSubjects.some(cs => cs.id === subject.id);
                          
                          if (!isRelevant) {
                            return (
                              <td key={`${classData.id}-${subject.id}`} className="p-3 text-center border-r bg-muted/5">
                                <span className="text-muted-foreground text-xs">—</span>
                              </td>
                            );
                          }
                          
                          const assignmentSem1 = getAssignment(classData.id, subject.id, "1");
                          const assignmentSem2 = getAssignment(classData.id, subject.id, "2");
                          const qualifiedTeachers = getQualifiedTeachers(subject.shortName);
                          
                          return (
                            <MatrixCell
                              key={`${classData.id}-${subject.id}`}
                              classId={classData.id}
                              subjectId={subject.id}
                              subjectShortName={subject.shortName}
                              assignmentSem1={assignmentSem1}
                              assignmentSem2={assignmentSem2}
                              qualifiedTeachers={qualifiedTeachers}
                              remainingHoursByTeacherSem1={computedData.remainingHoursByTeacherSem1}
                              remainingHoursByTeacherSem2={computedData.remainingHoursByTeacherSem2}
                              onUpdate={updateAssignment}
                              onHoursUpdate={updateHoursOnly}
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
        </div>
      </main>
    </div>
  );
}
