import { useState, useMemo } from 'react';
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
  const [filterGrade, setFilterGrade] = useState<string>('alle');
  const [filterSubject, setFilterSubject] = useState<string>('alle');

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
    select: (data) => data.sort((a, b) => a.name.localeCompare(b.name))
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
      toast({ title: "Zuordnung aktualisiert", description: "Die Änderungen wurden gespeichert." });
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

  // Filter logic
  const filteredClasses = useMemo(() => {
    if (filterGrade === 'alle') return classes;
    return classes.filter(c => c.grade.toString() === filterGrade);
  }, [classes, filterGrade]);

  const filteredSubjects = useMemo(() => {
    if (filterSubject === 'alle') return subjects;
    return subjects.filter(s => s.id === filterSubject);
  }, [subjects, filterSubject]);

  // Assignment lookup with semester filtering on client side as backup
  const getAssignment = (classId: string, subjectId: string) => {
    return assignments.find(a => 
      a.classId === classId && 
      a.subjectId === subjectId && 
      a.semester === selectedSemester
    );
  };

  // Get teachers qualified for a subject
  const getQualifiedTeachers = (subjectShortName: string) => {
    return teachers.filter(teacher => 
      teacher.subjects.some(s => 
        s.toLowerCase() === subjectShortName.toLowerCase() ||
        s.toLowerCase().includes(subjectShortName.toLowerCase())
      )
    );
  };

  // Teacher workload calculation
  const getTeacherWorkload = (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return { assigned: 0, max: 25, percentage: 0 };

    const assigned = assignments
      .filter(a => a.teacherId === teacherId && a.semester === selectedSemester)
      .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
    
    const max = parseFloat(teacher.maxHours);
    const percentage = (assigned / max) * 100;

    return { assigned, max, percentage };
  };

  const getWorkloadStatus = (percentage: number) => {
    if (percentage > 100) return 'überlastet';
    if (percentage > 90) return 'grenzwertig';
    return 'normal';
  };

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
                <CardContent className="flex flex-wrap gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="filter-grade">Jahrgangsstufe</Label>
                    <Select value={filterGrade} onValueChange={setFilterGrade}>
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
                    <Select value={filterSubject} onValueChange={setFilterSubject}>
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
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Assignment Matrix */}
                <div className="lg:col-span-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Grid3X3 className="h-5 w-5" />
                        Zuordnungsmatrix - {selectedSemester === "1" ? "1. Halbjahr" : "2. Halbjahr"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-3 font-medium bg-muted/50 dark:bg-muted/20">
                                Klasse
                              </th>
                              {filteredSubjects.map(subject => (
                                <th key={subject.id} className="text-left p-3 font-medium bg-muted/50 dark:bg-muted/20 min-w-32">
                                  <div className="text-sm">
                                    <div className="font-semibold">{subject.shortName}</div>
                                    <div className="text-xs text-muted-foreground">{subject.name}</div>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredClasses.map(classData => (
                              <tr key={classData.id} className="border-b hover:bg-muted/30 dark:hover:bg-muted/10">
                                <td className="p-3 font-medium">
                                  <div className="text-sm">
                                    <div className="font-semibold">{classData.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {classData.studentCount} Schüler
                                    </div>
                                  </div>
                                </td>
                                {filteredSubjects.map(subject => {
                                  const assignment = getAssignment(classData.id, subject.id);
                                  const qualifiedTeachers = getQualifiedTeachers(subject.shortName);
                                  
                                  return (
                                    <td key={subject.id} className="p-3">
                                      <div className="space-y-2">
                                        <Select
                                          value={assignment?.teacherId || ''}
                                          onValueChange={(teacherId) => 
                                            updateAssignment(classData.id, subject.id, teacherId || null)
                                          }
                                        >
                                          <SelectTrigger className="w-full text-xs" data-testid={`select-teacher-${classData.name}-${subject.shortName}`}>
                                            <SelectValue placeholder="--" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="">-- Kein Lehrer --</SelectItem>
                                            {qualifiedTeachers.map(teacher => {
                                              const workload = getTeacherWorkload(teacher.id);
                                              const status = getWorkloadStatus(workload.percentage);
                                              
                                              return (
                                                <SelectItem 
                                                  key={teacher.id} 
                                                  value={teacher.id}
                                                  className={
                                                    status === 'überlastet' ? 'text-red-600 dark:text-red-400' :
                                                    status === 'grenzwertig' ? 'text-yellow-600 dark:text-yellow-400' :
                                                    'text-green-600 dark:text-green-400'
                                                  }
                                                >
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
                                              className="w-16 text-xs h-8"
                                              data-testid={`input-hours-${classData.name}-${subject.shortName}`}
                                            />
                                            <span className="text-xs text-muted-foreground">h</span>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Teacher Workload Overview */}
                <div className="lg:col-span-1">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Lehrerbelastung
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {teachers
                        .sort((a, b) => a.shortName.localeCompare(b.shortName))
                        .map(teacher => {
                          const workload = getTeacherWorkload(teacher.id);
                          const status = getWorkloadStatus(workload.percentage);
                          
                          return (
                            <div key={teacher.id} className="border rounded-lg p-3 space-y-3" data-testid={`workload-${teacher.shortName}`}>
                              <div className="flex justify-between items-center">
                                <div className="font-medium text-sm">{teacher.shortName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {workload.assigned.toFixed(1)}/{workload.max}h
                                </div>
                              </div>
                              
                              <div className="w-full bg-muted rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all ${
                                    status === 'überlastet' ? 'bg-red-500' :
                                    status === 'grenzwertig' ? 'bg-yellow-500' :
                                    'bg-green-500'
                                  }`}
                                  style={{width: `${Math.min(workload.percentage, 100)}%`}}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <Badge variant={
                                  status === 'überlastet' ? 'destructive' :
                                  status === 'grenzwertig' ? 'secondary' : 'default'
                                } className="text-xs">
                                  {workload.percentage.toFixed(1)}%
                                </Badge>
                                
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
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}