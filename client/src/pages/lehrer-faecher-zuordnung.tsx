import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Grid3X3, Users, BookOpen, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Teacher, Class, Subject, Assignment } from '@shared/schema';

type AssignmentData = Assignment & {
  teacher?: Teacher;
  class?: Class;
  subject?: Subject;
};

export default function LehrerFaecherZuordnung() {
  const { toast } = useToast();
  const [selectedSemester, setSelectedSemester] = useState<"1" | "2">("1");
  const [selectedGrades, setSelectedGrades] = useState<number[]>([5, 6, 7, 8, 9, 10]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [showAllTeachers, setShowAllTeachers] = useState(false);

  // Data fetching
  const { data: teachers = [] } = useQuery<Teacher[]>({ 
    queryKey: ['/api/teachers'],
    select: (data) => data.filter(t => t.isActive)
  });

  // Definierte Reihenfolge der deutschen Schulfächer
  const SUBJECT_ORDER = ['D', 'M', 'E', 'Fs', 'SW', 'PK', 'GE', 'EK', 'BI', 'PH', 'CH', 'TC', 'If', 'HW', 'KU', 'MU', 'Tx', 'ER', 'KR', 'PP', 'SO', 'BO', 'SP'];

  const { data: classes = [] } = useQuery<Class[]>({ 
    queryKey: ['/api/classes'],
    select: (data) => data.sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name))
  });

  const { data: subjects = [] } = useQuery<Subject[]>({ 
    queryKey: ['/api/subjects'],
    select: (data) => {
      // Filtere nur die gewünschten Fächer und sortiere nach der definierten Reihenfolge
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
    queryFn: () => fetch(`/api/assignments?semester=${selectedSemester}`).then(res => res.json())
  });

  // Create assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (assignment: { teacherId: string; classId: string; subjectId: string; hoursPerWeek: number; semester: string }) => {
      return apiRequest('/api/assignments', 'POST', assignment);
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

  // Update assignment mutation  
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; teacherId?: string; hoursPerWeek?: number }) => {
      return apiRequest(`/api/assignments/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments'] });
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

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/assignments/${id}`, 'DELETE');
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

  // Initialisiere selectedClasses und selectedSubjects mit allen verfügbaren Optionen
  React.useEffect(() => {
    if (classes.length > 0 && selectedClasses.length === 0) {
      setSelectedClasses(classes.map(c => c.id));
    }
  }, [classes, selectedClasses.length]);

  React.useEffect(() => {
    if (subjects.length > 0 && selectedSubjects.length === 0) {
      setSelectedSubjects(subjects.map(s => s.id));
    }
  }, [subjects, selectedSubjects.length]);

  // Filter logic
  const filteredClasses = useMemo(() => {
    return classes.filter(c => 
      selectedGrades.includes(c.grade) && 
      selectedClasses.includes(c.id)
    );
  }, [classes, selectedGrades, selectedClasses]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter(s => selectedSubjects.includes(s.id));
  }, [subjects, selectedSubjects]);

  // Assignment lookup with semester filtering on client side as backup
  const getAssignment = (classId: string, subjectId: string) => {
    return assignments.find(a => 
      a.classId === classId && 
      a.subjectId === subjectId && 
      a.semester === selectedSemester
    );
  };

  // Memoized teacher qualifications lookup
  const teacherQualifications = useMemo(() => {
    const qualificationMap = new Map<string, Teacher[]>();
    
    subjects.forEach(subject => {
      const qualified = teachers.filter(teacher => 
        teacher.subjects.some(s => 
          s.toLowerCase() === subject.shortName.toLowerCase() ||
          s.toLowerCase().includes(subject.shortName.toLowerCase())
        )
      );
      qualificationMap.set(subject.shortName, qualified);
    });
    
    return qualificationMap;
  }, [teachers, subjects]);

  // Get teachers qualified for a subject (now uses memoized lookup)
  const getQualifiedTeachers = (subjectShortName: string) => {
    return teacherQualifications.get(subjectShortName) || [];
  };

  // Memoized teacher workload calculations
  const teacherWorkloads = useMemo(() => {
    const workloadMap = new Map<string, { assigned: number; max: number; percentage: number }>();
    
    teachers.forEach(teacher => {
      const assigned = assignments
        .filter(a => a.teacherId === teacher.id && a.semester === selectedSemester)
        .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
      
      const max = parseFloat(teacher.maxHours);
      const percentage = (assigned / max) * 100;
      
      workloadMap.set(teacher.id, { assigned, max, percentage });
    });
    
    return workloadMap;
  }, [teachers, assignments, selectedSemester]);

  // Teacher workload calculation (now uses memoized lookup)
  const getTeacherWorkload = (teacherId: string) => {
    return teacherWorkloads.get(teacherId) || { assigned: 0, max: 25, percentage: 0 };
  };

  const getWorkloadStatus = (percentage: number) => {
    if (percentage > 100) return 'überlastet';
    if (percentage > 90) return 'grenzwertig';
    return 'normal';
  };

  // Filter helper functions
  const toggleGrade = (grade: number) => {
    setSelectedGrades(prev => 
      prev.includes(grade) 
        ? prev.filter(g => g !== grade)
        : [...prev, grade]
    );
  };

  const toggleClass = (classId: string) => {
    setSelectedClasses(prev => 
      prev.includes(classId) 
        ? prev.filter(c => c !== classId)
        : [...prev, classId]
    );
  };

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjects(prev => 
      prev.includes(subjectId) 
        ? prev.filter(s => s !== subjectId)
        : [...prev, subjectId]
    );
  };

  const selectAllGrades = () => setSelectedGrades([5, 6, 7, 8, 9, 10]);
  const deselectAllGrades = () => setSelectedGrades([]);
  
  const selectAllClasses = () => setSelectedClasses(classes.map(c => c.id));
  const deselectAllClasses = () => setSelectedClasses([]);
  
  const selectAllSubjects = () => setSelectedSubjects(subjects.map(s => s.id));
  const deselectAllSubjects = () => setSelectedSubjects([]);

  // Update assignment
  const updateAssignment = (classId: string, subjectId: string, teacherId: string | null, hours: number = 2) => {
    const existingAssignment = getAssignment(classId, subjectId);

    if (teacherId === null || teacherId === '') {
      // Delete assignment
      if (existingAssignment) {
        deleteAssignmentMutation.mutate(existingAssignment.id);
      }
    } else if (existingAssignment) {
      // Update existing assignment
      updateAssignmentMutation.mutate({
        id: existingAssignment.id,
        teacherId,
        hoursPerWeek: hours
      });
    } else {
      // Create new assignment
      createAssignmentMutation.mutate({
        teacherId,
        classId,
        subjectId,
        hoursPerWeek: hours,
        semester: selectedSemester
      });
    }
  };

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
              <p className="text-muted-foreground">Matrix-Übersicht für alle Lehrer, Klassen und Fächer</p>
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Filter & Einstellungen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Jahrgangsstufen Filter */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">Jahrgangsstufen</Label>
                      <div className="space-x-2">
                        <Button variant="outline" size="sm" onClick={selectAllGrades} data-testid="button-select-all-grades">
                          Alle wählen
                        </Button>
                        <Button variant="outline" size="sm" onClick={deselectAllGrades} data-testid="button-deselect-all-grades">
                          Keine wählen
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {[5, 6, 7, 8, 9, 10].map(grade => (
                        <div key={grade} className="flex items-center space-x-2">
                          <Checkbox
                            id={`grade-${grade}`}
                            checked={selectedGrades.includes(grade)}
                            onCheckedChange={() => toggleGrade(grade)}
                            data-testid={`checkbox-grade-${grade}`}
                          />
                          <Label htmlFor={`grade-${grade}`} className="text-sm">
                            Jahrgang {grade}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Klassen Filter */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">Klassen</Label>
                      <div className="space-x-2">
                        <Button variant="outline" size="sm" onClick={selectAllClasses} data-testid="button-select-all-classes">
                          Alle wählen
                        </Button>
                        <Button variant="outline" size="sm" onClick={deselectAllClasses} data-testid="button-deselect-all-classes">
                          Keine wählen
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                      {classes.map(classData => (
                        <div key={classData.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`class-${classData.id}`}
                            checked={selectedClasses.includes(classData.id)}
                            onCheckedChange={() => toggleClass(classData.id)}
                            data-testid={`checkbox-class-${classData.name}`}
                          />
                          <Label htmlFor={`class-${classData.id}`} className="text-sm">
                            {classData.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fächer Filter */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">Fächer</Label>
                      <div className="space-x-2">
                        <Button variant="outline" size="sm" onClick={selectAllSubjects} data-testid="button-select-all-subjects">
                          Alle wählen
                        </Button>
                        <Button variant="outline" size="sm" onClick={deselectAllSubjects} data-testid="button-deselect-all-subjects">
                          Keine wählen
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-32 overflow-y-auto">
                      {subjects.map(subject => (
                        <div key={subject.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`subject-${subject.id}`}
                            checked={selectedSubjects.includes(subject.id)}
                            onCheckedChange={() => toggleSubject(subject.id)}
                            data-testid={`checkbox-subject-${subject.shortName}`}
                          />
                          <Label htmlFor={`subject-${subject.id}`} className="text-sm">
                            {subject.shortName}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                {/* Assignment Matrix - Simplified */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Grid3X3 className="h-5 w-5" />
                      Zuordnungsmatrix - {selectedSemester === "1" ? "1. Halbjahr" : "2. Halbjahr"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        {filteredClasses.length} Klassen × {filteredSubjects.length} Fächer
                      </div>
                      
                      {/* Improved List View with pagination */}
                      <div className="space-y-4">
                        {(showAllClasses ? filteredClasses : filteredClasses.slice(0, 10)).map(classData => (
                          <Card key={classData.id} className="p-4">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h3 className="font-semibold">{classData.name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {classData.grade}. Jahrgang • {classData.studentCount} Schüler
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {(showAllSubjects ? filteredSubjects : filteredSubjects.slice(0, 12)).map(subject => {
                                const assignment = getAssignment(classData.id, subject.id);
                                const qualifiedTeachers = getQualifiedTeachers(subject.shortName);
                                
                                return (
                                  <div key={subject.id} className="space-y-2">
                                    <Label className="text-sm font-medium">
                                      {subject.shortName} - {subject.name}
                                    </Label>
                                    <Select
                                      value={assignment?.teacherId || 'unassigned'}
                                      onValueChange={(teacherId) => 
                                        updateAssignment(classData.id, subject.id, teacherId === 'unassigned' ? null : teacherId)
                                      }
                                    >
                                      <SelectTrigger className="w-full" data-testid={`select-teacher-${classData.name}-${subject.shortName}`}>
                                        <SelectValue placeholder="Lehrer wählen..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="unassigned">-- Kein Lehrer --</SelectItem>
                                        {(showAllTeachers ? qualifiedTeachers : qualifiedTeachers.slice(0, 15)).map(teacher => {
                                          const workload = getTeacherWorkload(teacher.id);
                                          const status = getWorkloadStatus(workload.percentage);
                                          
                                          return (
                                            <SelectItem key={teacher.id} value={teacher.id}>
                                              <div className="flex items-center gap-2">
                                                <span>{teacher.shortName}</span>
                                                <Badge variant={
                                                  status === 'überlastet' ? 'destructive' :
                                                  status === 'grenzwertig' ? 'secondary' : 'default'
                                                } className="text-xs">
                                                  {workload.percentage.toFixed(0)}%
                                                </Badge>
                                              </div>
                                            </SelectItem>
                                          );
                                        })}
                                      </SelectContent>
                                    </Select>
                                    
                                    {assignment && (
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          min="0.5"
                                          max="10"
                                          step="0.5"
                                          value={assignment.hoursPerWeek}
                                          onChange={(e) => {
                                            const hours = parseFloat(e.target.value);
                                            if (hours >= 0.5 && hours <= 10) {
                                              updateAssignment(classData.id, subject.id, assignment.teacherId, hours);
                                            }
                                          }}
                                          className="w-20 text-sm"
                                          data-testid={`input-hours-${classData.name}-${subject.shortName}`}
                                        />
                                        <span className="text-sm text-muted-foreground">h/Woche</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            
                            {!showAllSubjects && filteredSubjects.length > 12 && (
                              <div className="mt-4 text-center">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setShowAllSubjects(true)}
                                >
                                  {filteredSubjects.length - 12} weitere Fächer anzeigen
                                </Button>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                      
                      {!showAllClasses && filteredClasses.length > 10 && (
                        <div className="text-center space-y-2">
                          <Button 
                            variant="outline" 
                            onClick={() => setShowAllClasses(true)}
                          >
                            Alle {filteredClasses.length} Klassen anzeigen
                          </Button>
                          <p className="text-sm text-muted-foreground">
                            (Zeige {Math.min(10, filteredClasses.length)} von {filteredClasses.length} Klassen)
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Teacher Workload Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Lehrerbelastung - {selectedSemester === "1" ? "1. Halbjahr" : "2. Halbjahr"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {teachers
                        .filter(t => t.isActive)
                        .slice(0, showAllTeachers ? undefined : 18)
                        .map(teacher => {
                          const workload = getTeacherWorkload(teacher.id);
                          const status = getWorkloadStatus(workload.percentage);
                          
                          return (
                            <div key={teacher.id} className="p-4 border rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">{teacher.shortName}</span>
                                <Badge variant={
                                  status === 'überlastet' ? 'destructive' :
                                  status === 'grenzwertig' ? 'secondary' : 'default'
                                }>
                                  {workload.percentage.toFixed(1)}%
                                </Badge>
                              </div>
                              
                              <div className="text-sm text-muted-foreground mb-2">
                                <div>{workload.assigned.toFixed(1)}h / {workload.max}h</div>
                              </div>
                              
                              <div className="flex items-center gap-1 mb-2">                                
                                {status === 'überlastet' && (
                                  <AlertTriangle className="h-4 w-4 text-red-500" />
                                )}
                                {status === 'grenzwertig' && (
                                  <Clock className="h-4 w-4 text-yellow-500" />
                                )}
                                {status === 'normal' && (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                )}
                              </div>
                              
                              <div className="text-xs text-muted-foreground">
                                <div className="font-medium mb-1">Fächer:</div>
                                <div className="flex flex-wrap gap-1">
                                  {teacher.subjects.map(subject => (
                                    <Badge key={subject} variant="outline" className="text-xs">
                                      {subject}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    
                    {!showAllTeachers && teachers.filter(t => t.isActive).length > 18 && (
                      <div className="text-center mt-4">
                        <Button 
                          variant="outline" 
                          onClick={() => setShowAllTeachers(true)}
                        >
                          Alle {teachers.filter(t => t.isActive).length} Lehrer anzeigen
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}