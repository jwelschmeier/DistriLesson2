import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs as SemesterTabs, TabsContent as SemesterTabsContent, TabsList as SemesterTabsList, TabsTrigger as SemesterTabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar, Clock, Users, BookOpen, Presentation, School, GraduationCap, Save, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Teacher, type Class, type Subject, type Assignment } from "@shared/schema";

interface ExtendedAssignment extends Assignment {
  teacher?: Teacher;
  class?: Class;
  subject?: Subject;
}

export default function Stundenplaene() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  
  const [activeTab, setActiveTab] = useState<string>("teacher");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedSemester, setSelectedSemester] = useState<'all' | '1' | '2'>('all');
  
  // State for editable table
  const [editedAssignments, setEditedAssignments] = useState<Record<string, Partial<Assignment>>>({});
  const [newAssignment, setNewAssignment] = useState<{
    teacherId: string;
    subjectId: string;
    hoursPerWeek: number;
    semester: "1" | "2";
  } | null>(null);
  const { toast } = useToast();

  const { data: teachers, isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: classes, isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: subjects, isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
  });

  // Mutations for assignment operations
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Assignment> }) => {
      const response = await apiRequest("PUT", `/api/assignments/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Erfolg",
        description: "Zuweisung wurde erfolgreich aktualisiert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Zuweisung konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/assignments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Erfolg",
        description: "Zuweisung wurde erfolgreich gelöscht.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Zuweisung konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (data: {
      teacherId: string;
      classId: string;
      subjectId: string;
      hoursPerWeek: number;
      semester: "1" | "2";
    }) => {
      const response = await apiRequest("POST", "/api/assignments", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      setNewAssignment(null);
      toast({
        title: "Erfolg",
        description: "Neue Zuweisung wurde erstellt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Zuweisung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  // Handle URL query parameters for deep linking
  useEffect(() => {
    const tab = searchParams.get('tab');
    const id = searchParams.get('id');
    
    // Set active tab if specified in URL
    if (tab && (tab === 'teacher' || tab === 'class')) {
      setActiveTab(tab);
    }
    
    // Set selected teacher/class if ID is provided and data is loaded
    if (id) {
      if (tab === 'teacher' && teachers) {
        // Check if the teacher ID exists in the data
        const teacherExists = teachers.find(teacher => teacher.id === id);
        if (teacherExists) {
          setSelectedTeacherId(id);
        }
      } else if (tab === 'class' && classes) {
        // Check if the class ID exists in the data
        const classExists = classes.find(cls => cls.id === id);
        if (classExists) {
          setSelectedClassId(id);
        }
      }
    }
  }, [searchParams, teachers, classes]);

  // Create lookup maps for efficient joins
  const teacherMap = useMemo(() => {
    if (!teachers) return new Map();
    return new Map(teachers.map(teacher => [teacher.id, teacher]));
  }, [teachers]);

  const classMap = useMemo(() => {
    if (!classes) return new Map();
    return new Map(classes.map(cls => [cls.id, cls]));
  }, [classes]);

  const subjectMap = useMemo(() => {
    if (!subjects) return new Map();
    return new Map(subjects.map(subject => [subject.id, subject]));
  }, [subjects]);

  // Extended assignments with joined data
  const extendedAssignments = useMemo((): ExtendedAssignment[] => {
    if (!assignments) return [];
    
    return assignments.map(assignment => ({
      ...assignment,
      teacher: teacherMap.get(assignment.teacherId),
      class: classMap.get(assignment.classId),
      subject: subjectMap.get(assignment.subjectId),
    }));
  }, [assignments, teacherMap, classMap, subjectMap]);

  // Filter assignments for selected teacher
  const teacherAssignments = useMemo(() => {
    if (!selectedTeacherId) return [];
    let filtered = extendedAssignments.filter(assignment => assignment.teacherId === selectedTeacherId);
    
    // Apply semester filter
    if (selectedSemester !== 'all') {
      filtered = filtered.filter(assignment => assignment.semester === selectedSemester);
    }
    
    return filtered;
  }, [extendedAssignments, selectedTeacherId, selectedSemester]);

  // Filter assignments for selected class
  const classAssignments = useMemo(() => {
    if (!selectedClassId) return [];
    let filtered = extendedAssignments.filter(assignment => assignment.classId === selectedClassId);
    
    // Apply semester filter
    if (selectedSemester !== 'all') {
      filtered = filtered.filter(assignment => assignment.semester === selectedSemester);
    }
    
    return filtered;
  }, [extendedAssignments, selectedClassId, selectedSemester]);

  // Calculate teacher summary statistics
  const teacherSummary = useMemo(() => {
    const totalHours = teacherAssignments.reduce((sum, assignment) => sum + parseFloat(assignment.hoursPerWeek), 0);
    const s1Hours = teacherAssignments
      .filter(assignment => assignment.semester === "1")
      .reduce((sum, assignment) => sum + parseFloat(assignment.hoursPerWeek), 0);
    const s2Hours = teacherAssignments
      .filter(assignment => assignment.semester === "2")
      .reduce((sum, assignment) => sum + parseFloat(assignment.hoursPerWeek), 0);
    
    return { totalHours, s1Hours, s2Hours };
  }, [teacherAssignments]);

  // Calculate class summary statistics
  const classSummary = useMemo(() => {
    // Handle duplicates by grouping assignments by subject+teacher+semester and taking maximum hours
    // This prevents artificial inflation from duplicate database entries
    const uniqueAssignments = new Map<string, { subject: string; teacher: string; hours: number; semester: string }>();
    
    classAssignments.forEach(assignment => {
      const hours = parseFloat(assignment.hoursPerWeek);
      
      // Skip 0-hour assignments as they're often placeholders
      if (hours <= 0) return;
      
      const key = `${assignment.subjectId}-${assignment.teacherId}-${assignment.semester}`;
      const existing = uniqueAssignments.get(key);
      
      // Keep the assignment with maximum hours (handles duplicates)
      if (!existing || hours > existing.hours) {
        uniqueAssignments.set(key, {
          subject: assignment.subjectId,
          teacher: assignment.teacherId,
          hours: hours,
          semester: assignment.semester
        });
      }
    });
    
    // Calculate semester hours from unique assignments
    const s1Hours = Array.from(uniqueAssignments.values())
      .filter(a => a.semester === "1")
      .reduce((sum, a) => sum + a.hours, 0);
      
    const s2Hours = Array.from(uniqueAssignments.values())
      .filter(a => a.semester === "2")
      .reduce((sum, a) => sum + a.hours, 0);
    
    // Total hours represents the weekly teaching load
    const totalHours = Math.max(s1Hours, s2Hours);
    
    const uniqueTeachers = new Set(Array.from(uniqueAssignments.values()).map(a => a.teacher));
    const teacherCount = uniqueTeachers.size;
    
    return { totalHours, s1Hours, s2Hours, teacherCount };
  }, [classAssignments]);

  const selectedTeacher = selectedTeacherId ? teacherMap.get(selectedTeacherId) : null;
  const selectedClass = selectedClassId ? classMap.get(selectedClassId) : null;

  // Calculate subject hour requirements vs. assignments
  const subjectRequirements = useMemo(() => {
    if (!selectedClass || !selectedClass.subjectHours || !subjects) return [];
    
    const requirements = [];
    const subjectHours = selectedClass.subjectHours as Record<string, { "1": number; "2": number }>;
    
    for (const [subjectShortName, semesters] of Object.entries(subjectHours)) {
      const subject = subjects.find(s => s.shortName === subjectShortName);
      if (!subject) continue;
      
      // Calculate assigned hours for this subject
      const assignedHours = {
        "1": classAssignments
          .filter(a => a.subjectId === subject.id && a.semester === "1")
          .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0),
        "2": classAssignments
          .filter(a => a.subjectId === subject.id && a.semester === "2")
          .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0)
      };
      
      requirements.push({
        subject,
        required: semesters,
        assigned: assignedHours,
        deficit: {
          "1": Math.max(0, semesters["1"] - assignedHours["1"]),
          "2": Math.max(0, semesters["2"] - assignedHours["2"])
        }
      });
    }
    
    return requirements.sort((a, b) => a.subject.shortName.localeCompare(b.subject.shortName));
  }, [selectedClass, classAssignments, subjects]);

  // Calculate teacher workload per semester (assigned hours per teacher per semester)
  const teacherWorkloadBySemester = useMemo(() => {
    if (!extendedAssignments) return new Map();
    
    const workloadMap = new Map<string, { "1": number; "2": number; total: number }>();
    
    extendedAssignments.forEach(assignment => {
      const teacherId = assignment.teacherId;
      const current = workloadMap.get(teacherId) || { "1": 0, "2": 0, total: 0 };
      
      if (assignment.semester === "1") {
        current["1"] += parseFloat(assignment.hoursPerWeek);
      } else if (assignment.semester === "2") {
        current["2"] += parseFloat(assignment.hoursPerWeek);
      }
      current.total = current["1"] + current["2"];
      
      workloadMap.set(teacherId, current);
    });
    
    return workloadMap;
  }, [extendedAssignments]);

  // Legacy teacherWorkload for backward compatibility (total hours)
  const teacherWorkload = useMemo(() => {
    const legacyMap = new Map<string, number>();
    teacherWorkloadBySemester.forEach((workload, teacherId) => {
      legacyMap.set(teacherId, workload.total);
    });
    return legacyMap;
  }, [teacherWorkloadBySemester]);

  // Get qualified teachers for a specific subject
  const getQualifiedTeachers = useCallback((subjectId: string) => {
    if (!teachers || !subjects) return [];
    
    const subject = subjectMap.get(subjectId);
    if (!subject) return teachers;
    
    return teachers.filter(teacher => {
      // Check if teacher has this subject in their subjects array
      // Handle both comma-separated strings and direct matches
      if (!teacher.subjects || teacher.subjects.length === 0) return false;
      
      return teacher.subjects.some(subjectEntry => {
        if (typeof subjectEntry === 'string') {
          // Split comma-separated values and check each one
          const subjectCodes = subjectEntry.split(',').map(s => s.trim());
          return subjectCodes.includes(subject.shortName);
        }
        return subjectEntry === subject.shortName;
      });
    });
  }, [teachers, subjects, subjectMap]);

  // Calculate available hours for a teacher in a specific semester (excluding current assignment when editing)
  const getAvailableHours = useCallback((teacherId: string, excludeHours?: number, semester?: "1" | "2") => {
    const teacher = teacherMap.get(teacherId);
    if (!teacher) return 0;
    
    const maxHours = parseFloat(teacher.maxHours);
    const workload = teacherWorkloadBySemester.get(teacherId) || { "1": 0, "2": 0, total: 0 };
    
    // If semester is specified, check availability for that semester only
    // Otherwise use the maximum of both semesters to prevent over-allocation
    let assignedHours: number;
    if (semester) {
      assignedHours = workload[semester];
    } else {
      // For legacy compatibility, use the maximum of the two semesters
      // This prevents over-allocation when semester is not specified
      assignedHours = Math.max(workload["1"], workload["2"]);
    }
    
    // When editing an existing assignment, don't count its current hours against availability
    if (excludeHours !== undefined) {
      assignedHours = Math.max(0, assignedHours - excludeHours);
    }
    
    return Math.max(0, maxHours - assignedHours);
  }, [teacherMap, teacherWorkloadBySemester]);

  // Helper functions for editable table
  const updateEditedAssignment = (assignmentId: string, field: keyof Assignment, value: any) => {
    setEditedAssignments(prev => {
      const currentAssignment = extendedAssignments?.find(a => a.id === assignmentId);
      if (!currentAssignment) return prev;
      
      const updates: Partial<Assignment> = {
        ...prev[assignmentId],
        [field]: value,
      };
      
      // If teacher is changed, check if current subject is still valid
      if (field === 'teacherId') {
        const newTeacher = teacherMap.get(value);
        const currentSubjectId = getEffectiveValue(currentAssignment, 'subjectId') as string;
        const currentSubject = subjectMap.get(currentSubjectId);
        
        if (newTeacher && currentSubject) {
          // Check if new teacher can teach current subject
          const canTeachSubject = newTeacher.subjects?.some((subjectEntry: any) => {
            if (typeof subjectEntry === 'string') {
              const subjectCodes = subjectEntry.split(',').map(s => s.trim());
              return subjectCodes.some(code => {
                const codeNormalized = code.toLowerCase().trim();
                const subjectShortNormalized = currentSubject.shortName.toLowerCase();
                const subjectNameNormalized = currentSubject.name.toLowerCase();
                
                // Direct matches
                if (codeNormalized === subjectShortNormalized || 
                    codeNormalized === subjectNameNormalized) {
                  return true;
                }
                
                // Special mappings for common subject names
                const subjectMappings = {
                  'mathe': ['m', 'mathematik'],
                  'physik': ['ph', 'p h'],
                  'informatik': ['if', 'i f', 'ikg', 'inf'],
                  'deutsch': ['d'],
                  'englisch': ['e'],
                  'biologie': ['bi', 'b i', 'nw'],
                  'chemie': ['ch', 'c h'],
                  'geschichte': ['ge', 'g e'],
                  'erdkunde': ['ek', 'e k'],
                  'kunst': ['ku', 'k u'],
                  'musik': ['mu', 'm u'],
                  'sport': ['sp', 's p'],
                  'technik': ['tc', 't c'],
                  'politik': ['pk', 'p k'],
                  'sozialwissenschaften': ['sw', 's w']
                };
                
                // Check if teacher's subject maps to this database subject
                for (const [teacherSubject, dbVariants] of Object.entries(subjectMappings)) {
                  if (codeNormalized.includes(teacherSubject)) {
                    if (dbVariants.includes(subjectShortNormalized) || 
                        dbVariants.includes(subjectNameNormalized)) {
                      return true;
                    }
                  }
                }
                
                return false;
              });
            }
            return subjectEntry === currentSubject.shortName || subjectEntry === currentSubject.name;
          });
          
          // If new teacher can't teach current subject, clear the subject
          if (!canTeachSubject) {
            updates.subjectId = '';
          }
        }
      }
      
      return {
        ...prev,
        [assignmentId]: updates,
      };
    });
  };

  const getEffectiveValue = (assignment: Assignment, field: keyof Assignment) => {
    return editedAssignments[assignment.id]?.[field] ?? assignment[field];
  };

  const hasChanges = (assignmentId: string) => {
    return editedAssignments[assignmentId] && Object.keys(editedAssignments[assignmentId]).length > 0;
  };

  const saveAssignment = async (assignment: Assignment) => {
    const changes = editedAssignments[assignment.id];
    if (!changes || Object.keys(changes).length === 0) return;

    try {
      await updateAssignmentMutation.mutateAsync({ id: assignment.id, data: changes });
      setEditedAssignments(prev => {
        const newState = { ...prev };
        delete newState[assignment.id];
        return newState;
      });
    } catch (error) {
      // Error handled by mutation onError
    }
  };

  const cancelEdit = (assignmentId: string) => {
    setEditedAssignments(prev => {
      const newState = { ...prev };
      delete newState[assignmentId];
      return newState;
    });
  };

  const deleteAssignment = async (assignmentId: string) => {
    try {
      await deleteAssignmentMutation.mutateAsync(assignmentId);
      setEditedAssignments(prev => {
        const newState = { ...prev };
        delete newState[assignmentId];
        return newState;
      });
    } catch (error) {
      // Error handled by mutation onError
    }
  };

  const saveNewAssignment = async () => {
    if (!newAssignment || !selectedClassId) return;

    try {
      await createAssignmentMutation.mutateAsync({
        ...newAssignment,
        classId: selectedClassId,
      });
    } catch (error) {
      // Error handled by mutation onError
    }
  };

  const isLoading = teachersLoading || classesLoading || subjectsLoading || assignmentsLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Stundenpläne</h2>
                <p className="text-muted-foreground">Übersicht über Lehrer- und Klassenstundenpläne</p>
              </div>
            </div>
          </header>
          <div className="p-6 flex items-center justify-center">
            <div className="text-center">
              <Clock className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Lade Stundenplandaten...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header Bar */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Stundenpläne</h2>
              <p className="text-muted-foreground">Übersicht über Lehrer- und Klassenstundenpläne</p>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Schuljahr 2024/25</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" data-testid="tabs-stundenplaene">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="teacher" data-testid="tab-lehrer">
                <Presentation className="h-4 w-4 mr-2" />
                Lehrer
              </TabsTrigger>
              <TabsTrigger value="class" data-testid="tab-klasse">
                <School className="h-4 w-4 mr-2" />
                Klasse
              </TabsTrigger>
            </TabsList>

            {/* Teacher Tab Content */}
            <TabsContent value="teacher" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Presentation className="mr-2 text-primary" />
                      Lehrer auswählen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId} data-testid="select-teacher">
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Wählen Sie eine Lehrkraft aus..." />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers?.map((teacher) => (
                          <SelectItem key={teacher.id} value={teacher.id}>
                            {teacher.firstName} {teacher.lastName} ({teacher.shortName})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Calendar className="mr-2 text-primary" />
                      Halbjahr filtern
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={selectedSemester} onValueChange={(value: 'all' | '1' | '2') => setSelectedSemester(value)} data-testid="select-semester-filter">
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Beide Halbjahre</SelectItem>
                        <SelectItem value="1">1. Halbjahr</SelectItem>
                        <SelectItem value="2">2. Halbjahr</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              </div>

              {selectedTeacher && (
                <>
                  {/* Teacher Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card data-testid="card-teacher-max-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">Max pro Halbjahr</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-teacher-max-hours">
                              {selectedTeacher?.maxHours || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">Wochenstunden</p>
                          </div>
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Clock className="text-blue-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-teacher-s1-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">1. Halbjahr</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-teacher-s1-hours">
                              {teacherSummary.s1Hours}
                            </p>
                            {selectedTeacher && (
                              <p className="text-xs text-muted-foreground">
                                {Math.max(0, parseFloat(selectedTeacher.maxHours) - teacherSummary.s1Hours)} verfügbar
                              </p>
                            )}
                          </div>
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <BookOpen className="text-green-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-teacher-s2-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">2. Halbjahr</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-teacher-s2-hours">
                              {teacherSummary.s2Hours}
                            </p>
                            {selectedTeacher && (
                              <p className="text-xs text-muted-foreground">
                                {Math.max(0, parseFloat(selectedTeacher.maxHours) - teacherSummary.s2Hours)} verfügbar
                              </p>
                            )}
                          </div>
                          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                            <BookOpen className="text-orange-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-teacher-reduction-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">Ermäßigungsstunden</p>
                            {selectedTeacher?.reductionHours ? (
                              <div className="space-y-1">
                                <p className="text-2xl font-bold text-foreground" data-testid="text-teacher-reduction-total">
                                  {Object.values(selectedTeacher.reductionHours as Record<string, number>)
                                    .reduce((sum, hours) => sum + hours, 0)}
                                </p>
                                <div className="space-y-0.5">
                                  {Object.entries(selectedTeacher.reductionHours as Record<string, number>)
                                    .filter(([_, hours]) => hours > 0)
                                    .map(([type, hours]) => (
                                      <p key={type} className="text-xs text-muted-foreground" data-testid={`text-reduction-${type.toLowerCase()}`}>
                                        {type}: {hours}h
                                      </p>
                                    ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-2xl font-bold text-foreground" data-testid="text-teacher-reduction-total">
                                0
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">Reduzierung</p>
                          </div>
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <GraduationCap className="text-purple-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Teacher Assignments Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Stundenplan für {selectedTeacher.firstName} {selectedTeacher.lastName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {teacherAssignments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground" data-testid="empty-teacher-assignments">
                          <Calendar className="h-8 w-8 mx-auto mb-2" />
                          <p>Keine Zuweisungen für diese Lehrkraft vorhanden.</p>
                        </div>
                      ) : (
                        <Table data-testid="table-teacher-assignments">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Klasse</TableHead>
                              <TableHead>Fach</TableHead>
                              <TableHead>Stunden</TableHead>
                              <TableHead>Semester</TableHead>
                              <TableHead className="text-center">Aktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {teacherAssignments.map((assignment) => (
                              <TableRow key={assignment.id} data-testid={`row-teacher-assignment-${assignment.id}`}>
                                <TableCell className="font-medium">
                                  {assignment.class?.name || 'Unbekannt'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary">
                                    {assignment.subject?.shortName || assignment.subject?.name || 'Unbekannt'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{assignment.hoursPerWeek}</TableCell>
                                <TableCell>
                                  <Badge variant={assignment.semester === "1" ? "default" : "outline"}>
                                    {assignment.semester === "1" ? "1. HJ" : "2. HJ"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        data-testid={`button-delete-assignment-${assignment.id}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Zuweisung löschen?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Möchten Sie die Zuweisung <strong>{assignment.subject?.shortName}</strong> 
                                          in Klasse <strong>{assignment.class?.name}</strong> 
                                          ({assignment.hoursPerWeek}h, {assignment.semester === "1" ? "1. HJ" : "2. HJ"}) 
                                          wirklich löschen?
                                          <br /><br />
                                          Diese Stunden werden wieder für andere Kollegen verfügbar.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteAssignment(assignment.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          data-testid={`confirm-delete-assignment-${assignment.id}`}
                                        >
                                          Löschen
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Class Tab Content */}
            <TabsContent value="class" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <School className="mr-2 text-primary" />
                      Klasse auswählen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={selectedClassId} onValueChange={setSelectedClassId} data-testid="select-class">
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Wählen Sie eine Klasse aus..." />
                      </SelectTrigger>
                      <SelectContent>
                        {classes?.map((cls) => (
                          <SelectItem key={cls.id} value={cls.id}>
                            {cls.name} (Stufe {cls.grade})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Calendar className="mr-2 text-primary" />
                      Halbjahr filtern
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={selectedSemester} onValueChange={(value: 'all' | '1' | '2') => setSelectedSemester(value)} data-testid="select-semester-filter-class">
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Beide Halbjahre</SelectItem>
                        <SelectItem value="1">1. Halbjahr</SelectItem>
                        <SelectItem value="2">2. Halbjahr</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              </div>

              {selectedClass && (
                <>
                  {/* Class Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card data-testid="card-class-total-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-foreground/70 text-sm font-semibold mb-2">Gesamtstunden</p>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-lg font-bold text-foreground" data-testid="text-class-total-hours">
                                  Gesamt: {classSummary.totalHours}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground/70">1. HJ:</span>
                                <span className="font-medium text-foreground" data-testid="text-class-s1-hours">
                                  {classSummary.s1Hours}h
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground/70">2. HJ:</span>
                                <span className="font-medium text-foreground" data-testid="text-class-s2-hours">
                                  {classSummary.s2Hours}h
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Clock className="text-purple-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-class-teachers">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-foreground/70 text-sm font-semibold">Lehrkräfte</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-class-teachers">
                              {classSummary.teacherCount}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <Users className="text-green-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Class Information Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <GraduationCap className="mr-2 text-primary" />
                        Klasseninformationen
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-foreground/70 font-medium">Klassenname:</span>
                          <p className="font-medium">{selectedClass.name}</p>
                        </div>
                        <div>
                          <span className="text-foreground/70 font-medium">Jahrgangsstufe:</span>
                          <p className="font-medium">{selectedClass.grade}</p>
                        </div>
                        <div>
                          <span className="text-foreground/70 font-medium">Schüleranzahl:</span>
                          <p className="font-medium">{selectedClass.studentCount}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Subject Hour Requirements */}
                  {subjectRequirements.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          <BookOpen className="mr-2 text-primary" />
                          Stundenvorgaben nach Fächern
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {subjectRequirements.map((req) => (
                            <div key={req.subject.id} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="outline">{req.subject.shortName}</Badge>
                                <span className="text-xs text-muted-foreground">{req.subject.name}</span>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span>1. HJ:</span>
                                  <span className={req.deficit["1"] > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                                    {req.assigned["1"]}/{req.required["1"]}h
                                    {req.deficit["1"] > 0 && <span className="ml-1 text-red-600">(-{req.deficit["1"]})</span>}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>2. HJ:</span>
                                  <span className={req.deficit["2"] > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                                    {req.assigned["2"]}/{req.required["2"]}h
                                    {req.deficit["2"] > 0 && <span className="ml-1 text-red-600">(-{req.deficit["2"]})</span>}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Class Assignments Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Stundenplan für Klasse {selectedClass.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Add New Assignment Button */}
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-muted-foreground">
                            {classAssignments.length} Zuweisung{classAssignments.length !== 1 ? 'en' : ''}
                          </p>
                          <Button
                            onClick={() => setNewAssignment({
                              teacherId: '',
                              subjectId: '',
                              hoursPerWeek: 1,
                              semester: '1',
                            })}
                            disabled={!!newAssignment}
                            size="sm"
                            data-testid="button-add-assignment"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Neue Zuordnung
                          </Button>
                        </div>

                        <Table data-testid="table-class-assignments">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Lehrkraft</TableHead>
                              <TableHead>Fach</TableHead>
                              <TableHead>Stunden</TableHead>
                              <TableHead>Semester</TableHead>
                              <TableHead className="w-32">Aktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* New Assignment Row */}
                            {newAssignment && (
                              <TableRow data-testid="row-new-assignment">
                                <TableCell>
                                  <Select
                                    value={newAssignment.teacherId}
                                    onValueChange={(value) =>
                                      setNewAssignment(prev => prev ? { ...prev, teacherId: value } : null)
                                    }
                                    data-testid="select-new-teacher"
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Lehrkraft wählen..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(() => {
                                        const qualifiedTeachers = newAssignment?.subjectId ? 
                                          getQualifiedTeachers(newAssignment.subjectId) : 
                                          teachers || [];
                                        
                                        return qualifiedTeachers.map((teacher) => {
                                          const availableHours = getAvailableHours(teacher.id);
                                          return (
                                            <SelectItem key={teacher.id} value={teacher.id}>
                                              <div className="flex items-center justify-between w-full">
                                                <span>{teacher.firstName} {teacher.lastName} ({teacher.shortName})</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                  {availableHours}h verfügbar
                                                </span>
                                              </div>
                                            </SelectItem>
                                          );
                                        });
                                      })()}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={newAssignment.subjectId}
                                    onValueChange={(value) =>
                                      setNewAssignment(prev => prev ? { ...prev, subjectId: value } : null)
                                    }
                                    data-testid="select-new-subject"
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Fach wählen..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {subjects?.map((subject) => (
                                        <SelectItem key={subject.id} value={subject.id}>
                                          {subject.shortName} - {subject.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="40"
                                    value={newAssignment.hoursPerWeek}
                                    onChange={(e) =>
                                      setNewAssignment(prev => prev ? { ...prev, hoursPerWeek: parseInt(e.target.value) || 1 } : null)
                                    }
                                    data-testid="input-new-hours"
                                    className="w-20"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={newAssignment.semester}
                                    onValueChange={(value: "1" | "2") =>
                                      setNewAssignment(prev => prev ? { ...prev, semester: value } : null)
                                    }
                                    data-testid="select-new-semester"
                                  >
                                    <SelectTrigger className="w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1">1. HJ</SelectItem>
                                      <SelectItem value="2">2. HJ</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <div className="flex space-x-2">
                                    <Button
                                      onClick={saveNewAssignment}
                                      disabled={!newAssignment.teacherId || !newAssignment.subjectId || createAssignmentMutation.isPending}
                                      size="sm"
                                      data-testid="button-save-new"
                                    >
                                      <Save className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      onClick={() => setNewAssignment(null)}
                                      variant="outline"
                                      size="sm"
                                      data-testid="button-cancel-new"
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}

                            {/* Existing Assignment Rows */}
                            {classAssignments.map((assignment) => (
                              <TableRow key={assignment.id} data-testid={`row-class-assignment-${assignment.id}`}>
                                <TableCell>
                                  <Select
                                    value={getEffectiveValue(assignment, 'teacherId') as string}
                                    onValueChange={(value) => updateEditedAssignment(assignment.id, 'teacherId', value)}
                                    data-testid={`select-teacher-${assignment.id}`}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue>
                                        <div className="flex items-center space-x-2">
                                          <div className="w-6 h-6 bg-secondary rounded-full flex items-center justify-center">
                                            <span className="text-secondary-foreground text-xs font-medium">
                                              {assignment.teacher?.shortName || '??'}
                                            </span>
                                          </div>
                                          <span className="text-sm">
                                            {assignment.teacher ? 
                                              `${assignment.teacher.firstName} ${assignment.teacher.lastName}` : 
                                              'Unbekannt'}
                                          </span>
                                        </div>
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(() => {
                                        const currentSubjectId = getEffectiveValue(assignment, 'subjectId') as string;
                                        const qualifiedTeachers = currentSubjectId ? 
                                          getQualifiedTeachers(currentSubjectId) : 
                                          teachers || [];
                                        
                                        return qualifiedTeachers.map((teacher) => {
                                          // Only exclude current assignment's hours for the originally assigned teacher
                                          const isCurrentTeacher = teacher.id === assignment.teacherId;
                                          const originalHours = assignment.hoursPerWeek;
                                          const currentSemester = getEffectiveValue(assignment, 'semester') as "1" | "2";
                                          const availableHours = getAvailableHours(
                                            teacher.id, 
                                            isCurrentTeacher ? parseFloat(originalHours) : undefined,
                                            currentSemester
                                          );
                                          return (
                                            <SelectItem key={teacher.id} value={teacher.id}>
                                              <div className="flex items-center justify-between w-full">
                                                <span>{teacher.firstName} {teacher.lastName} ({teacher.shortName})</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                  {availableHours}h verfügbar
                                                </span>
                                              </div>
                                            </SelectItem>
                                          );
                                        });
                                      })()}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={getEffectiveValue(assignment, 'subjectId') as string}
                                    onValueChange={(value) => updateEditedAssignment(assignment.id, 'subjectId', value)}
                                    data-testid={`select-subject-${assignment.id}`}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue>
                                        <Badge variant="secondary">
                                          {assignment.subject?.shortName || assignment.subject?.name || 'Unbekannt'}
                                        </Badge>
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(() => {
                                        const currentTeacherId = getEffectiveValue(assignment, 'teacherId') as string;
                                        const currentTeacher = teacherMap.get(currentTeacherId);
                                        
                                        if (!currentTeacher || !subjects) return [];
                                        
                                        // Get subjects that the current teacher can teach
                                        return subjects.filter(subject => {
                                          if (!currentTeacher.subjects || currentTeacher.subjects.length === 0) return false;
                                          
                                          return currentTeacher.subjects.some((subjectEntry: any) => {
                                            if (typeof subjectEntry === 'string') {
                                              // Handle comma-separated subjects in a single string
                                              const subjectCodes = subjectEntry.split(',').map(s => s.trim());
                                              // Check both shortName and name matches with flexible mapping
                                              return subjectCodes.some(code => {
                                                const codeNormalized = code.toLowerCase().trim();
                                                const subjectShortNormalized = subject.shortName.toLowerCase();
                                                const subjectNameNormalized = subject.name.toLowerCase();
                                                
                                                // Direct matches
                                                if (codeNormalized === subjectShortNormalized || 
                                                    codeNormalized === subjectNameNormalized) {
                                                  return true;
                                                }
                                                
                                                // Special mappings for common subject names
                                                const subjectMappings = {
                                                  'mathe': ['m', 'mathematik'],
                                                  'physik': ['ph', 'p h'],
                                                  'informatik': ['if', 'i f', 'ikg', 'inf'],
                                                  'deutsch': ['d'],
                                                  'englisch': ['e'],
                                                  'biologie': ['bi', 'b i', 'nw'],
                                                  'chemie': ['ch', 'c h'],
                                                  'geschichte': ['ge', 'g e'],
                                                  'erdkunde': ['ek', 'e k'],
                                                  'kunst': ['ku', 'k u'],
                                                  'musik': ['mu', 'm u'],
                                                  'sport': ['sp', 's p'],
                                                  'technik': ['tc', 't c'],
                                                  'politik': ['pk', 'p k'],
                                                  'sozialwissenschaften': ['sw', 's w']
                                                };
                                                
                                                // Check if teacher's subject maps to this database subject
                                                for (const [teacherSubject, dbVariants] of Object.entries(subjectMappings)) {
                                                  if (codeNormalized.includes(teacherSubject)) {
                                                    if (dbVariants.includes(subjectShortNormalized) || 
                                                        dbVariants.includes(subjectNameNormalized)) {
                                                      return true;
                                                    }
                                                  }
                                                }
                                                
                                                return false;
                                              });
                                            }
                                            return subjectEntry === subject.shortName || subjectEntry === subject.name;
                                          });
                                        }).map((subject) => (
                                          <SelectItem key={subject.id} value={subject.id}>
                                            {subject.shortName} - {subject.name}
                                          </SelectItem>
                                        ));
                                      })()}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="40"
                                    value={parseFloat(getEffectiveValue(assignment, 'hoursPerWeek') as string)}
                                    onChange={(e) => updateEditedAssignment(assignment.id, 'hoursPerWeek', parseInt(e.target.value) || 1)}
                                    data-testid={`input-hours-${assignment.id}`}
                                    className="w-20"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={getEffectiveValue(assignment, 'semester') as string}
                                    onValueChange={(value: "1" | "2") => updateEditedAssignment(assignment.id, 'semester', value)}
                                    data-testid={`select-semester-${assignment.id}`}
                                  >
                                    <SelectTrigger className="w-24">
                                      <SelectValue>
                                        <Badge variant={assignment.semester === "1" ? "default" : "outline"}>
                                          {assignment.semester === "1" ? "1. HJ" : "2. HJ"}
                                        </Badge>
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1">1. HJ</SelectItem>
                                      <SelectItem value="2">2. HJ</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <div className="flex space-x-2">
                                    {hasChanges(assignment.id) && (
                                      <>
                                        <Button
                                          onClick={() => saveAssignment(assignment)}
                                          disabled={updateAssignmentMutation.isPending}
                                          size="sm"
                                          data-testid={`button-save-${assignment.id}`}
                                        >
                                          <Save className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          onClick={() => cancelEdit(assignment.id)}
                                          variant="outline"
                                          size="sm"
                                          data-testid={`button-cancel-${assignment.id}`}
                                        >
                                          ✕
                                        </Button>
                                      </>
                                    )}
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          data-testid={`button-delete-${assignment.id}`}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Zuweisung löschen</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Sind Sie sicher, dass Sie diese Zuweisung löschen möchten? 
                                            Diese Aktion kann nicht rückgängig gemacht werden.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => deleteAssignment(assignment.id)}
                                            data-testid={`confirm-delete-${assignment.id}`}
                                          >
                                            Löschen
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}

                            {/* Empty state when no assignments */}
                            {classAssignments.length === 0 && !newAssignment && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-8">
                                  <div className="text-muted-foreground" data-testid="empty-class-assignments">
                                    <Calendar className="h-8 w-8 mx-auto mb-2" />
                                    <p>Keine Zuweisungen für diese Klasse vorhanden.</p>
                                    <p className="text-sm mt-1">Klicken Sie auf "Neue Zuordnung" um eine hinzuzufügen.</p>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}