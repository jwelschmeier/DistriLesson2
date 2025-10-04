import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Class, Teacher, Subject, Assignment } from "@shared/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, BookOpen, Save, RotateCcw } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

type AssignmentData = Assignment & { id: string };

export default function DiffKurseMatrix() {
  const { toast } = useToast();
  const [changes1, setChanges1] = useState<Record<string, string | null>>({});
  const [changes2, setChanges2] = useState<Record<string, string | null>>({});

  // Differenzierungsfächer
  const DIFF_SUBJECTS = ['FS', 'SW', 'NW', 'IF', 'TC', 'MUS'];

  // Load data
  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({ 
    queryKey: ['/api/classes'] 
  });

  const { data: teachers = [], isLoading: teachersLoading } = useQuery<Teacher[]>({ 
    queryKey: ['/api/teachers'] 
  });

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({ 
    queryKey: ['/api/subjects'] 
  });

  const { data: assignments1 = [], isLoading: assignments1Loading } = useQuery<AssignmentData[]>({ 
    queryKey: ['/api/assignments', '1'],
    queryFn: () => fetch(`/api/assignments?semester=1`).then(res => res.json())
  });

  const { data: assignments2 = [], isLoading: assignments2Loading } = useQuery<AssignmentData[]>({ 
    queryKey: ['/api/assignments', '2'],
    queryFn: () => fetch(`/api/assignments?semester=2`).then(res => res.json())
  });

  const isLoading = classesLoading || teachersLoading || subjectsLoading || assignments1Loading || assignments2Loading;

  // Filter: Only Diff-Kurse from grades 7-10
  const diffKurse = useMemo(() => {
    return classes.filter(c => {
      if (c.type !== 'kurs') return false;
      if (c.grade < 7 || c.grade > 10) return false;
      
      // Match patterns like "10FS", "10INF_IF", "07TC1", "07TC2"
      const match = c.name.match(/^\d{2}([A-Z_0-9]+)$/i);
      if (!match) return false;
      
      // Extract subject: take part after underscore if present, otherwise remove trailing digits
      const extracted = match[1].toUpperCase();
      const underscoreIndex = extracted.indexOf('_');
      const subject = underscoreIndex !== -1 
        ? extracted.substring(underscoreIndex + 1) 
        : extracted.replace(/\d+$/, ''); // Remove trailing digits like "TC1" -> "TC"
      
      return DIFF_SUBJECTS.includes(subject);
    }).sort((a, b) => {
      if (a.grade !== b.grade) return a.grade - b.grade;
      return a.name.localeCompare(b.name);
    });
  }, [classes]);

  // Filter: Only Diff subjects
  const diffSubjects = useMemo(() => {
    return subjects.filter(s => DIFF_SUBJECTS.includes(s.shortName.toUpperCase()))
      .sort((a, b) => {
        const indexA = DIFF_SUBJECTS.indexOf(a.shortName.toUpperCase());
        const indexB = DIFF_SUBJECTS.indexOf(b.shortName.toUpperCase());
        return indexA - indexB;
      });
  }, [subjects]);

  // Group by grade
  const kurseByGrade = useMemo(() => {
    const grouped: Record<number, Class[]> = {};
    diffKurse.forEach(kurs => {
      if (!grouped[kurs.grade]) {
        grouped[kurs.grade] = [];
      }
      grouped[kurs.grade].push(kurs);
    });
    return grouped;
  }, [diffKurse]);

  const grades = Object.keys(kurseByGrade)
    .map(Number)
    .sort((a, b) => a - b);

  // Helper: Get subject from course name
  const getSubjectFromCourseName = (courseName: string): string | null => {
    // Match patterns like "10FS", "10INF_IF", "07TC1", "07TC2"
    const match = courseName.match(/^\d{2}([A-Z_0-9]+)$/i);
    if (!match) return null;
    
    // Extract subject: take part after underscore if present, otherwise remove trailing digits
    const extracted = match[1].toUpperCase();
    const underscoreIndex = extracted.indexOf('_');
    return underscoreIndex !== -1 
      ? extracted.substring(underscoreIndex + 1)  // "INF_IF" -> "IF"
      : extracted.replace(/\d+$/, '');            // "TC1" -> "TC", "TC2" -> "TC"
  };

  // Helper: Get current teacher (with changes)
  const getCurrentTeacher = (classId: string, subjectId: string, semester: "1" | "2"): string | null => {
    const key = `${classId}::${subjectId}`;
    const changes = semester === "1" ? changes1 : changes2;
    const assignments = semester === "1" ? assignments1 : assignments2;
    
    if (key in changes) {
      return changes[key];
    }
    
    const assignment = assignments.find(a => a.classId === classId && a.subjectId === subjectId);
    return assignment?.teacherId || null;
  };

  // Helper: Calculate teacher workload
  const getTeacherWorkload = (teacherId: string, semester: "1" | "2") => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return { assigned: 0, total: 0 };

    const changes = semester === "1" ? changes1 : changes2;
    const assignments = semester === "1" ? assignments1 : assignments2;

    let assigned = 0;
    
    // Count from assignments
    assignments.forEach(a => {
      if (a.teacherId === teacherId) {
        assigned += parseFloat(a.hoursPerWeek) || 0;
      }
    });

    // Apply changes
    Object.entries(changes).forEach(([key, newTeacherId]) => {
      const [classId, subjectId] = key.split('::');
      const oldAssignment = assignments.find(a => a.classId === classId && a.subjectId === subjectId);
      
      if (oldAssignment?.teacherId === teacherId && newTeacherId !== teacherId) {
        assigned -= parseFloat(oldAssignment.hoursPerWeek) || 0;
      }
      
      if (newTeacherId === teacherId && oldAssignment?.teacherId !== teacherId) {
        assigned += parseFloat(oldAssignment?.hoursPerWeek || '2') || 2;
      }
    });

    return {
      assigned: Math.round(assigned * 10) / 10,
      total: parseFloat(teacher.maxHours)
    };
  };

  // Handle teacher change
  const handleTeacherChange = (classId: string, semester: "1" | "2", subjectId: string, teacherId: string | null) => {
    const key = `${classId}::${subjectId}`;
    if (semester === "1") {
      setChanges1(prev => ({ ...prev, [key]: teacherId }));
    } else {
      setChanges2(prev => ({ ...prev, [key]: teacherId }));
    }
  };

  const hasChanges = Object.keys(changes1).length > 0 || Object.keys(changes2).length > 0;

  // Save mutation
  const saveChanges = useMutation({
    mutationFn: async () => {
      const allChanges = [
        ...Object.entries(changes1).map(([key, teacherId]) => ({ key, teacherId, semester: "1" as const })),
        ...Object.entries(changes2).map(([key, teacherId]) => ({ key, teacherId, semester: "2" as const }))
      ];

      for (const { key, teacherId, semester } of allChanges) {
        const [classId, subjectId] = key.split('::');
        const assignments = semester === "1" ? assignments1 : assignments2;
        const existing = assignments.find(a => a.classId === classId && a.subjectId === subjectId);

        if (teacherId === null) {
          if (existing) {
            await apiRequest('DELETE', `/api/assignments/${existing.id}`, undefined);
          }
        } else {
          const subject = subjects.find(s => s.id === subjectId);
          const hoursPerWeek = existing?.hoursPerWeek || '2';

          if (existing) {
            await apiRequest('PATCH', `/api/assignments/${existing.id}`, {
              teacherId,
              hoursPerWeek: parseFloat(hoursPerWeek)
            });
          } else {
            await apiRequest('POST', '/api/assignments', {
              teacherId,
              classId,
              subjectId,
              hoursPerWeek: parseFloat(hoursPerWeek),
              semester
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments'] });
      setChanges1({});
      setChanges2({});
      toast({ title: "Gespeichert", description: "Alle Änderungen wurden erfolgreich gespeichert." });
    },
    onError: (error: any) => {
      console.error("Save error:", error);
      toast({ 
        title: "Fehler", 
        description: error?.message || "Änderungen konnten nicht gespeichert werden.",
        variant: "destructive"
      });
    }
  });

  const resetChanges = () => {
    setChanges1({});
    setChanges2({});
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
        <Sidebar />
        <main className="flex-1 overflow-auto flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <span className="ml-3 text-muted-foreground">Laden...</span>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/lehrer-faecher-zuordnung/select">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück zur Klassenauswahl
                </Button>
              </Link>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                <div>
                  <h2 className="text-2xl font-semibold text-foreground">Diff-Kurse Zuordnung</h2>
                  <p className="text-sm text-muted-foreground">Jahrgänge 7-10 · Differenzierungsfächer</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  onClick={resetChanges}
                  disabled={saveChanges.isPending}
                  data-testid="button-reset"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Zurücksetzen
                </Button>
              )}
              <Button
                onClick={() => saveChanges.mutate()}
                disabled={!hasChanges || saveChanges.isPending}
                data-testid="button-save"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveChanges.isPending ? 'Speichert...' : 'Speichern'}
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6">
          {diffKurse.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                  Keine Diff-Kurse gefunden
                </h3>
                <p className="text-sm text-muted-foreground">
                  Erstellen Sie Differenzierungskurse für die Jahrgänge 7-10
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {grades.map(grade => (
                <div key={grade} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold">{grade}. Jahrgang</h3>
                    <Badge variant="secondary">{kurseByGrade[grade].length} Kurse</Badge>
                  </div>

                  <div className="border rounded-lg overflow-x-auto">
                    <div>
                      <table className="min-w-max border-collapse">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="border-b border-r p-3 text-left font-medium bg-slate-200 dark:bg-slate-700">KURS</th>
                            {diffSubjects.map((subject, index) => (
                              <th 
                                key={subject.id} 
                                className={`border-b border-r p-3 text-center text-sm font-medium min-w-[140px] ${
                                  index % 2 === 0 
                                    ? 'bg-amber-100 dark:bg-amber-900/50' 
                                    : 'bg-orange-100 dark:bg-orange-900/50'
                                }`}
                              >
                                {subject.shortName.toUpperCase()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {kurseByGrade[grade].map(kurs => {
                            const kursSubject = getSubjectFromCourseName(kurs.name);
                            
                            return (
                              <tr key={kurs.id} className="hover:bg-muted/25">
                                <td className="border-b border-r p-4 font-semibold text-lg bg-slate-100 dark:bg-slate-800">
                                  {kurs.name}
                                </td>
                                {diffSubjects.map((subject, index) => {
                                  // Only show dropdown if this subject matches the course
                                  const isRelevant = kursSubject === subject.shortName.toUpperCase();
                                  
                                  if (!isRelevant) {
                                    return (
                                      <td 
                                        key={subject.id} 
                                        className={`border-b border-r p-2 text-center ${
                                          index % 2 === 0 
                                            ? 'bg-amber-50 dark:bg-amber-900/30' 
                                            : 'bg-orange-50 dark:bg-orange-900/30'
                                        }`}
                                      >
                                        <span className="text-muted-foreground text-xs">—</span>
                                      </td>
                                    );
                                  }

                                  const qualifiedTeachers = teachers.filter(t => 
                                    t.subjects.includes(subject.shortName)
                                  );
                                  const currentTeacher1 = getCurrentTeacher(kurs.id, subject.id, "1");
                                  const currentTeacher2 = getCurrentTeacher(kurs.id, subject.id, "2");

                                  return (
                                    <td 
                                      key={subject.id} 
                                      className={`border-b border-r p-2 text-center ${
                                        index % 2 === 0 
                                          ? 'bg-amber-50 dark:bg-amber-900/30' 
                                          : 'bg-orange-50 dark:bg-orange-900/30'
                                      }`}
                                    >
                                      <div className="space-y-2">
                                        {/* 1. Halbjahr */}
                                        <div className="text-xs text-muted-foreground font-medium">1. HJ</div>
                                        <Select
                                          value={currentTeacher1 || 'unassigned'}
                                          onValueChange={(teacherId) => 
                                            handleTeacherChange(kurs.id, "1", subject.id, teacherId === 'unassigned' ? null : teacherId)
                                          }
                                          data-testid={`select-teacher-${kurs.id}-${subject.id}-semester-1`}
                                        >
                                          <SelectTrigger className="w-full h-8 text-xs">
                                            <SelectValue placeholder="--" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="unassigned">--</SelectItem>
                                            {qualifiedTeachers.map(teacher => {
                                              const workload = getTeacherWorkload(teacher.id, "1");
                                              return (
                                                <SelectItem key={teacher.id} value={teacher.id}>
                                                  {teacher.shortName} ({workload.assigned}/{workload.total}h)
                                                </SelectItem>
                                              );
                                            })}
                                          </SelectContent>
                                        </Select>
                                        
                                        {/* 2. Halbjahr */}
                                        <div className="text-xs text-muted-foreground font-medium">2. HJ</div>
                                        <Select
                                          value={currentTeacher2 || 'unassigned'}
                                          onValueChange={(teacherId) => 
                                            handleTeacherChange(kurs.id, "2", subject.id, teacherId === 'unassigned' ? null : teacherId)
                                          }
                                          data-testid={`select-teacher-${kurs.id}-${subject.id}-semester-2`}
                                        >
                                          <SelectTrigger className="w-full h-8 text-xs">
                                            <SelectValue placeholder="--" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="unassigned">--</SelectItem>
                                            {qualifiedTeachers.map(teacher => {
                                              const workload = getTeacherWorkload(teacher.id, "2");
                                              return (
                                                <SelectItem key={teacher.id} value={teacher.id}>
                                                  {teacher.shortName} ({workload.assigned}/{workload.total}h)
                                                </SelectItem>
                                              );
                                            })}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </td>
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
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
