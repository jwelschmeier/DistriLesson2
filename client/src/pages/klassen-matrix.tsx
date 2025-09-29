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

// Component for individual matrix cells
interface MatrixCellProps {
  teacherId: string;
  subjectId: string; 
  classId: string;
  semester: "1" | "2";
  currentHours: number;
  isQualified: boolean;
  onChange: (hours: number) => void;
}

function MatrixCell({ teacherId, subjectId, classId, semester, currentHours, isQualified, onChange }: MatrixCellProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const hours = value === '' ? 0 : Math.max(0, Math.min(50, parseInt(value) || 0));
    onChange(hours);
  };

  return (
    <Input
      type="number"
      min="0"
      max="50"
      value={currentHours || ''}
      onChange={handleChange}
      className={`w-16 text-center text-sm ${
        !isQualified 
          ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' 
          : currentHours > 0 
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
            : 'bg-background'
      }`}
      placeholder="0"
      data-testid={`input-hours-${teacherId}-${subjectId}-${classId}-${semester}`}
    />
  );
}

export default function KlassenMatrix() {
  const params = useParams();
  const classId = params.classId as string;
  const { toast } = useToast();
  
  // Local state for unsaved changes per semester
  const [changes1, setChanges1] = useState<Record<string, number>>({});
  const [changes2, setChanges2] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

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

  // Load assignments for both semesters in parallel (class-specific)
  const { data: assignments1 = [] } = useQuery<Assignment[]>({ 
    queryKey: ['/api/assignments', classId, '1'],
    queryFn: () => fetch(`/api/assignments?minimal=true&classId=${classId}&semester=1`).then(res => res.json()),
    enabled: !!classId,
    staleTime: 30000
  });

  const { data: assignments2 = [] } = useQuery<Assignment[]>({ 
    queryKey: ['/api/assignments', classId, '2'],
    queryFn: () => fetch(`/api/assignments?minimal=true&classId=${classId}&semester=2`).then(res => res.json()),
    enabled: !!classId,
    staleTime: 30000
  });

  // Determine which teachers are qualified for each subject
  const qualifiedTeachers = useMemo(() => {
    const qualifications: Record<string, boolean> = {};
    teachers.forEach(teacher => {
      subjects.forEach(subject => {
        const key = `${teacher.id}-${subject.id}`;
        qualifications[key] = teacher.subjects.includes(subject.shortName);
      });
    });
    return qualifications;
  }, [teachers, subjects]);

  // Create matrices for both semesters
  const createMatrix = (assignments: Assignment[], changes: Record<string, number>) => {
    const matrix: Record<string, number> = {};
    
    // Fill with existing assignments
    assignments.forEach(assignment => {
      const key = `${assignment.teacherId}-${assignment.subjectId}`;
      matrix[key] = parseFloat(assignment.hoursPerWeek);
    });
    
    // Apply local changes
    Object.entries(changes).forEach(([key, hours]) => {
      matrix[key] = hours;
    });
    
    return matrix;
  };

  const matrix1 = createMatrix(assignments1, changes1);
  const matrix2 = createMatrix(assignments2, changes2);

  // Handle cell changes
  const handleCellChange = (semester: "1" | "2", teacherId: string, subjectId: string, hours: number) => {
    const key = `${teacherId}-${subjectId}`;
    if (semester === "1") {
      setChanges1(prev => ({ ...prev, [key]: hours }));
    } else {
      setChanges2(prev => ({ ...prev, [key]: hours }));
    }
  };

  // Save changes for both semesters
  const saveChanges = useMutation({
    mutationFn: async () => {
      setSaving(true);
      const allChanges = [
        ...Object.entries(changes1).map(([key, hours]) => ({ key: key.split('-'), semester: '1', hours })),
        ...Object.entries(changes2).map(([key, hours]) => ({ key: key.split('-'), semester: '2', hours }))
      ];

      for (const change of allChanges) {
        const [teacherId, subjectId] = change.key;
        await apiRequest('POST', '/api/assignments', {
          teacherId,
          subjectId,
          classId,
          semester: change.semester,
          hoursPerWeek: change.hours.toString()
        });
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
                  <h2 className="text-2xl font-semibold text-foreground">
                    Lehrer-Fächer-Zuordnung: {selectedClass.name}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {selectedClass.studentCount} Schüler
                    </span>
                    <Badge variant="outline">{selectedClass.grade}. Jahrgang</Badge>
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

          {/* Two-Column Matrix Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Semester 1 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                1. Halbjahr
                {Object.keys(changes1).length > 0 && (
                  <Badge variant="secondary">{Object.keys(changes1).length} Änderungen</Badge>
                )}
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border-b border-r p-3 text-left font-medium text-sm">Lehrer</th>
                        {subjects.map(subject => (
                          <th key={subject.id} className="border-b border-r p-2 text-center text-xs font-medium min-w-[4rem]">
                            {subject.shortName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map(teacher => (
                        <tr key={teacher.id} className="hover:bg-muted/25">
                          <td className="border-b border-r p-3 font-medium text-sm bg-muted/25">
                            {teacher.shortName}
                          </td>
                          {subjects.map(subject => {
                            const key = `${teacher.id}-${subject.id}`;
                            const isQualified = qualifiedTeachers[key] || false;
                            const hours = matrix1[key] || 0;
                            
                            return (
                              <td key={subject.id} className="border-b border-r p-2 text-center">
                                <MatrixCell
                                  teacherId={teacher.id}
                                  subjectId={subject.id}
                                  classId={classId}
                                  semester="1"
                                  currentHours={hours}
                                  isQualified={isQualified}
                                  onChange={(hours) => handleCellChange("1", teacher.id, subject.id, hours)}
                                />
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

            {/* Semester 2 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                2. Halbjahr
                {Object.keys(changes2).length > 0 && (
                  <Badge variant="secondary">{Object.keys(changes2).length} Änderungen</Badge>
                )}
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border-b border-r p-3 text-left font-medium text-sm">Lehrer</th>
                        {subjects.map(subject => (
                          <th key={subject.id} className="border-b border-r p-2 text-center text-xs font-medium min-w-[4rem]">
                            {subject.shortName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map(teacher => (
                        <tr key={teacher.id} className="hover:bg-muted/25">
                          <td className="border-b border-r p-3 font-medium text-sm bg-muted/25">
                            {teacher.shortName}
                          </td>
                          {subjects.map(subject => {
                            const key = `${teacher.id}-${subject.id}`;
                            const isQualified = qualifiedTeachers[key] || false;
                            const hours = matrix2[key] || 0;
                            
                            return (
                              <td key={subject.id} className="border-b border-r p-2 text-center">
                                <MatrixCell
                                  teacherId={teacher.id}
                                  subjectId={subject.id}
                                  classId={classId}
                                  semester="2"
                                  currentHours={hours}
                                  isQualified={isQualified}
                                  onChange={(hours) => handleCellChange("2", teacher.id, subject.id, hours)}
                                />
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
        </div>
      </main>
    </div>
  );
}