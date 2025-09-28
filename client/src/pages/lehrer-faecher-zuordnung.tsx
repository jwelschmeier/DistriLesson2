import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/sidebar';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Grid3X3, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
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

  // Definierte Reihenfolge der deutschen Schulfächer
  const SUBJECT_ORDER = ['D', 'M', 'E', 'Fs', 'SW', 'PK', 'GE', 'EK', 'BI', 'PH', 'CH', 'TC', 'If', 'HW', 'KU', 'MU', 'Tx', 'ER', 'KR', 'PP', 'SO', 'BO', 'SP'];

  // Data fetching
  const { data: teachers = [] } = useQuery<Teacher[]>({ 
    queryKey: ['/api/teachers'],
    select: (data) => data.filter(t => t.isActive)
  });

  const { data: classes = [] } = useQuery<Class[]>({ 
    queryKey: ['/api/classes'],
    select: (data) => data.sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name))
  });

  const { data: subjects = [] } = useQuery<Subject[]>({ 
    queryKey: ['/api/subjects'],
    select: (data) => {
      return data
        .filter(subject => SUBJECT_ORDER.includes(subject.shortName))
        .sort((a, b) => {
          const indexA = SUBJECT_ORDER.indexOf(a.shortName);
          const indexB = SUBJECT_ORDER.indexOf(b.shortName);
          return indexA - indexB;
        });
    }
  });

  const { data: assignments = [] } = useQuery<AssignmentData[]>({ 
    queryKey: ['/api/assignments', selectedSemester],
    queryFn: () => fetch(`/api/assignments?semester=${selectedSemester}&minimal=true`).then(res => res.json())
  });

  // Abgleich mit Stundenpläne-Daten (vollständige API)
  const { data: fullAssignments = [], refetch: refetchFullAssignments, isLoading: isComparingData } = useQuery<AssignmentData[]>({ 
    queryKey: ['/api/assignments-full', selectedSemester],
    queryFn: () => fetch(`/api/assignments?semester=${selectedSemester}`).then(res => res.json()),
    enabled: false // Nur auf Anfrage laden
  });

  // Datenabgleich zwischen Matrix und Stundenplänen
  const [comparisonResult, setComparisonResult] = useState<DataComparison | null>(null);
  
  const performDataComparison = useCallback(async () => {
    await refetchFullAssignments();
    
    const differences: DataComparison['differences'] = [];
    const summary = { total: 0, missing: 0, conflicts: 0, consistent: 0 };

    // Erstelle Maps für einfachen Vergleich
    const matrixMap = new Map<string, AssignmentData>();
    const schedulesMap = new Map<string, AssignmentData>();

    assignments.forEach(a => {
      const key = `${a.classId}-${a.subjectId}-${a.semester}`;
      matrixMap.set(key, a);
    });

    fullAssignments.forEach(a => {
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
          issue: 'Fehlend in Stundenplänen',
          description: `Zuordnung existiert in Matrix aber nicht in Stundenplänen`,
          matrixData: matrixAssignment
        });
      } else if (
        matrixAssignment.teacherId !== scheduleAssignment.teacherId ||
        matrixAssignment.hoursPerWeek !== scheduleAssignment.hoursPerWeek
      ) {
        summary.conflicts++;
        differences.push({
          id: `conflict-${key}`,
          issue: 'Datenkonflikte',
          description: `Unterschiedliche Lehrer oder Stunden: Matrix=${matrixAssignment.teacherId}, Stundenplan=${scheduleAssignment.teacherId}`,
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
        summary.missing++;
        differences.push({
          id: `extra-${key}`,
          issue: 'Nur in Stundenplänen',
          description: `Zuordnung existiert nur in Stundenplänen, nicht in Matrix`,
          schedulesData: scheduleAssignment
        });
      }
    });

    setComparisonResult({ differences, summary });
  }, [assignments, fullAssignments, refetchFullAssignments]);

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

    // Remaining hours by teacher
    const remainingHoursByTeacher = new Map<string, number>();
    teachers.forEach(teacher => {
      const assignedHours = assignments
        .filter(a => a.teacherId === teacher.id && a.semester === selectedSemester)
        .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
      
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
      return apiRequest('/api/assignments', 'POST', assignment);
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
      return apiRequest(`/api/assignments/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments', selectedSemester] });
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
      return apiRequest(`/api/assignments/${id}`, 'DELETE');
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

  // Memoized update assignment function to prevent unnecessary re-renders
  const updateAssignment = useCallback((classId: string, subjectId: string, teacherId: string | null) => {
    const hours = getRequiredHours(subjectId);
    const existingAssignment = getAssignment(classId, subjectId);

    if (teacherId === null || teacherId === 'unassigned') {
      if (existingAssignment) {
        deleteAssignmentMutation.mutate(existingAssignment.id);
      }
    } else if (existingAssignment) {
      updateAssignmentMutation.mutate({
        id: existingAssignment.id,
        teacherId,
        hoursPerWeek: hours
      });
    } else {
      createAssignmentMutation.mutate({
        teacherId,
        classId,
        subjectId,
        hoursPerWeek: hours,
        semester: selectedSemester
      });
    }
  }, [selectedSemester, getRequiredHours, getAssignment, createAssignmentMutation, updateAssignmentMutation, deleteAssignmentMutation]);

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
                    <div className="grid grid-cols-4 gap-4 text-sm mb-3">
                      <div className="text-center">
                        <div className="font-semibold text-green-600">{comparisonResult.summary.consistent}</div>
                        <div className="text-xs text-muted-foreground">Konsistent</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-orange-600">{comparisonResult.summary.missing}</div>
                        <div className="text-xs text-muted-foreground">Abweichungen</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-red-600">{comparisonResult.summary.conflicts}</div>
                        <div className="text-xs text-muted-foreground">Konflikte</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold">{comparisonResult.summary.total}</div>
                        <div className="text-xs text-muted-foreground">Gesamt</div>
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
                      {filteredClasses.map(classData => (
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
                      ))}
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