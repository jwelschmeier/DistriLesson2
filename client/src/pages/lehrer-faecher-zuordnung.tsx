import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Grid3X3, BookOpen } from 'lucide-react';
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
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [subjectFilter, setSubjectFilter] = useState<string>("");

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

  // Initialize with first class
  React.useEffect(() => {
    if (classes.length > 0 && !selectedClass) {
      setSelectedClass(classes[0].id);
    }
  }, [classes, selectedClass]);

  // Filter logic
  const filteredSubjects = useMemo(() => {
    if (!subjectFilter) return subjects;
    return subjects.filter(s => 
      s.shortName.toLowerCase().includes(subjectFilter.toLowerCase()) ||
      s.name.toLowerCase().includes(subjectFilter.toLowerCase())
    );
  }, [subjects, subjectFilter]);

  const selectedClassData = useMemo(() => {
    return classes.find(c => c.id === selectedClass);
  }, [classes, selectedClass]);

  // Assignment lookup
  const getAssignment = (classId: string, subjectId: string) => {
    return assignments.find(a => 
      a.classId === classId && 
      a.subjectId === subjectId && 
      a.semester === selectedSemester
    );
  };

  // Get qualified teachers for a subject
  const getQualifiedTeachers = (subjectShortName: string) => {
    return teachers.filter(teacher => 
      teacher.subjects.some(s => 
        s.toLowerCase() === subjectShortName.toLowerCase() ||
        s.toLowerCase().includes(subjectShortName.toLowerCase())
      )
    );
  };

  // Get required hours from existing assignments or use default
  const getRequiredHours = (subjectId: string) => {
    const existingAssignments = assignments.filter(a => 
      a.classId === selectedClass && a.subjectId === subjectId
    );
    
    if (existingAssignments.length > 0) {
      return parseFloat(existingAssignments[0].hoursPerWeek);
    }
    
    return 2; // Default
  };

  const getAssignedHours = (subjectId: string) => {
    return assignments
      .filter(a => a.classId === selectedClass && a.subjectId === subjectId && a.semester === selectedSemester)
      .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
  };

  // Mutations
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

  // Update assignment
  const updateAssignment = (classId: string, subjectId: string, teacherId: string | null) => {
    const hours = getRequiredHours(subjectId);
    const existingAssignment = getAssignment(classId, subjectId);

    if (teacherId === null || teacherId === '') {
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

  if (!selectedClassData) {
    return (
      <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          <p>Keine Klassen verfügbar</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
      <Sidebar />
      
      <main className="flex-1 overflow-auto p-4">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold">Lehrer-Fächer-Zuordnung</h2>
          </div>
        </div>

        {/* Compact Controls */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-card border rounded-lg">
          <Tabs value={selectedSemester} onValueChange={(value) => setSelectedSemester(value as "1" | "2")}>
            <TabsList className="h-8">
              <TabsTrigger value="1" className="text-xs">1. HJ</TabsTrigger>
              <TabsTrigger value="2" className="text-xs">2. HJ</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Label className="text-sm">Klasse:</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classes.map(classData => (
                  <SelectItem key={classData.id} value={classData.id}>
                    {classData.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm">Filter:</Label>
            <Input 
              placeholder="Fach suchen..." 
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-32 h-8 text-sm"
            />
          </div>

          <div className="text-sm text-muted-foreground">
            {selectedClassData.grade}. Jahrgang • {selectedClassData.studentCount} Schüler
          </div>
        </div>

        {/* Compact Assignment Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {selectedClassData.name} - {selectedSemester === "1" ? "1. Halbjahr" : "2. Halbjahr"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Fach</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-48">Zugewiesener Lehrer</TableHead>
                  <TableHead className="w-20 text-center">Stunden</TableHead>
                  <TableHead className="w-20 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubjects.map(subject => {
                  const assignment = getAssignment(selectedClass, subject.id);
                  const qualifiedTeachers = getQualifiedTeachers(subject.shortName);
                  const requiredHours = getRequiredHours(subject.id);
                  const assignedHours = getAssignedHours(subject.id);
                  const isAssigned = !!assignment;
                  
                  return (
                    <TableRow key={subject.id}>
                      <TableCell className="font-medium">{subject.shortName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{subject.name}</TableCell>
                      <TableCell>
                        <Select
                          value={assignment?.teacherId || 'unassigned'}
                          onValueChange={(teacherId) => 
                            updateAssignment(selectedClass, subject.id, teacherId === 'unassigned' ? null : teacherId)
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Lehrer wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">-- Nicht zugewiesen --</SelectItem>
                            {qualifiedTeachers.map(teacher => (
                              <SelectItem key={teacher.id} value={teacher.id}>
                                {teacher.shortName} - {teacher.firstName} {teacher.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {requiredHours}h
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={isAssigned ? "default" : "secondary"} className="text-xs">
                          {isAssigned ? "✓" : "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}