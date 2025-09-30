import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Teacher, Class, Subject, Assignment } from "@shared/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Users, BookOpen, Save, RotateCcw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";


export default function KlassenMatrix() {
  const params = useParams();
  const classId = params.classId as string;
  const { toast } = useToast();
  
  // Local state for unsaved changes per semester (subjectId-semester -> teacherId)
  const [changes1, setChanges1] = useState<Record<string, string | null>>({});
  const [changes2, setChanges2] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "jahrgang">("single");

  // Get the selected class info
  const { data: selectedClass } = useQuery<Class>({
    queryKey: ['/api/classes', classId],
    queryFn: () => fetch(`/api/classes/${classId}`).then(res => res.json()),
    enabled: !!classId
  });

  // Load teachers and subjects (cached globally)
  const { data: teachers = [] } = useQuery<Teacher[]>({ 
    queryKey: ['/api/teachers'],
    select: (data: Teacher[]) => data.filter(t => t.isActive),
    staleTime: 60000
  });

  const { data: subjects = [] } = useQuery<Subject[]>({ 
    queryKey: ['/api/subjects'],
    staleTime: 60000
  });

  // Load all classes of the same grade for jahrgang view
  const { data: allClasses = [] } = useQuery<Class[]>({
    queryKey: ['/api/classes'],
    staleTime: 60000
  });

  const jahrgangClasses = useMemo(() => {
    if (!selectedClass) return [];
    return allClasses
      .filter(c => c.grade === selectedClass.grade && c.type === 'klasse')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allClasses, selectedClass]);

  // Load assignments for both semesters
  // In jahrgang mode, load for entire grade; in single mode, load for specific class
  const { data: assignments1 = [] } = useQuery<Assignment[]>({ 
    queryKey: viewMode === "jahrgang" ? ['/api/assignments', selectedClass?.grade, '1'] : ['/api/assignments', classId, '1'],
    queryFn: () => {
      if (viewMode === "jahrgang" && selectedClass) {
        return fetch(`/api/assignments?minimal=true&semester=1`).then(res => res.json())
          .then((data: Assignment[]) => data.filter(a => {
            const assignmentClass = allClasses.find(c => c.id === a.classId);
            return assignmentClass && assignmentClass.grade === selectedClass.grade;
          }));
      }
      return fetch(`/api/assignments?minimal=true&classId=${classId}&semester=1`).then(res => res.json());
    },
    enabled: !!classId || (!!selectedClass && viewMode === "jahrgang"),
    staleTime: 30000
  });

  const { data: assignments2 = [] } = useQuery<Assignment[]>({ 
    queryKey: viewMode === "jahrgang" ? ['/api/assignments', selectedClass?.grade, '2'] : ['/api/assignments', classId, '2'],
    queryFn: () => {
      if (viewMode === "jahrgang" && selectedClass) {
        return fetch(`/api/assignments?minimal=true&semester=2`).then(res => res.json())
          .then((data: Assignment[]) => data.filter(a => {
            const assignmentClass = allClasses.find(c => c.id === a.classId);
            return assignmentClass && assignmentClass.grade === selectedClass.grade;
          }));
      }
      return fetch(`/api/assignments?minimal=true&classId=${classId}&semester=2`).then(res => res.json());
    },
    enabled: !!classId || (!!selectedClass && viewMode === "jahrgang"),
    staleTime: 30000
  });

  // Subject order for consistent display
  const SUBJECT_ORDER = ['D', 'M', 'E', 'Fs', 'SW', 'PK', 'GE', 'EK', 'BI', 'PH', 'CH', 'TC', 'If', 'HW', 'KU', 'MU', 'Tx', 'ER', 'KR', 'PP', 'SO', 'BO', 'SP'];
  
  // Sort subjects according to predefined order
  const sortedSubjects = useMemo(() => {
    return subjects
      .filter(subject => SUBJECT_ORDER.includes(subject.shortName))
      .sort((a, b) => {
        const indexA = SUBJECT_ORDER.indexOf(a.shortName);
        const indexB = SUBJECT_ORDER.indexOf(b.shortName);
        return indexA - indexB;
      });
  }, [subjects]);

  // Get current teacher for a subject, semester, and class (considering local changes)
  const getCurrentTeacher = (classItemId: string, subjectId: string, semester: "1" | "2") => {
    const key = `${classItemId}-${subjectId}-${semester}`;
    const localChange = semester === "1" ? changes1[key] : changes2[key];
    
    if (localChange !== undefined) {
      return localChange;
    }
    
    // Fall back to existing assignments
    const assignments = semester === "1" ? assignments1 : assignments2;
    const assignment = assignments.find(a => a.subjectId === subjectId && a.classId === classItemId);
    return assignment?.teacherId || null;
  };

  // Handle teacher assignment changes
  const handleTeacherChange = (classItemId: string, semester: "1" | "2", subjectId: string, teacherId: string | null) => {
    const key = `${classItemId}-${subjectId}-${semester}`;
    if (semester === "1") {
      setChanges1(prev => ({ ...prev, [key]: teacherId }));
    } else {
      setChanges2(prev => ({ ...prev, [key]: teacherId }));
    }
  };

  // Save changes for both semesters
  const saveChanges = useMutation({
    mutationFn: async () => {
      setSaving(true);
      const allChanges = [
        ...Object.entries(changes1).map(([key, teacherId]) => ({ 
          key,
          semester: '1', 
          teacherId 
        })),
        ...Object.entries(changes2).map(([key, teacherId]) => ({ 
          key,
          semester: '2', 
          teacherId 
        }))
      ];

      for (const change of allChanges) {
        const [changeClassId, changeSubjectId] = change.key.split('-');
        if (change.teacherId) {
          // Create or update assignment
          await apiRequest('POST', '/api/assignments', {
            teacherId: change.teacherId,
            subjectId: changeSubjectId,
            classId: changeClassId,
            semester: change.semester,
            hoursPerWeek: "1" // Default to 1 hour
          });
        } else {
          // TODO: Delete assignment if teacherId is null
          // This would require an API endpoint to delete assignments
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments', classId] });
      setChanges1({});
      setChanges2({});
      toast({ title: "Erfolgreich gespeichert", description: "Alle Änderungen wurden übernommen." });
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast({ title: "Fehler beim Speichern", description: "Bitte versuchen Sie es erneut.", variant: "destructive" });
    },
    onSettled: () => {
      setSaving(false);
    }
  });

  const hasChanges = Object.keys(changes1).length > 0 || Object.keys(changes2).length > 0;

  const resetChanges = () => {
    setChanges1({});
    setChanges2({});
  };

  if (!selectedClass) {
    return (
      <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-muted-foreground">Klasse wird geladen...</p>
          </div>
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
                <BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-2xl font-semibold text-foreground">Lehrer-Fächer-Zuordnung</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge variant="default" className="text-base px-3 py-1">
                      {viewMode === "single" ? selectedClass.name : `${selectedClass.grade}. Jahrgang`}
                    </Badge>
                    {viewMode === "single" && (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {selectedClass.studentCount} Schüler
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  onClick={resetChanges}
                  disabled={saving}
                  data-testid="button-reset"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Zurücksetzen
                </Button>
              )}
              <Button
                onClick={() => saveChanges.mutate()}
                disabled={!hasChanges || saving}
                data-testid="button-save"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Speichert...' : 'Speichern'}
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6">
          {/* View Mode Selector */}
          <div className="mb-6 flex items-center gap-3">
            <span className="text-sm font-medium">Ansicht:</span>
            <div className="flex gap-2">
              <Button
                variant={viewMode === "single" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("single")}
                data-testid="button-view-single"
              >
                Einzelklasse
              </Button>
              <Button
                variant={viewMode === "jahrgang" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("jahrgang")}
                data-testid="button-view-jahrgang"
              >
                Ganzer Jahrgang
              </Button>
            </div>
          </div>

          {/* Semester Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">1. Halbjahr</CardTitle>
                <CardDescription>Soll: {selectedClass.targetHoursSemester1 || 'Nicht definiert'} Stunden</CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">2. Halbjahr</CardTitle>
                <CardDescription>Soll: {selectedClass.targetHoursSemester2 || 'Nicht definiert'} Stunden</CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Single Matrix Layout - Subjects Horizontal */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold">Lehrer-Fächer-Zuordnung</h3>
              {(Object.keys(changes1).length > 0 || Object.keys(changes2).length > 0) && (
                <Badge variant="secondary">
                  {Object.keys(changes1).length + Object.keys(changes2).length} Änderungen
                </Badge>
              )}
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border-b border-r p-3 text-left font-medium">KLASSE</th>
                      {sortedSubjects.map(subject => (
                        <th key={subject.id} className="border-b border-r p-3 text-center text-sm font-medium min-w-[140px]">
                          {subject.shortName.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(viewMode === "single" ? [selectedClass] : jahrgangClasses).map((classItem) => (
                      <tr key={classItem.id} className="hover:bg-muted/25">
                        <td className="border-b border-r p-4 font-semibold text-lg bg-muted/25">
                          {classItem.name}
                        </td>
                        {sortedSubjects.map(subject => {
                        // Get teachers qualified for this subject
                        const qualifiedForSubject = teachers.filter(teacher => 
                          teacher.subjects.includes(subject.shortName)
                        );
                        
                        // Get current teacher assignments (considering local changes)
                        const currentTeacher1 = getCurrentTeacher(classItem.id, subject.id, "1");
                        const currentTeacher2 = getCurrentTeacher(classItem.id, subject.id, "2");
                        
                        return (
                          <td key={subject.id} className="border-b border-r p-2 text-center">
                            <div className="space-y-2">
                              {/* 1. Halbjahr */}
                              <div className="text-xs text-muted-foreground font-medium">1. HJ</div>
                              <Select
                                value={currentTeacher1 || 'unassigned'}
                                onValueChange={(teacherId) => 
                                  handleTeacherChange(classItem.id, "1", subject.id, teacherId === 'unassigned' ? null : teacherId)
                                }
                                data-testid={`select-teacher-${classItem.id}-${subject.id}-semester-1`}
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue placeholder="--" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">--</SelectItem>
                                  {qualifiedForSubject.map(teacher => (
                                    <SelectItem key={teacher.id} value={teacher.id}>
                                      {teacher.shortName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              
                              {/* 2. Halbjahr */}
                              <div className="text-xs text-muted-foreground font-medium">2. HJ</div>
                              <Select
                                value={currentTeacher2 || 'unassigned'}
                                onValueChange={(teacherId) => 
                                  handleTeacherChange(classItem.id, "2", subject.id, teacherId === 'unassigned' ? null : teacherId)
                                }
                                data-testid={`select-teacher-${classItem.id}-${subject.id}-semester-2`}
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue placeholder="--" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">--</SelectItem>
                                  {qualifiedForSubject.map(teacher => (
                                    <SelectItem key={teacher.id} value={teacher.id}>
                                      {teacher.shortName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                        );
                      })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}