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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar, Clock, Users, BookOpen, Presentation, School, GraduationCap, Save, Trash2, Plus, Edit, Eye, AlertTriangle } from "lucide-react";
import { insertAssignmentSchema, type InsertAssignment } from "@shared/schema";
import { z } from "zod";
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
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState<'all' | '1' | '2'>('all');
  const [selectedClassType, setSelectedClassType] = useState<string>("all");
  
  
  // State for editable table
  const [editedAssignments, setEditedAssignments] = useState<Record<string, Partial<Assignment>>>({});
  const [newAssignment, setNewAssignment] = useState<{
    teacherId: string;
    subjectId: string;
    hoursPerWeek: number;
    semester: "1" | "2";
  } | null>(null);
  
  // State for multi-selection
  const [selectedTeacherAssignments, setSelectedTeacherAssignments] = useState<Set<string>>(new Set());
  const [selectedClassAssignments, setSelectedClassAssignments] = useState<Set<string>>(new Set());
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
    isOpen: boolean;
    context: 'teacher' | 'class';
    selectedIds: string[];
  }>({ isOpen: false, context: 'teacher', selectedIds: [] });
  
  const { toast } = useToast();
  

  const { data: teachers, isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: classes, isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  // Filter and sort classes by type
  const filteredClasses = useMemo(() => {
    if (!classes) return [];
    
    // Filter by type using the database type field
    const filtered = selectedClassType === "all" 
      ? classes 
      : classes.filter(cls => cls.type === selectedClassType);
    
    // Sort by grade (numerically) then by name (alphabetically)
    return filtered.sort((a, b) => {
      if (a.grade !== b.grade) {
        return a.grade - b.grade;
      }
      
      return a.name.localeCompare(b.name);
    });
  }, [classes, selectedClassType]);

  const { data: subjects, isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: () => fetch("/api/assignments?minimal=true").then(res => res.json())
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

  // Team Teaching Mutations
  const createTeamTeachingMutation = useMutation({
    mutationFn: async ({ assignmentId, teacherIds }: { assignmentId: string; teacherIds: string[] }) => {
      const response = await apiRequest("POST", `/api/assignments/${assignmentId}/team`, { teacherIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      // Close the dialog and reset selections
      setTeamTeachingDialog({
        isOpen: false,
        assignmentId: null,
        availableTeachers: [],
        selectedTeacherIds: new Set(),
      });
      toast({
        title: "Erfolg",
        description: "Teamteaching wurde erfolgreich erstellt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Teamteaching konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  const removeFromTeamTeachingMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await apiRequest("DELETE", `/api/assignments/${assignmentId}/team`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Erfolg",
        description: "Lehrkraft wurde aus dem Team entfernt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Lehrkraft konnte nicht aus dem Team entfernt werden.",
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteAssignmentsMutation = useMutation({
    mutationFn: async (assignmentIds: string[]) => {
      await apiRequest("DELETE", "/api/assignments/bulk", { assignmentIds });
    },
    onSuccess: (_, deletedIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      // Clear selections for deleted assignments
      setSelectedTeacherAssignments(prev => {
        const newSet = new Set(prev);
        deletedIds.forEach(id => newSet.delete(id));
        return newSet;
      });
      setSelectedClassAssignments(prev => {
        const newSet = new Set(prev);
        deletedIds.forEach(id => newSet.delete(id));
        return newSet;
      });
      toast({
        title: "Erfolg",
        description: `${deletedIds.length} Zuweisung${deletedIds.length !== 1 ? 'en' : ''} wurde${deletedIds.length !== 1 ? 'n' : ''} erfolgreich gelöscht.`,
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Zuweisungen konnten nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  // Multi-selection helper functions
  const toggleTeacherAssignmentSelection = (assignmentId: string) => {
    setSelectedTeacherAssignments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assignmentId)) {
        newSet.delete(assignmentId);
      } else {
        newSet.add(assignmentId);
      }
      return newSet;
    });
  };

  const toggleClassAssignmentSelection = (assignmentId: string) => {
    setSelectedClassAssignments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assignmentId)) {
        newSet.delete(assignmentId);
      } else {
        newSet.add(assignmentId);
      }
      return newSet;
    });
  };

  const selectAllTeacherAssignments = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedTeacherAssignments(new Set(teacherAssignments.map(a => a.id)));
    } else {
      setSelectedTeacherAssignments(new Set());
    }
  };

  const selectAllClassAssignments = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedClassAssignments(new Set(classAssignments.map(a => a.id)));
    } else {
      setSelectedClassAssignments(new Set());
    }
  };

  const openBulkDeleteDialog = (context: 'teacher' | 'class') => {
    const selectedIds = context === 'teacher' 
      ? Array.from(selectedTeacherAssignments)
      : Array.from(selectedClassAssignments);
    
    setBulkDeleteDialog({
      isOpen: true,
      context,
      selectedIds
    });
  };

  const handleBulkDelete = async () => {
    if (bulkDeleteDialog.selectedIds.length === 0) return;
    
    try {
      await bulkDeleteAssignmentsMutation.mutateAsync(bulkDeleteDialog.selectedIds);
      setBulkDeleteDialog({ isOpen: false, context: 'teacher', selectedIds: [] });
    } catch (error) {
      // Error handled by mutation onError
    }
  };

  // State for team teaching dialog
  const [teamTeachingDialog, setTeamTeachingDialog] = useState<{
    isOpen: boolean;
    assignmentId: string | null;
    availableTeachers: Teacher[];
    selectedTeacherIds: Set<string>;
  }>({
    isOpen: false,
    assignmentId: null,
    availableTeachers: [],
    selectedTeacherIds: new Set(),
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

  // UX Safety: Reset selections when context changes to prevent accidental deletion of non-visible items
  
  // Reset all selections when switching between teacher/class tabs
  useEffect(() => {
    setSelectedTeacherAssignments(new Set());
    setSelectedClassAssignments(new Set());
  }, [activeTab]);

  // Reset teacher selections when changing selected teacher
  useEffect(() => {
    setSelectedTeacherAssignments(new Set());
  }, [selectedTeacherId]);

  // Reset class selections when changing selected class
  useEffect(() => {
    setSelectedClassAssignments(new Set());
  }, [selectedClassId]);

  // Reset all selections when changing semester filter
  useEffect(() => {
    setSelectedTeacherAssignments(new Set());
    setSelectedClassAssignments(new Set());
  }, [selectedSemester]);

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

  // Calculate teacher summary statistics with team teaching support
  const teacherSummary = useMemo(() => {
    // Use the same grouping logic as teacherWorkloadBySemester for consistency
    const processedAssignments = new Map<string, { hours: number; semester: string }>();
    
    teacherAssignments.forEach(assignment => {
      const hours = parseFloat(assignment.hoursPerWeek);
      
      // Skip 0-hour assignments as they're often placeholders
      if (hours <= 0) return;
      
      // For team teaching, we need to count the hours for each teacher individually
      // but avoid double-counting within the same teacher's workload
      const groupKey = assignment.teamTeachingId 
        ? `team-${assignment.teamTeachingId}-${assignment.classId}-${assignment.subjectId}-${assignment.semester}-${assignment.teacherId}`
        : `individual-${assignment.classId}-${assignment.subjectId}-${assignment.teacherId}-${assignment.semester}`;
      
      const existing = processedAssignments.get(groupKey);
      
      // Keep the assignment with maximum hours (handles duplicates)
      if (!existing || hours > existing.hours) {
        processedAssignments.set(groupKey, {
          hours: hours,
          semester: assignment.semester
        });
      }
    });
    
    // Calculate semester hours from processed assignments
    const s1Hours = Array.from(processedAssignments.values())
      .filter(a => a.semester === "1")
      .reduce((sum, a) => sum + a.hours, 0);
      
    const s2Hours = Array.from(processedAssignments.values())
      .filter(a => a.semester === "2")
      .reduce((sum, a) => sum + a.hours, 0);
    
    const totalHours = s1Hours + s2Hours;
    
    return { totalHours, s1Hours, s2Hours };
  }, [teacherAssignments]);

  // Calculate available hours after reduction for selected teacher
  const totalReductionHours = useMemo(() => {
    if (!selectedTeacher?.reductionHours) return 0;
    return Object.values(selectedTeacher.reductionHours as Record<string, number>).reduce((sum, hours) => {
      const numeric = typeof hours === "number" ? hours : parseFloat(hours ?? "0");
      return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);
  }, [selectedTeacher]);

  const availableHours = useMemo(() => {
    if (!selectedTeacher) return 0;
    const maxHours = parseFloat(selectedTeacher.maxHours ?? "0");
    return Math.max(0, maxHours - totalReductionHours);
  }, [selectedTeacher, totalReductionHours]);

  const workloadPercentage = useMemo(() => {
    if (availableHours === 0) return 0;
    return Math.round((teacherSummary.totalHours / availableHours) * 100);
  }, [availableHours, teacherSummary.totalHours]);

  // Calculate class summary statistics with team teaching support
  const classSummary = useMemo(() => {
    // Group assignments to prevent double-counting of team teaching hours
    // Each team teaching group should only count hours once toward class totals
    const uniqueAssignments = new Map<string, { subject: string; teacher: string; hours: number; semester: string }>();
    
    classAssignments.forEach(assignment => {
      const hours = parseFloat(assignment.hoursPerWeek);
      
      // Skip 0-hour assignments as they're often placeholders
      if (hours <= 0) return;
      
      // For team teaching, use teamTeachingId as the grouping key to count hours only once per team
      // For regular assignments, use the individual assignment details
      const groupKey = assignment.teamTeachingId 
        ? `team-${assignment.teamTeachingId}-${assignment.subjectId}-${assignment.semester}`
        : `individual-${assignment.subjectId}-${assignment.teacherId}-${assignment.semester}`;
      
      const existing = uniqueAssignments.get(groupKey);
      
      // Keep the assignment with maximum hours (handles duplicates)
      // For team teaching, this ensures we only count the hours once per team
      if (!existing || hours > existing.hours) {
        uniqueAssignments.set(groupKey, {
          subject: assignment.subjectId,
          teacher: assignment.teacherId,
          hours: hours,
          semester: assignment.semester
        });
      }
    });
    
    // Calculate semester hours from grouped assignments
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
    const processedParallelGroups = new Set<string>();
    
    for (const [subjectShortName, semesters] of Object.entries(subjectHours)) {
      const subject = subjects.find(s => s.shortName === subjectShortName);
      if (!subject) continue;
      
      // If this subject has a parallel group, show all subjects in that group
      if (subject.parallelGroup && !processedParallelGroups.has(subject.parallelGroup)) {
        processedParallelGroups.add(subject.parallelGroup);
        
        // Find all subjects in this parallel group
        const parallelSubjects = subjects.filter(s => s.parallelGroup === subject.parallelGroup);
        
        // Add requirements for each parallel subject
        parallelSubjects.forEach(parallelSubject => {
          const subjectAssignments = classAssignments.filter(a => a.subjectId === parallelSubject.id);
          const uniqueSubjectAssignments = new Map<string, { hours: number; semester: string }>();
          
          subjectAssignments.forEach(assignment => {
            const hours = parseFloat(assignment.hoursPerWeek);
            if (hours <= 0) return;
            
            const groupKey = assignment.teamTeachingId 
              ? `team-${assignment.teamTeachingId}-${assignment.subjectId}-${assignment.semester}`
              : `individual-${assignment.subjectId}-${assignment.teacherId}-${assignment.semester}`;
            
            const existing = uniqueSubjectAssignments.get(groupKey);
            if (!existing || hours > existing.hours) {
              uniqueSubjectAssignments.set(groupKey, {
                hours: hours,
                semester: assignment.semester
              });
            }
          });
          
          const assignedHours = {
            "1": Array.from(uniqueSubjectAssignments.values())
              .filter(a => a.semester === "1")
              .reduce((sum, a) => sum + a.hours, 0),
            "2": Array.from(uniqueSubjectAssignments.values())
              .filter(a => a.semester === "2")
              .reduce((sum, a) => sum + a.hours, 0)
          };
          
          requirements.push({
            subject: parallelSubject,
            required: semesters, // Same required hours for all parallel subjects
            assigned: assignedHours,
            deficit: {
              "1": Math.max(0, semesters["1"] - assignedHours["1"]),
              "2": Math.max(0, semesters["2"] - assignedHours["2"])
            }
          });
        });
      } else if (!subject.parallelGroup) {
        // No parallel group - process normally
        const subjectAssignments = classAssignments.filter(a => a.subjectId === subject.id);
        const uniqueSubjectAssignments = new Map<string, { hours: number; semester: string }>();
        
        subjectAssignments.forEach(assignment => {
          const hours = parseFloat(assignment.hoursPerWeek);
          if (hours <= 0) return;
          
          const groupKey = assignment.teamTeachingId 
            ? `team-${assignment.teamTeachingId}-${assignment.subjectId}-${assignment.semester}`
            : `individual-${assignment.subjectId}-${assignment.teacherId}-${assignment.semester}`;
          
          const existing = uniqueSubjectAssignments.get(groupKey);
          if (!existing || hours > existing.hours) {
            uniqueSubjectAssignments.set(groupKey, {
              hours: hours,
              semester: assignment.semester
            });
          }
        });
        
        const assignedHours = {
          "1": Array.from(uniqueSubjectAssignments.values())
            .filter(a => a.semester === "1")
            .reduce((sum, a) => sum + a.hours, 0),
          "2": Array.from(uniqueSubjectAssignments.values())
            .filter(a => a.semester === "2")
            .reduce((sum, a) => sum + a.hours, 0)
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
    }
    
    return requirements.sort((a, b) => a.subject.shortName.localeCompare(b.subject.shortName));
  }, [selectedClass, classAssignments, subjects]);

  // Calculate teacher workload per semester (assigned hours per teacher per semester)
  const teacherWorkloadBySemester = useMemo(() => {
    if (!extendedAssignments) return new Map();
    
    const workloadMap = new Map<string, { "1": number; "2": number; total: number }>();
    
    // First, group assignments to handle team teaching correctly
    // Each team teaching group should only count hours once per teacher
    const processedAssignments = new Map<string, { teacherId: string; hours: number; semester: string }>();
    
    extendedAssignments.forEach(assignment => {
      const hours = parseFloat(assignment.hoursPerWeek);
      
      // Skip 0-hour assignments as they're often placeholders
      if (hours <= 0) return;
      
      // For team teaching, we need to count the hours for each teacher individually
      // but avoid double-counting within the same teacher's workload
      const groupKey = assignment.teamTeachingId 
        ? `team-${assignment.teamTeachingId}-${assignment.classId}-${assignment.subjectId}-${assignment.semester}-${assignment.teacherId}`
        : `individual-${assignment.classId}-${assignment.subjectId}-${assignment.teacherId}-${assignment.semester}`;
      
      const existing = processedAssignments.get(groupKey);
      
      // Keep the assignment with maximum hours (handles duplicates)
      if (!existing || hours > existing.hours) {
        processedAssignments.set(groupKey, {
          teacherId: assignment.teacherId,
          hours: hours,
          semester: assignment.semester
        });
      }
    });
    
    // Now calculate workload from processed assignments
    Array.from(processedAssignments.values()).forEach(processedAssignment => {
      const teacherId = processedAssignment.teacherId;
      const current = workloadMap.get(teacherId) || { "1": 0, "2": 0, total: 0 };
      
      if (processedAssignment.semester === "1") {
        current["1"] += processedAssignment.hours;
      } else if (processedAssignment.semester === "2") {
        current["2"] += processedAssignment.hours;
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

  // Team Teaching Helper Functions
  const getTeamTeachingGroups = useMemo(() => {
    if (!assignments) return new Map();
    
    const groups = new Map<string, Assignment[]>();
    assignments.filter(a => a.teamTeachingId).forEach(assignment => {
      const teamId = assignment.teamTeachingId!;
      if (!groups.has(teamId)) {
        groups.set(teamId, []);
      }
      groups.get(teamId)!.push(assignment);
    });
    
    return groups;
  }, [assignments]);

  const isTeamTeaching = useCallback((assignment: Assignment): boolean => {
    return !!assignment.teamTeachingId;
  }, []);

  const getTeamMates = useCallback((assignment: Assignment): Assignment[] => {
    if (!assignment.teamTeachingId) return [];
    const group = getTeamTeachingGroups.get(assignment.teamTeachingId);
    return group ? group.filter((a: Assignment) => a.id !== assignment.id) : [];
  }, [getTeamTeachingGroups]);

  const getTeamTeachersDisplay = useCallback((assignment: Assignment): string => {
    if (!assignment.teamTeachingId) return '';
    const group = getTeamTeachingGroups.get(assignment.teamTeachingId);
    if (!group || group.length <= 1) return '';
    
    const teacherNames = group
      .map((a: Assignment) => teacherMap.get(a.teacherId)?.shortName)
      .filter(Boolean)
      .sort()
      .join(' & ');
    
    return teacherNames;
  }, [getTeamTeachingGroups, teacherMap]);

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
        <div className="p-4">
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
            <TabsContent value="teacher" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                            {teacher.lastName}, {teacher.firstName} ({teacher.shortName})
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
                  {/* Consolidated Assignment Overview */}
                  <Card data-testid="card-teacher-overview" className="mb-4">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <BookOpen className="text-indigo-600 dark:text-indigo-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">Zuweisungen</p>
                            <p className="text-2xl font-bold" data-testid="text-teacher-total-assignments">
                              {teacherAssignments.length}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <BookOpen className="text-cyan-600 dark:text-cyan-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">Fächer</p>
                            <p className="text-2xl font-bold" data-testid="text-teacher-subjects">
                              {new Set(teacherAssignments.map(a => a.subjectId)).size}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <School className="text-teal-600 dark:text-teal-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">Klassen</p>
                            <p className="text-2xl font-bold" data-testid="text-teacher-classes">
                              {new Set(teacherAssignments.map(a => a.classId)).size}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="text-red-600 dark:text-red-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">Konflikte</p>
                            <p className="text-2xl font-bold" data-testid="text-teacher-conflicts">
                              {(() => {
                                const conflicts = teacherAssignments.filter(assignment => {
                                  const teacher = teachers?.find(t => t.id === assignment.teacherId);
                                  const subject = subjects?.find(s => s.id === assignment.subjectId);
                                  
                                  if (!teacher || !subject) return false;
                                  
                                  // Check qualification
                                  const teacherSubjects = teacher.subjects.flatMap(subjectString => 
                                    subjectString.split(',').map(s => s.trim().toUpperCase())
                                  );
                                  const subjectShortName = subject.shortName.trim().toUpperCase();
                                  if (!teacherSubjects.includes(subjectShortName)) return true;
                                  
                                  // Check overload
                                  const semesterAssignments = teacherAssignments.filter(a => a.semester === assignment.semester);
                                  const semesterHours = semesterAssignments.reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
                                  return semesterHours > parseFloat(teacher.maxHours);
                                });
                                return conflicts.length;
                              })()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Users className="text-emerald-600 dark:text-emerald-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">Auslastung</p>
                            <p className="text-2xl font-bold" data-testid="text-teacher-workload">
                              {workloadPercentage}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {teacherSummary.totalHours.toFixed(1)} / {availableHours.toFixed(1)}h
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Consolidated Teacher Hours Summary */}
                  <Card data-testid="card-teacher-hours" className="mb-4">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Clock className="text-blue-600 dark:text-blue-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">Max pro Halbjahr</p>
                            <p className="text-2xl font-bold" data-testid="text-teacher-max-hours">
                              {selectedTeacher?.maxHours || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">Wochenstunden</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <BookOpen className="text-green-600 dark:text-green-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">1. Halbjahr</p>
                            <p className="text-2xl font-bold" data-testid="text-teacher-s1-hours">
                              {teacherSummary.s1Hours}
                            </p>
                            {selectedTeacher && (
                              <p className="text-xs text-muted-foreground">
                                {Math.max(0, availableHours - teacherSummary.s1Hours).toFixed(1)} verfügbar
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <BookOpen className="text-orange-600 dark:text-orange-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">2. Halbjahr</p>
                            <p className="text-2xl font-bold" data-testid="text-teacher-s2-hours">
                              {teacherSummary.s2Hours}
                            </p>
                            {selectedTeacher && (
                              <p className="text-xs text-muted-foreground">
                                {Math.max(0, availableHours - teacherSummary.s2Hours).toFixed(1)} verfügbar
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center flex-shrink-0">
                            <GraduationCap className="text-purple-600 dark:text-purple-400 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">Ermäßigungsstunden</p>
                            {selectedTeacher?.reductionHours ? (
                              <div>
                                <p className="text-2xl font-bold" data-testid="text-teacher-reduction-total">
                                  {Object.values(selectedTeacher.reductionHours as Record<string, number>)
                                    .reduce((sum, hours) => sum + hours, 0)}
                                </p>
                                <div className="text-xs text-muted-foreground">
                                  {Object.entries(selectedTeacher.reductionHours as Record<string, number>)
                                    .filter(([_, hours]) => hours > 0)
                                    .map(([type, hours]) => (
                                      <span key={type} className="mr-2" data-testid={`text-reduction-${type.toLowerCase()}`}>
                                        {type}: {hours}h
                                      </span>
                                    ))}
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-2xl font-bold" data-testid="text-teacher-reduction-total">0</p>
                                <p className="text-xs text-muted-foreground">Reduzierung</p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Teacher Assignments Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Stundenplan für {selectedTeacher.firstName} {selectedTeacher.lastName}</span>
                        {selectedTeacherAssignments.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openBulkDeleteDialog('teacher')}
                            data-testid="button-bulk-delete-teacher"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {selectedTeacherAssignments.size} ausgewählte löschen
                          </Button>
                        )}
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
                              <TableHead className="w-12">
                                <Checkbox
                                  checked={teacherAssignments.length > 0 && selectedTeacherAssignments.size === teacherAssignments.length}
                                  onCheckedChange={(checked) => selectAllTeacherAssignments(checked as boolean)}
                                  data-testid="checkbox-select-all-teacher"
                                />
                              </TableHead>
                              <TableHead>Klasse</TableHead>
                              <TableHead>Fach</TableHead>
                              <TableHead>Stunden</TableHead>
                              <TableHead>Semester</TableHead>
                              <TableHead className="text-center">Aktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {teacherAssignments.map((assignment) => {
                              // Calculate conflict status for this assignment
                              const getAssignmentConflictStatus = () => {
                                const teacher = teachers?.find(t => t.id === assignment.teacherId);
                                const subject = subjects?.find(s => s.id === assignment.subjectId);
                                
                                if (!teacher || !subject) return null;
                                
                                // Check qualification
                                const teacherSubjects = teacher.subjects.flatMap(subjectString => 
                                  subjectString.split(',').map(s => s.trim().toUpperCase())
                                );
                                const subjectShortName = subject.shortName.trim().toUpperCase();
                                if (!teacherSubjects.includes(subjectShortName)) {
                                  return { type: "error", message: "Keine Qualifikation" };
                                }
                                
                                // Check semester workload
                                const semesterAssignments = teacherAssignments.filter(a => a.semester === assignment.semester);
                                const semesterHours = semesterAssignments.reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
                                const maxHours = parseFloat(teacher.maxHours);
                                
                                if (semesterHours > maxHours) {
                                  return { type: "error", message: `Überbelastung ${assignment.semester}.HJ` };
                                }
                                
                                if (semesterHours > maxHours * 0.9) {
                                  return { type: "warning", message: `Hohe Belastung ${assignment.semester}.HJ` };
                                }
                                
                                return { type: "success", message: "OK" };
                              };

                              const conflictStatus = getAssignmentConflictStatus();

                              return (
                              <TableRow key={assignment.id} data-testid={`row-teacher-assignment-${assignment.id}`}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedTeacherAssignments.has(assignment.id)}
                                    onCheckedChange={() => toggleTeacherAssignmentSelection(assignment.id)}
                                    data-testid={`checkbox-teacher-assignment-${assignment.id}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {assignment.class?.name || 'Unbekannt'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="light">
                                    {assignment.subject?.shortName || assignment.subject?.name || 'Unbekannt'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{assignment.hoursPerWeek}</TableCell>
                                <TableCell>
                                  <Badge variant="light">
                                    {assignment.semester === "1" ? "1. HJ" : "2. HJ"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {conflictStatus && (
                                    <div className="flex items-center">
                                      {conflictStatus.type === "error" && (
                                        <AlertTriangle className="w-4 h-4 text-red-500 mr-1" />
                                      )}
                                      {conflictStatus.type === "warning" && (
                                        <AlertTriangle className="w-4 h-4 text-orange-500 mr-1" />
                                      )}
                                      {conflictStatus.type === "success" && (
                                        <div className="w-4 h-4 rounded-full bg-green-500 mr-1"></div>
                                      )}
                                      <Badge 
                                        variant={
                                          conflictStatus.type === "error" ? "destructive" :
                                          conflictStatus.type === "warning" ? "light" : "light"
                                        }
                                      >
                                        {conflictStatus.message}
                                      </Badge>
                                    </div>
                                  )}
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
                            );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Class Tab Content */}
            <TabsContent value="class" className="space-y-4">
              {/* Type Filter */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-base font-semibold">Typ filtern</span>
                    <div className="flex items-center space-x-2 flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedClassType("all")}
                        className={`px-4 py-2 rounded-full text-sm transition-colors ${
                          selectedClassType === "all" 
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium" 
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                        data-testid="filter-all-classes"
                      >
                        Alle
                      </button>
                      <button
                        onClick={() => setSelectedClassType("klasse")}
                        className={`px-4 py-2 rounded-full text-sm transition-colors ${
                          selectedClassType === "klasse" 
                            ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 font-medium" 
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                        data-testid="filter-klasse-classes"
                      >
                        Klassen
                      </button>
                      <button
                        onClick={() => setSelectedClassType("kurs")}
                        className={`px-4 py-2 rounded-full text-sm transition-colors ${
                          selectedClassType === "kurs" 
                            ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 font-medium" 
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                        data-testid="filter-kurs-classes"
                      >
                        Kurse
                      </button>
                      <button
                        onClick={() => setSelectedClassType("ag")}
                        className={`px-4 py-2 rounded-full text-sm transition-colors ${
                          selectedClassType === "ag" 
                            ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 font-medium" 
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                        data-testid="filter-ag-classes"
                      >
                        AGs
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold flex items-center">
                        <School className="mr-2 h-4 w-4 text-primary" />
                        Klasse auswählen
                      </label>
                      <Select value={selectedClassId} onValueChange={setSelectedClassId} data-testid="select-class">
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Wählen Sie eine Klasse aus..." />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredClasses?.map((cls) => (
                            <SelectItem key={cls.id} value={cls.id}>
                              {cls.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold flex items-center">
                        <Calendar className="mr-2 h-4 w-4 text-primary" />
                        Halbjahr filtern
                      </label>
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
                    </div>
                  </div>
                </CardContent>
              </Card>

              {selectedClass && (
                <>
                  {/* Compact Class Summary Card */}
                  <Card data-testid="card-class-summary">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                        {/* Class Info */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <GraduationCap className="text-blue-600 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-foreground/70">Klasse</p>
                            <p className="font-bold text-foreground">{selectedClass.name}</p>
                            <p className="text-xs text-foreground/60">Stufe {selectedClass.grade} • {selectedClass.studentCount} SuS</p>
                          </div>
                        </div>

                        {/* Total Hours */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Clock className="text-purple-600 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-foreground/70">Gesamtstunden</p>
                            <p className="font-bold text-foreground" data-testid="text-class-total-hours">{classSummary.totalHours}h</p>
                            <p className="text-xs text-foreground/60">
                              <span data-testid="text-class-s1-hours">{classSummary.s1Hours}h</span> • <span data-testid="text-class-s2-hours">{classSummary.s2Hours}h</span>
                            </p>
                          </div>
                        </div>

                        {/* Teachers */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Users className="text-green-600 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-foreground/70">Lehrkräfte</p>
                            <p className="font-bold text-foreground text-2xl" data-testid="text-class-teachers">{classSummary.teacherCount}</p>
                          </div>
                        </div>

                        {/* Semester Info */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Calendar className="text-orange-600 h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs text-foreground/70">Halbjahre</p>
                            <p className="font-bold text-foreground">1. HJ & 2. HJ</p>
                            <p className="text-xs text-foreground/60">
                              {selectedClass.targetHoursSemester1}h • {selectedClass.targetHoursSemester2}h
                            </p>
                          </div>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {subjectRequirements.map((req) => (
                            <div key={req.subject.id} className="border rounded-lg p-2">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="light">{req.subject.shortName}</Badge>
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

                  {/* Compact Assignment Overview */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <BookOpen className="mr-2 text-primary" />
                        Stundenübersicht nach Fächern
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {(() => {
                          // Get current class grade
                          const currentGrade = selectedClass.grade;
                          const currentGradeNumber = currentGrade;

                          // Collect all grade-wide assignments for parallel subjects
                          // These assignments are shared across ALL classes in the same grade
                          const gradeWideAssignments = assignments?.filter(a => {
                            const assignmentClass = classes?.find(c => c.id === a.classId);
                            if (!assignmentClass) return false;
                            
                            const assignmentSubject = subjects?.find(s => s.id === a.subjectId);
                            if (!assignmentSubject?.parallelGroup) return false;
                            
                            // Check if same grade
                            if (assignmentClass.grade !== currentGrade) return false;
                            
                            // For Differenzierung, only show from grade 7+
                            if (assignmentSubject.parallelGroup === 'Differenzierung' && currentGradeNumber < 7) {
                              return false;
                            }
                            
                            return true;
                          }) || [];

                          // Start with all subjects from subjectRequirements
                          const groupedAssignments: Record<string, {
                            subjectName: string;
                            subjectShortName: string;
                            semesters: Record<string, {
                              totalHours: number;
                              teachers: { name: string; shortName: string; hours: number; isTeamTeaching: boolean }[];
                              assignments: typeof classAssignments;
                            }>;
                          }> = {};

                          // Initialize all subjects from requirements
                          subjectRequirements.forEach(req => {
                            const subjectId = req.subject.id;
                            groupedAssignments[subjectId] = {
                              subjectName: req.subject.name,
                              subjectShortName: req.subject.shortName,
                              semesters: {}
                            };
                          });

                          // Always show all subjects from grade-wide parallel groups
                          const gradeWideParallelGroups = ['Religion'];
                          if (currentGradeNumber >= 7) {
                            gradeWideParallelGroups.push('Differenzierung');
                          }
                          
                          const processedParallelGroups = new Set<string>();
                          
                          gradeWideParallelGroups.forEach(groupName => {
                            if (subjects && !processedParallelGroups.has(groupName)) {
                              processedParallelGroups.add(groupName);
                              const parallelSubjects = subjects.filter(s => s.parallelGroup === groupName);
                              
                              parallelSubjects.forEach(parallelSubject => {
                                if (!groupedAssignments[parallelSubject.id]) {
                                  groupedAssignments[parallelSubject.id] = {
                                    subjectName: parallelSubject.name,
                                    subjectShortName: parallelSubject.shortName,
                                    semesters: {}
                                  };
                                }
                              });
                            }
                          });

                          // Add grade-wide assignments (from ALL classes in the grade)
                          gradeWideAssignments.forEach(assignment => {
                            const subjectId = assignment.subjectId;
                            const subject = subjects?.find(s => s.id === subjectId);
                            const subjectName = subject?.name || 'Unbekannt';
                            const subjectShortName = subject?.shortName || '??';
                            const semester = assignment.semester || '1';
                            const hours = parseFloat(assignment.hoursPerWeek) || 0;
                            const teacher = teachers?.find(t => t.id === assignment.teacherId);
                            const teacherName = teacher ? 
                              `${teacher.lastName}, ${teacher.firstName}` : 
                              'Unbekannt';
                            const teacherShortName = teacher?.shortName || '??';
                            const isTeamTeaching = !!assignment.teamTeachingId;

                            if (!groupedAssignments[subjectId]) {
                              groupedAssignments[subjectId] = {
                                subjectName,
                                subjectShortName,
                                semesters: {}
                              };
                            }

                            if (!groupedAssignments[subjectId].semesters[semester]) {
                              groupedAssignments[subjectId].semesters[semester] = {
                                totalHours: 0,
                                teachers: [],
                                assignments: []
                              };
                            }

                            groupedAssignments[subjectId].semesters[semester].totalHours += hours;
                            groupedAssignments[subjectId].semesters[semester].teachers.push({
                              name: teacherName,
                              shortName: teacherShortName,
                              hours,
                              isTeamTeaching
                            });
                            groupedAssignments[subjectId].semesters[semester].assignments.push(assignment);
                          });

                          // Add regular class-specific assignments (non-parallel subjects)
                          classAssignments.forEach(assignment => {
                            const assignedSubject = subjects?.find(s => s.id === assignment.subject?.id);
                            
                            // Skip parallel subjects (already handled by grade-wide assignments)
                            if (assignedSubject?.parallelGroup) {
                              return;
                            }

                            const subjectId = assignment.subject?.id || 'unknown';
                            const subjectName = assignment.subject?.name || 'Unbekannt';
                            const subjectShortName = assignment.subject?.shortName || '??';
                            const semester = assignment.semester || '1';
                            const hours = parseFloat(assignment.hoursPerWeek) || 0;
                            const teacherName = assignment.teacher ? 
                              `${assignment.teacher.lastName}, ${assignment.teacher.firstName}` : 
                              'Unbekannt';
                            const teacherShortName = assignment.teacher?.shortName || '??';
                            const isTeamTeaching = !!assignment.teamTeachingId;

                            // Create entry if it doesn't exist
                            if (!groupedAssignments[subjectId]) {
                              groupedAssignments[subjectId] = {
                                subjectName,
                                subjectShortName,
                                semesters: {}
                              };
                            }

                            if (!groupedAssignments[subjectId].semesters[semester]) {
                              groupedAssignments[subjectId].semesters[semester] = {
                                totalHours: 0,
                                teachers: [],
                                assignments: []
                              };
                            }

                            groupedAssignments[subjectId].semesters[semester].totalHours += hours;
                            groupedAssignments[subjectId].semesters[semester].teachers.push({
                              name: teacherName,
                              shortName: teacherShortName,
                              hours,
                              isTeamTeaching
                            });
                            groupedAssignments[subjectId].semesters[semester].assignments.push(assignment);
                          });

                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                              {Object.entries(groupedAssignments).sort(([, a], [, b]) => 
                                a.subjectShortName.localeCompare(b.subjectShortName)
                              ).map(([subjectId, data]) => {
                                const hasSemester1 = !!data.semesters['1'];
                                const hasSemester2 = !!data.semesters['2'];
                                const hasAnyAssignments = hasSemester1 || hasSemester2;

                                return (
                                  <div 
                                    key={subjectId} 
                                    className={`border rounded px-1 py-0.5 ${hasAnyAssignments ? 'bg-muted/20' : 'bg-muted/5 opacity-60'}`}
                                  >
                                    <div className="flex flex-col items-center mb-0.5 space-y-0.5">
                                      <div className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 text-[10px] font-medium border">
                                        {data.subjectShortName}
                                      </div>
                                      <div className="text-xs text-muted-foreground text-center">
                                        {data.subjectName}
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-0.5">
                                      {['1', '2'].map(semester => {
                                        const semesterData = data.semesters[semester];

                                        return (
                                          <div key={semester} className="flex items-center justify-center space-x-1 text-xs">
                                            <span className="text-muted-foreground text-[10px]">
                                              {semester}.HJ
                                            </span>
                                            {semesterData ? (
                                              <>
                                                <div className="bg-blue-100 dark:bg-blue-900 rounded px-1 py-0.5 text-[10px] font-medium border">
                                                  {semesterData.totalHours}h
                                                </div>
                                                {semesterData.teachers.slice(0, 2).map((teacher, index) => (
                                                  <div 
                                                    key={index} 
                                                    className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 text-[10px] font-medium border"
                                                    title={`${teacher.name} (${teacher.hours}h)${teacher.isTeamTeaching ? ' - Team' : ''}`}
                                                  >
                                                    {teacher.shortName}
                                                  </div>
                                                ))}
                                                {semesterData.teachers.length > 2 && (
                                                  <div 
                                                    className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 text-[10px] font-medium border"
                                                    title={`+${semesterData.teachers.length - 2} weitere: ${semesterData.teachers.slice(2).map(t => t.shortName).join(', ')}`}
                                                  >
                                                    +{semesterData.teachers.length - 2}
                                                  </div>
                                                )}
                                              </>
                                            ) : (
                                              <div className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 text-[10px] font-medium border opacity-50">
                                                -
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        
                        {classAssignments.length === 0 && subjectRequirements.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Noch keine Stundenverteilung vorhanden</p>
                            <p className="text-sm">Verwenden Sie die Tabelle unten, um Zuweisungen zu erstellen</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Class Assignments Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Stundenplan für Klasse {selectedClass.name}</span>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant={isEditMode ? "default" : "outline"}
                            size="sm"
                            onClick={() => setIsEditMode(!isEditMode)}
                            data-testid="button-toggle-edit-mode"
                          >
                            {isEditMode ? (
                              <>
                                <Eye className="h-4 w-4 mr-2" />
                                Ansicht
                              </>
                            ) : (
                              <>
                                <Edit className="h-4 w-4 mr-2" />
                                Bearbeiten
                              </>
                            )}
                          </Button>
                          {selectedClassAssignments.size > 0 && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openBulkDeleteDialog('class')}
                              data-testid="button-bulk-delete-class"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {selectedClassAssignments.size} ausgewählte löschen
                            </Button>
                          )}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {/* Add New Assignment Button */}
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-muted-foreground">
                            {classAssignments.length} Zuweisung{classAssignments.length !== 1 ? 'en' : ''}
                            {!isEditMode && <span className="ml-2 text-blue-600 dark:text-blue-400">• Ansichtsmodus</span>}
                            {isEditMode && <span className="ml-2 text-orange-600 dark:text-orange-400">• Bearbeitungsmodus</span>}
                          </p>
                          {isEditMode && (
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
                          )}
                        </div>

                        <Table data-testid="table-class-assignments">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">
                                <Checkbox
                                  checked={classAssignments.length > 0 && selectedClassAssignments.size === classAssignments.length}
                                  onCheckedChange={(checked) => selectAllClassAssignments(checked as boolean)}
                                  data-testid="checkbox-select-all-class"
                                />
                              </TableHead>
                              <TableHead>Lehrkraft</TableHead>
                              <TableHead>Fach</TableHead>
                              <TableHead>Stunden</TableHead>
                              <TableHead>Semester</TableHead>
                              <TableHead className="w-32">Aktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* New Assignment Row */}
                            {newAssignment && isEditMode && (
                              <TableRow data-testid="row-new-assignment">
                                <TableCell>
                                  {/* Empty cell for checkbox column in new assignment row */}
                                </TableCell>
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
                                                <span>{teacher.lastName}, {teacher.firstName} ({teacher.shortName})</span>
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
                                  {isEditMode ? (
                                    <Checkbox
                                      checked={selectedClassAssignments.has(assignment.id)}
                                      onCheckedChange={() => toggleClassAssignmentSelection(assignment.id)}
                                      data-testid={`checkbox-class-assignment-${assignment.id}`}
                                    />
                                  ) : (
                                    <div className="w-4"></div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isEditMode ? (
                                    <Select
                                      value={getEffectiveValue(assignment, 'teacherId') as string}
                                      onValueChange={(value) => updateEditedAssignment(assignment.id, 'teacherId', value)}
                                      data-testid={`select-teacher-${assignment.id}`}
                                    >
                                    <SelectTrigger className="w-full">
                                      <SelectValue>
                                        <div className="flex items-center space-x-2">
                                          <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                                            <span className="text-black dark:text-white text-xs font-medium">
                                              {assignment.teacher?.shortName || '??'}
                                            </span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-sm">
                                              {assignment.teacher ? 
                                                `${assignment.teacher.lastName}, ${assignment.teacher.firstName}` : 
                                                'Unbekannt'}
                                            </span>
                                            {isTeamTeaching(assignment) && (
                                              <Badge variant="light" className="text-xs mt-1 w-fit">
                                                <Users className="h-3 w-3 mr-1" />
                                                Team: {getTeamTeachersDisplay(assignment)}
                                              </Badge>
                                            )}
                                          </div>
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
                                                <span>{teacher.lastName}, {teacher.firstName} ({teacher.shortName})</span>
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
                                  ) : (
                                    <div className="flex items-center space-x-2">
                                      <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                                        <span className="text-black dark:text-white text-xs font-medium">
                                          {assignment.teacher?.shortName || '??'}
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-sm">
                                          {assignment.teacher ? 
                                            `${assignment.teacher.lastName}, ${assignment.teacher.firstName}` : 
                                            'Unbekannt'}
                                        </span>
                                        {isTeamTeaching(assignment) && (
                                          <Badge variant="light" className="text-xs mt-1 w-fit">
                                            <Users className="h-3 w-3 mr-1" />
                                            Team: {getTeamTeachersDisplay(assignment)}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isEditMode ? (
                                    <Select
                                      value={getEffectiveValue(assignment, 'subjectId') as string}
                                      onValueChange={(value) => updateEditedAssignment(assignment.id, 'subjectId', value)}
                                      data-testid={`select-subject-${assignment.id}`}
                                    >
                                    <SelectTrigger className="w-full">
                                      <SelectValue>
                                        <Badge variant="light">
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
                                  ) : (
                                    <Badge variant="light">
                                      {assignment.subject?.shortName || assignment.subject?.name || 'Unbekannt'}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isEditMode ? (
                                    <Input
                                      type="number"
                                      min="1"
                                      max="40"
                                      value={parseFloat(getEffectiveValue(assignment, 'hoursPerWeek') as string)}
                                      onChange={(e) => updateEditedAssignment(assignment.id, 'hoursPerWeek', parseInt(e.target.value) || 1)}
                                      data-testid={`input-hours-${assignment.id}`}
                                      className="w-20"
                                    />
                                  ) : (
                                    <span className="font-medium">{assignment.hoursPerWeek}h</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isEditMode ? (
                                    <Select
                                      value={getEffectiveValue(assignment, 'semester') as string}
                                      onValueChange={(value: "1" | "2") => updateEditedAssignment(assignment.id, 'semester', value)}
                                      data-testid={`select-semester-${assignment.id}`}
                                    >
                                      <SelectTrigger className="w-24">
                                        <SelectValue>
                                          <Badge variant="light">
                                            {assignment.semester === "1" ? "1. HJ" : "2. HJ"}
                                          </Badge>
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="1">1. HJ</SelectItem>
                                        <SelectItem value="2">2. HJ</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge variant="light">
                                      {assignment.semester === "1" ? "1. HJ" : "2. HJ"}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isEditMode && (
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
                                    {/* Team Teaching Buttons */}
                                    {!isTeamTeaching(assignment) ? (
                                      <Button
                                        onClick={() => {
                                          const currentSubjectId = getEffectiveValue(assignment, 'subjectId') as string;
                                          const qualifiedTeachers = getQualifiedTeachers(currentSubjectId)
                                            .filter(t => t.id !== assignment.teacherId);
                                          setTeamTeachingDialog({
                                            isOpen: true,
                                            assignmentId: assignment.id,
                                            availableTeachers: qualifiedTeachers,
                                            selectedTeacherIds: new Set(),
                                          });
                                        }}
                                        variant="outline"
                                        size="sm"
                                        title="Co-Teacher hinzufügen"
                                        data-testid={`button-add-team-${assignment.id}`}
                                      >
                                        <Users className="h-3 w-3" />
                                      </Button>
                                    ) : (
                                      <Button
                                        onClick={() => removeFromTeamTeachingMutation.mutate(assignment.id)}
                                        variant="outline"
                                        size="sm"
                                        title="Aus Team entfernen"
                                        data-testid={`button-remove-team-${assignment.id}`}
                                      >
                                        <Users className="h-3 w-3" />
                                        ✕
                                      </Button>
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
                                  )}
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

        {/* Team Teaching Dialog */}
        <Dialog 
          open={teamTeachingDialog.isOpen} 
          onOpenChange={(open) => setTeamTeachingDialog(prev => ({ ...prev, isOpen: open, selectedTeacherIds: new Set() }))}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Co-Teacher hinzufügen</DialogTitle>
              <DialogDescription>
                Wählen Sie einen qualifizierten Lehrer als Co-Teacher für diese Stunde aus.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-3">
              <div className="max-h-60 overflow-y-auto">
                {teamTeachingDialog.availableTeachers.map((teacher) => {
                  const isSelected = teamTeachingDialog.selectedTeacherIds.has(teacher.id);
                  return (
                    <div 
                      key={teacher.id} 
                      className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-primary/10 border-primary' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        setTeamTeachingDialog(prev => {
                          const newSelectedIds = new Set(prev.selectedTeacherIds);
                          if (isSelected) {
                            newSelectedIds.delete(teacher.id);
                          } else {
                            newSelectedIds.add(teacher.id);
                          }
                          return { ...prev, selectedTeacherIds: newSelectedIds };
                        });
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Controlled by parent onClick
                          className="h-4 w-4 text-primary"
                          data-testid={`checkbox-coteacher-${teacher.id}`}
                        />
                        <div>
                          <div className="font-medium">
                            {teacher.lastName}, {teacher.firstName} ({teacher.shortName})
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {getAvailableHours(teacher.id, 0, selectedSemester === 'all' ? undefined : selectedSemester)}h verfügbar
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setTeamTeachingDialog(prev => ({ ...prev, isOpen: false, selectedTeacherIds: new Set() }))}
                data-testid="button-cancel-team-teaching"
              >
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  const selectedIds = Array.from(teamTeachingDialog.selectedTeacherIds);
                  if (teamTeachingDialog.assignmentId && selectedIds.length > 0) {
                    createTeamTeachingMutation.mutate({
                      assignmentId: teamTeachingDialog.assignmentId,
                      teacherIds: selectedIds,
                    });
                  }
                }}
                disabled={teamTeachingDialog.selectedTeacherIds.size === 0 || createTeamTeachingMutation.isPending}
                data-testid="button-save-team-teaching"
              >
                {createTeamTeachingMutation.isPending ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Speichern ({teamTeachingDialog.selectedTeacherIds.size})
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialog.isOpen} onOpenChange={(open) => 
        setBulkDeleteDialog(prev => ({ ...prev, isOpen: open }))
      }>
        <AlertDialogContent data-testid="dialog-bulk-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Mehrere Zuweisungen löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie wirklich <strong>{bulkDeleteDialog.selectedIds.length}</strong> Zuweisungen löschen?
              <br /><br />
              {bulkDeleteDialog.context === 'teacher' ? (
                <>
                  Diese Stunden werden für <strong>{selectedTeacher?.firstName} {selectedTeacher?.lastName}</strong> 
                  wieder verfügbar und können anderen Kollegen zugewiesen werden.
                </>
              ) : (
                <>
                  Diese Stunden werden aus dem Stundenplan von <strong>Klasse {selectedClass?.name}</strong> 
                  entfernt und stehen wieder zur Verfügung.
                </>
              )}
              <br /><br />
              <strong>Diese Aktion kann nicht rückgängig gemacht werden.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteAssignmentsMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteAssignmentsMutation.isPending ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Lösche...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {bulkDeleteDialog.selectedIds.length} Zuweisungen löschen
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}