import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/sidebar';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Grid3X3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Teacher, Class, Subject, Assignment } from '@shared/schema';

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
    queryFn: () => fetch(`/api/assignments?semester=${selectedSemester}`).then(res => res.json())
  });

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

  // Update assignment
  const updateAssignment = (classId: string, subjectId: string, teacherId: string | null) => {
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
              </div>

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