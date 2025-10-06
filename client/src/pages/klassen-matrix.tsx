import React, { useState, useMemo, useCallback } from "react";
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
import { calculateCorrectHours } from "@shared/parallel-subjects";


export default function KlassenMatrix() {
  const params = useParams();
  const classId = params.classId as string;
  const { toast } = useToast();
  
  // Local state for unsaved changes per semester (subjectId-semester -> teacherId)
  const [changes1, setChanges1] = useState<Record<string, string | null>>({});
  const [changes2, setChanges2] = useState<Record<string, string | null>>({});
  // Local state for hours changes
  const [changesHours1, setChangesHours1] = useState<Record<string, number>>({});
  const [changesHours2, setChangesHours2] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "jahrgang">("single");

  // Get the selected class info
  const { data: selectedClass, isLoading: isLoadingClass, isError: isClassError } = useQuery<Class>({
    queryKey: ['/api/classes', classId],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}`);
      if (!res.ok) {
        throw new Error('Klasse nicht gefunden');
      }
      return res.json();
    },
    enabled: !!classId,
    retry: false
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
  const jahrgangClassIds = jahrgangClasses.map(c => c.id).join(',');
  
  const { data: assignments1 = [] } = useQuery<Assignment[]>({ 
    queryKey: viewMode === "jahrgang" ? ['/api/assignments', 'jahrgang', selectedClass?.grade, '1', jahrgangClassIds] : ['/api/assignments', classId, '1'],
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
    enabled: viewMode === "single" ? !!classId : (!!selectedClass && jahrgangClasses.length > 0),
    staleTime: 30000
  });

  const { data: assignments2 = [] } = useQuery<Assignment[]>({ 
    queryKey: viewMode === "jahrgang" ? ['/api/assignments', 'jahrgang', selectedClass?.grade, '2', jahrgangClassIds] : ['/api/assignments', classId, '2'],
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
    enabled: viewMode === "single" ? !!classId : (!!selectedClass && jahrgangClasses.length > 0),
    staleTime: 30000
  });

  // Subject order for consistent display
  const baseSubjectOrder = ['D', 'M', 'E', 'FS', 'NW', 'SW', 'IF', 'TC', 'PK', 'GE', 'EK', 'BI', 'PH', 'CH', 'HW', 'KU', 'MU', 'TX', 'ER', 'KR', 'PP', 'SO', 'BO', 'SP'];
  const RELIGION_SUBJECTS = new Set(['ER', 'KR', 'PP']);
  
  // For grades 5 and 6, add Förderfächer (EF, MF, DF) after main subjects
  const SUBJECT_ORDER = useMemo(() => {
    if (selectedClass && (selectedClass.grade === 5 || selectedClass.grade === 6)) {
      return [...baseSubjectOrder, 'EF', 'MF', 'DF'];
    }
    return baseSubjectOrder;
  }, [selectedClass]);
  
  // Get religion courses for the current grade (only in jahrgang view for regular classes)
  const religionCourses = useMemo(() => {
    if (!selectedClass) return [];
    // Don't show religion courses when viewing a single course
    if (selectedClass.type === 'kurs') return [];
    
    return allClasses
      .filter(c => 
        c.grade === selectedClass.grade && 
        c.type === 'kurs' && 
        (c.name.includes('ER') || c.name.includes('KR') || c.name.includes('PP'))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allClasses, selectedClass]);
  
  // Helper: Extract subject short name from course name
  const extractSubjectFromCourseName = (courseName: string): string | null => {
    // Match patterns like "10FS", "10INF_IF", "07NW_BI", "05ER1", "05KR2", "05PP1"
    const match = courseName.match(/^\d{2}([A-Z_]+\d*)$/i);
    if (!match) return null;
    
    let extracted = match[1].toUpperCase();
    
    // Remove trailing digits (e.g., "ER1" -> "ER", "KR2" -> "KR", "PP1" -> "PP")
    extracted = extracted.replace(/\d+$/, '');
    
    // If there's an underscore, take the part after it (e.g., "INF_IF" -> "IF")
    const underscoreIndex = extracted.indexOf('_');
    return underscoreIndex !== -1 ? extracted.substring(underscoreIndex + 1) : extracted;
  };
  
  // Sort subjects according to predefined order (exclude ER, KR, PP as they are shown as courses)
  const sortedSubjects = useMemo(() => {
    // If this is a course (not a regular class), show only the course's subject
    if (selectedClass && selectedClass.type === 'kurs') {
      const courseSubjectCode = extractSubjectFromCourseName(selectedClass.name);
      if (courseSubjectCode) {
        const courseSubject = subjects.find(s => s.shortName.toUpperCase() === courseSubjectCode);
        return courseSubject ? [courseSubject] : [];
      }
      return [];
    }
    
    // For regular classes, show all subjects except religion subjects
    return subjects
      .filter(subject => SUBJECT_ORDER.includes(subject.shortName) && !RELIGION_SUBJECTS.has(subject.shortName))
      .sort((a, b) => {
        const indexA = SUBJECT_ORDER.indexOf(a.shortName);
        const indexB = SUBJECT_ORDER.indexOf(b.shortName);
        return indexA - indexB;
      });
  }, [subjects, SUBJECT_ORDER, selectedClass]);

  // Team-Teaching helpers - semester-aware
  const getTeamTeachingGroups = useMemo(() => {
    const allAssignments = [...assignments1, ...assignments2];
    const groups = new Map<string, Assignment[]>();
    allAssignments.forEach(assignment => {
      if (assignment.teamTeachingId) {
        // Group by teamTeachingId, semester, classId, and subjectId to ensure correct scoping
        const key = `${assignment.teamTeachingId}-${assignment.semester}-${assignment.classId}-${assignment.subjectId}`;
        const existing = groups.get(key) || [];
        existing.push(assignment);
        groups.set(key, existing);
      }
    });
    return groups;
  }, [assignments1, assignments2]);

  const getTeamTeachersDisplay = useCallback((classItemId: string, subjectId: string, semester: "1" | "2"): string => {
    const assignments = semester === "1" ? assignments1 : assignments2;
    const assignment = assignments.find(a => a.subjectId === subjectId && a.classId === classItemId);
    
    if (!assignment?.teamTeachingId) return '';
    const key = `${assignment.teamTeachingId}-${assignment.semester}-${assignment.classId}-${assignment.subjectId}`;
    const group = getTeamTeachingGroups.get(key);
    if (!group || group.length <= 1) return '';
    
    const teacherNames = group
      .map(a => teachers.find(t => t.id === a.teacherId)?.shortName)
      .filter(Boolean);
    
    return teacherNames.join(' & ');
  }, [getTeamTeachingGroups, teachers, assignments1, assignments2]);

  // Get current teacher for a subject, semester, and class (considering local changes)
  const getCurrentTeacher = (classItemId: string, subjectId: string, semester: "1" | "2") => {
    const key = `${classItemId}::${subjectId}::${semester}`;
    const localChange = semester === "1" ? changes1[key] : changes2[key];
    
    if (localChange !== undefined) {
      return localChange;
    }
    
    // Fall back to existing assignments
    const assignments = semester === "1" ? assignments1 : assignments2;
    const assignment = assignments.find(a => a.subjectId === subjectId && a.classId === classItemId);
    return assignment?.teacherId || null;
  };

  // Get current hours for a subject, semester, and class (considering local changes)
  const getCurrentHours = (classItemId: string, subjectId: string, semester: "1" | "2"): number => {
    const key = `${classItemId}::${subjectId}::${semester}`;
    const localChange = semester === "1" ? changesHours1[key] : changesHours2[key];
    
    if (localChange !== undefined) {
      return localChange;
    }
    
    // Fall back to existing assignments
    const assignments = semester === "1" ? assignments1 : assignments2;
    const assignment = assignments.find(a => a.subjectId === subjectId && a.classId === classItemId);
    const hours = assignment?.hoursPerWeek;
    if (hours) {
      return typeof hours === 'string' ? parseFloat(hours) : hours;
    }
    return 1;
  };

  // Handle teacher assignment changes
  const handleTeacherChange = (classItemId: string, semester: "1" | "2", subjectId: string, teacherId: string | null) => {
    const key = `${classItemId}::${subjectId}::${semester}`;
    
    // Ermittle das betroffene Fach und die zugehörige Klasse
    const subject = subjects.find(s => s.id === subjectId);
    const classInfo = allClasses.find(c => c.id === classItemId);
    
    // Falls es ein Religionsfach ist UND es sich um eine normale Klasse handelt (nicht Kurs)
    // synchronisiere alle Parallelklassen des Jahrgangs
    if (subject && classInfo && RELIGION_SUBJECTS.has(subject.shortName) && classInfo.type === 'klasse') {
      const jahrgangClasses = allClasses.filter(c => 
        c.grade === classInfo.grade && c.type === 'klasse'
      );
      
      // Baue Updates für alle Parallelklassen
      const updates: Record<string, string | null> = {};
      for (const klasse of jahrgangClasses) {
        const updateKey = `${klasse.id}::${subjectId}::${semester}`;
        updates[updateKey] = teacherId;
      }
      
      // Setze alle Updates gleichzeitig
      if (semester === "1") {
        setChanges1(prev => ({ ...prev, ...updates }));
      } else {
        setChanges2(prev => ({ ...prev, ...updates }));
      }
    } else {
      // Normales Verhalten für nicht-Religionsfächer UND für Kurse
      // (Kurse werden NICHT synchronisiert, auch wenn es Religionsfächer sind)
      if (semester === "1") {
        setChanges1(prev => ({ ...prev, [key]: teacherId }));
      } else {
        setChanges2(prev => ({ ...prev, [key]: teacherId }));
      }
    }
  };

  // Handle hours changes
  const handleHoursChange = (classItemId: string, semester: "1" | "2", subjectId: string, hours: number) => {
    const key = `${classItemId}::${subjectId}::${semester}`;
    
    if (semester === "1") {
      setChangesHours1(prev => ({ ...prev, [key]: hours }));
    } else {
      setChangesHours2(prev => ({ ...prev, [key]: hours }));
    }
  };

  // Save changes for both semesters
  const saveChanges = useMutation({
    mutationFn: async () => {
      setSaving(true);
      
      // Collect all teacher changes
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

      // Collect all hours changes
      const allHoursChanges = [
        ...Object.entries(changesHours1).map(([key, hours]) => ({ 
          key,
          semester: '1', 
          hours 
        })),
        ...Object.entries(changesHours2).map(([key, hours]) => ({ 
          key,
          semester: '2', 
          hours 
        }))
      ];

      // Process teacher changes
      for (const change of allChanges) {
        const [changeClassId, changeSubjectId, _semester] = change.key.split('::');
        if (change.teacherId) {
          // Get hours for this assignment (from local changes or existing assignment)
          const hours = getCurrentHours(changeClassId, changeSubjectId, change.semester as "1" | "2");
          
          // Create or update assignment
          await apiRequest('POST', '/api/assignments', {
            teacherId: change.teacherId,
            subjectId: changeSubjectId,
            classId: changeClassId,
            semester: change.semester,
            hoursPerWeek: hours
          });
        } else {
          // Delete assignment if teacherId is null
          const assignments = change.semester === '1' ? assignments1 : assignments2;
          const existingAssignment = assignments.find(
            a => a.classId === changeClassId && a.subjectId === changeSubjectId
          );
          if (existingAssignment) {
            await apiRequest('DELETE', `/api/assignments/${existingAssignment.id}`, {});
          }
        }
      }
      
      // Process hours-only changes (where teacher didn't change but hours did)
      for (const hoursChange of allHoursChanges) {
        const [changeClassId, changeSubjectId, _semester] = hoursChange.key.split('::');
        
        // Skip if this was already handled by a teacher change
        if (allChanges.some(c => c.key === hoursChange.key)) {
          continue;
        }
        
        // Find existing assignment and update hours
        const assignments = hoursChange.semester === '1' ? assignments1 : assignments2;
        const existingAssignment = assignments.find(
          a => a.classId === changeClassId && a.subjectId === changeSubjectId
        );
        
        if (existingAssignment) {
          await apiRequest('PATCH', `/api/assignments/${existingAssignment.id}`, {
            hoursPerWeek: hoursChange.hours
          });
        }
      }
    },
    onSuccess: () => {
      // Invalidate ALL assignment queries to refresh data everywhere (Stundenpläne, etc.)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/assignments');
        }
      });
      setChanges1({});
      setChanges2({});
      setChangesHours1({});
      setChangesHours2({});
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

  const hasChanges = Object.keys(changes1).length > 0 || Object.keys(changes2).length > 0 || 
                       Object.keys(changesHours1).length > 0 || Object.keys(changesHours2).length > 0;

  const resetChanges = () => {
    setChanges1({});
    setChanges2({});
    setChangesHours1({});
    setChangesHours2({});
  };

  // Calculate teacher workload for each semester
  const getTeacherWorkload = useCallback((teacherId: string, semester: "1" | "2") => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return { assigned: 0, total: 0, free: 0 };

    const assignments = semester === "1" ? assignments1 : assignments2;
    const changes = semester === "1" ? changes1 : changes2;
    const hoursChanges = semester === "1" ? changesHours1 : changesHours2;

    // Calculate assigned hours from saved assignments
    let assignedHours = 0;
    assignments.forEach(assignment => {
      if (assignment.teacherId === teacherId) {
        const hours = typeof assignment.hoursPerWeek === 'string' 
          ? parseFloat(assignment.hoursPerWeek) 
          : assignment.hoursPerWeek;
        assignedHours += hours || 0;
      }
    });

    // Adjust for pending changes
    Object.entries(changes).forEach(([key, changedTeacherId]) => {
      const [changeClassId, changeSubjectId, _semester] = key.split('::');
      
      // Find original assignment
      const originalAssignment = assignments.find(
        a => a.classId === changeClassId && a.subjectId === changeSubjectId
      );
      
      // If this teacher was originally assigned, subtract those hours
      if (originalAssignment?.teacherId === teacherId) {
        const hours = typeof originalAssignment.hoursPerWeek === 'string' 
          ? parseFloat(originalAssignment.hoursPerWeek) 
          : originalAssignment.hoursPerWeek;
        assignedHours -= hours || 0;
      }
      
      // If this teacher is newly assigned, add hours (from changesHours or default to 1)
      if (changedTeacherId === teacherId) {
        const pendingHours = hoursChanges[key] || getCurrentHours(changeClassId, changeSubjectId, semester);
        assignedHours += pendingHours;
      }
    });

    const total = typeof teacher.maxHours === 'string' 
      ? parseFloat(teacher.maxHours) 
      : teacher.maxHours;
    const free = Math.max(0, total - assignedHours);

    return { assigned: Math.round(assignedHours), total, free: Math.round(free) };
  }, [teachers, assignments1, assignments2, changes1, changes2, changesHours1, changesHours2, getCurrentHours]);

  if (isLoadingClass) {
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

  if (isClassError || !selectedClass) {
    return (
      <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold mb-2">Klasse nicht gefunden</p>
            <p className="text-muted-foreground mb-4">Die angeforderte Klasse existiert nicht.</p>
            <Link href="/lehrer-faecher-zuordnung/select">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück zur Klassenauswahl
              </Button>
            </Link>
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
            
            <div className="border rounded-lg overflow-x-auto">
              <table className="border-collapse w-full table-fixed">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border-b border-r p-2 text-left text-xs font-medium bg-slate-200 dark:bg-slate-700 sticky left-0 z-10" style={{ width: '100px' }}>KLASSE</th>
                      {sortedSubjects.map((subject, index) => (
                        <th 
                          key={subject.id} 
                          style={{ width: '130px', maxWidth: '130px', minWidth: '130px' }}
                          className={`border-b border-r p-2 text-center text-xs font-medium ${
                            index % 2 === 0 
                              ? 'bg-blue-100 dark:bg-blue-900/50' 
                              : 'bg-emerald-100 dark:bg-emerald-900/50'
                          }`}
                        >
                          {subject.shortName.toUpperCase()}
                        </th>
                      ))}
                      {religionCourses.map((course, index) => (
                        <th 
                          key={course.id} 
                          className={`border-b border-r p-3 text-center text-sm font-medium min-w-[140px] ${
                            index % 2 === 0 
                              ? 'bg-green-100 dark:bg-green-900/50' 
                              : 'bg-teal-100 dark:bg-teal-900/50'
                          }`}
                        >
                          {course.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(viewMode === "single" ? [selectedClass] : jahrgangClasses).map((classItem) => {
                      // Calculate total hours for this class (per semester, without double-counting parallel subjects)
                      const subjectHoursSem1: Record<string, number> = {};
                      const subjectHoursSem2: Record<string, number> = {};
                      
                      // Collect hours from all subjects
                      sortedSubjects.forEach(subject => {
                        const hours1 = getCurrentHours(classItem.id, subject.id, "1");
                        const hours2 = getCurrentHours(classItem.id, subject.id, "2");
                        if (hours1 > 0) subjectHoursSem1[subject.shortName] = hours1;
                        if (hours2 > 0) subjectHoursSem2[subject.shortName] = hours2;
                      });
                      
                      const totalSem1 = calculateCorrectHours(subjectHoursSem1, classItem.grade).totalHours;
                      const totalSem2 = calculateCorrectHours(subjectHoursSem2, classItem.grade).totalHours;
                      
                      return (
                        <React.Fragment key={classItem.id}>
                          <tr className="hover:bg-muted/25">
                        <td className="border-b border-r px-4 py-1 font-semibold text-lg bg-slate-100 dark:bg-slate-800 sticky left-0 z-10">
                          {classItem.name}
                        </td>
                        {sortedSubjects.map((subject, index) => {
                        // Get teachers qualified for this subject
                        const qualifiedForSubject = teachers.filter(teacher => 
                          teacher.subjects.includes(subject.shortName)
                        );
                        
                        // Get current teacher assignments (considering local changes)
                        const currentTeacher1 = getCurrentTeacher(classItem.id, subject.id, "1");
                        const currentTeacher2 = getCurrentTeacher(classItem.id, subject.id, "2");
                        
                        // Get team teaching display
                        const teamText1 = getTeamTeachersDisplay(classItem.id, subject.id, "1");
                        const teamText2 = getTeamTeachersDisplay(classItem.id, subject.id, "2");
                        
                        return (
                          <td 
                            key={subject.id} 
                            style={{ width: '130px', maxWidth: '130px', minWidth: '130px' }}
                            className={`border-b border-r px-1 py-0 text-center align-top ${
                              index % 2 === 0 
                                ? 'bg-blue-50 dark:bg-blue-900/30' 
                                : 'bg-emerald-50 dark:bg-emerald-900/30'
                            }`}
                          >
                            <div className="space-y-0">
                              {/* 1. Halbjahr */}
                              <div className="space-y-0">
                                <div className="text-[10px] text-muted-foreground font-medium">1. HJ</div>
                                <div className="flex items-center gap-1 justify-center">
                                  <Select
                                    value={currentTeacher1 || 'unassigned'}
                                    onValueChange={(teacherId) => 
                                      handleTeacherChange(classItem.id, "1", subject.id, teacherId === 'unassigned' ? null : teacherId)
                                    }
                                    data-testid={`select-teacher-${classItem.id}-${subject.id}-semester-1`}
                                  >
                                    <SelectTrigger className="h-6 text-[10px] px-1" style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}>
                                      <SelectValue placeholder="--" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">--</SelectItem>
                                      {qualifiedForSubject.map(teacher => {
                                        const workload = getTeacherWorkload(teacher.id, "1");
                                        return (
                                          <SelectItem key={teacher.id} value={teacher.id}>
                                            {teacher.shortName} ({workload.assigned}/{workload.total}h)
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={getCurrentHours(classItem.id, subject.id, "1").toString()}
                                    onValueChange={(hours) => handleHoursChange(classItem.id, "1", subject.id, parseInt(hours))}
                                    disabled={!currentTeacher1}
                                    data-testid={`select-hours-${classItem.id}-${subject.id}-semester-1`}
                                  >
                                    <SelectTrigger className="h-6 text-[10px] px-1" style={{ width: '42px', minWidth: '42px', maxWidth: '42px' }}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[1, 2, 3, 4, 5, 6].map(h => (
                                        <SelectItem key={h} value={h.toString()}>{h}h</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                {teamText1 && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                    <Users className="h-2.5 w-2.5 mr-0.5" />
                                    {teamText1}
                                  </Badge>
                                )}
                              </div>
                              
                              {/* 2. Halbjahr */}
                              <div className="space-y-0">
                                <div className="text-[10px] text-muted-foreground font-medium">2. HJ</div>
                                <div className="flex items-center gap-1 justify-center -mb-1">
                                <Select
                                  value={currentTeacher2 || 'unassigned'}
                                  onValueChange={(teacherId) => 
                                    handleTeacherChange(classItem.id, "2", subject.id, teacherId === 'unassigned' ? null : teacherId)
                                  }
                                  data-testid={`select-teacher-${classItem.id}-${subject.id}-semester-2`}
                                >
                                  <SelectTrigger className="h-6 text-[10px] px-1" style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}>
                                    <SelectValue placeholder="--" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unassigned">--</SelectItem>
                                    {qualifiedForSubject.map(teacher => {
                                      const workload = getTeacherWorkload(teacher.id, "2");
                                      return (
                                        <SelectItem key={teacher.id} value={teacher.id}>
                                          {teacher.shortName} ({workload.assigned}/{workload.total}h)
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={getCurrentHours(classItem.id, subject.id, "2").toString()}
                                  onValueChange={(hours) => handleHoursChange(classItem.id, "2", subject.id, parseInt(hours))}
                                  disabled={!currentTeacher2}
                                  data-testid={`select-hours-${classItem.id}-${subject.id}-semester-2`}
                                >
                                  <SelectTrigger className="h-6 text-[10px] px-1" style={{ width: '42px', minWidth: '42px', maxWidth: '42px' }}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3, 4, 5, 6].map(h => (
                                      <SelectItem key={h} value={h.toString()}>{h}h</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {teamText2 && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                  <Users className="h-2.5 w-2.5 mr-0.5" />
                                  {teamText2}
                                </Badge>
                              )}
                            </div>
                            </div>
                          </td>
                        );
                      })}
                      
                      {/* Religion Courses */}
                      {religionCourses.map((course, index) => {
                        // For religion courses, we need to find the subject based on course name
                        const courseSubjectName = course.name.includes('ER') ? 'ER' : 
                                                  course.name.includes('KR') ? 'KR' : 
                                                  course.name.includes('PP') ? 'PP' : '';
                        const courseSubject = subjects.find(s => s.shortName === courseSubjectName);
                        
                        if (!courseSubject) return null;
                        
                        // Get teachers qualified for this religion subject
                        const qualifiedForSubject = teachers.filter(teacher => 
                          teacher.subjects.includes(courseSubjectName)
                        );
                        
                        // Get current teacher assignments (using course.id as the "class" for assignment)
                        const currentTeacher1 = getCurrentTeacher(course.id, courseSubject.id, "1");
                        const currentTeacher2 = getCurrentTeacher(course.id, courseSubject.id, "2");
                        
                        return (
                          <td 
                            key={course.id} 
                            className={`border-b border-r p-2 text-center ${
                              index % 2 === 0 
                                ? 'bg-green-50 dark:bg-green-900/30' 
                                : 'bg-teal-50 dark:bg-teal-900/30'
                            }`}
                          >
                            <div className="space-y-2">
                              {/* 1. Halbjahr */}
                              <div className="text-xs text-muted-foreground font-medium">1. HJ</div>
                              <Select
                                value={currentTeacher1 || 'unassigned'}
                                onValueChange={(teacherId) => 
                                  handleTeacherChange(course.id, "1", courseSubject.id, teacherId === 'unassigned' ? null : teacherId)
                                }
                                data-testid={`select-teacher-${course.id}-${courseSubject.id}-semester-1`}
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue placeholder="--" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">--</SelectItem>
                                  {qualifiedForSubject.map(teacher => {
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
                                  handleTeacherChange(course.id, "2", courseSubject.id, teacherId === 'unassigned' ? null : teacherId)
                                }
                                data-testid={`select-teacher-${course.id}-${courseSubject.id}-semester-2`}
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue placeholder="--" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">--</SelectItem>
                                  {qualifiedForSubject.map(teacher => {
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
                      {/* Summary row showing total hours per semester */}
                      <tr className="border-t-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30">
                        <td className="border-b border-r p-3 font-bold text-sm bg-blue-100 dark:bg-blue-900/50 sticky left-0 z-10">
                          <div className="flex flex-col gap-1">
                            <div className="font-bold">Summe</div>
                            <div className="flex gap-4 text-xs">
                              <span className="font-medium">
                                1. HJ: <span className="font-bold text-blue-700 dark:text-blue-400">{totalSem1.toFixed(1)}h</span>
                              </span>
                              <span className="font-medium">
                                2. HJ: <span className="font-bold text-blue-700 dark:text-blue-400">{totalSem2.toFixed(1)}h</span>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td colSpan={sortedSubjects.length + religionCourses.length} className="border-b border-r p-3 text-sm bg-blue-50 dark:bg-blue-950/30">
                        </td>
                      </tr>
                    </React.Fragment>
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