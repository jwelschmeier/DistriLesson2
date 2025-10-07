import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Presentation, Search, Filter, Calendar, ChevronLeft, ChevronRight, User } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { insertTeacherSchema, type Teacher, type InsertTeacher, type Subject, type Assignment, type Class } from "@shared/schema";
import { calculateCorrectHours, PARALLEL_GROUPS } from '@shared/parallel-subjects';
import { z } from "zod";

const teacherFormSchema = insertTeacherSchema.extend({
  subjects: z.array(z.string()).min(1, "Mindestens ein Fach muss ausgewählt werden"),
  qualifications: z.array(z.string()).optional(),
  personnelNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  maxHours: z.string().optional(), // decimal field as string
  currentHours: z.string().optional(), // decimal field as string
  notes: z.string().optional(),
  reductionHours: z.object({
    AE: z.number().optional(), // Altersermäßigung (automatisch berechnet)
    BA: z.number().optional(), // Besondere Aufgaben
    SL: z.number().optional(), // Schulleitung  
    SO: z.number().optional(), // Sonstiges
    LK: z.number().optional(), // Lehrerkonferenz
    SB: z.number().optional(), // Schwerbehinderung
    VG: z.number().optional(), // Vorgriffsstunden
  }).optional(),
});

type TeacherFormData = z.infer<typeof teacherFormSchema>;

// Load subjects dynamically from API instead of hardcoded list

// Kategorien für Ermäßigungsstunden mit Beschreibungen
const reductionCategories = [
  { key: "AE", label: "AE", description: "Altersermäßigung" },
  { key: "BA", label: "BA", description: "Besondere Aufgaben" },
  { key: "SL", label: "SL", description: "Schulleitung" },
  { key: "SO", label: "SO", description: "Sonstiges" },
  { key: "LK", label: "LK", description: "Lehrerkonferenz" },
  { key: "SB", label: "SB", description: "Schwerbehinderung" },
  { key: "VG", label: "VG", description: "Vorgriffsstunden" },
];

// Automatische Altersermäßigung berechnen mit Beschäftigungsumfang
// Stichtag: 30.08. des jeweiligen Schuljahres
// Neue Regeln:
// - 0,5 Stunden: nach Vollendung des 55. Lebensjahres bei mindestens 50% Beschäftigungsumfang
// - 2,0 Stunden: nach Vollendung des 60. Lebensjahres und mindestens 75% Beschäftigungsumfang
// - 1,5 Stunden: nach Vollendung des 60. Lebensjahres und mindestens 50% Beschäftigungsumfang
function calculateAgeReduction(dateOfBirth: string, currentHours: string | number = "0", maxHours: string | number = "25"): number {
  if (!dateOfBirth) return 0;
  
  const birthDate = new Date(dateOfBirth);
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Stichtag ist der 30.08. des aktuellen Schuljahres
  // Wenn wir nach dem 30.08. sind, dann ist das aktuelle Schuljahr
  // Wenn wir vor dem 30.08. sind, dann ist das vorherige Schuljahr relevant
  const cutoffDate = new Date(currentYear, 7, 30); // 30. August (Monat 7 = August)
  const schoolYear = now >= cutoffDate ? currentYear : currentYear - 1;
  const schoolYearCutoff = new Date(schoolYear, 7, 30);
  
  // Alter am Stichtag berechnen
  const age = schoolYearCutoff.getFullYear() - birthDate.getFullYear();
  const monthDiff = schoolYearCutoff.getMonth() - birthDate.getMonth();
  const dayDiff = schoolYearCutoff.getDate() - birthDate.getDate();
  
  const exactAge = age - (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? 1 : 0);
  
  // Beschäftigungsumfang berechnen - String zu Number konvertieren
  const currentHoursNum = typeof currentHours === 'string' ? parseFloat(currentHours) || 0 : currentHours;
  const maxHoursNum = typeof maxHours === 'string' ? parseFloat(maxHours) || 25 : maxHours;
  const employmentPercentage = maxHoursNum > 0 ? (currentHoursNum / maxHoursNum) * 100 : 0;
  
  // Altersermäßigung nach neuen Regeln
  if (exactAge >= 60) {
    if (employmentPercentage >= 75) {
      return 2.0; // 2,0 Stunden bei >= 75% Beschäftigungsumfang
    } else if (employmentPercentage >= 50) {
      return 1.5; // 1,5 Stunden bei >= 50% Beschäftigungsumfang
    }
  } else if (exactAge >= 55) {
    if (employmentPercentage >= 50) {
      return 0.5; // 0,5 Stunden bei >= 50% Beschäftigungsumfang
    }
  }
  
  return 0;
}

export default function Lehrerverwaltung() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSubject, setFilterSubject] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teachers, isLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  // Load subjects dynamically from API
  const { data: subjects = [], isLoading: isLoadingSubjects } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  // Load assignments to calculate actual teacher workload
  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: () => fetch("/api/assignments?minimal=true").then(res => res.json())
  });

  // Load classes for correct hours calculation
  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  // OPTIMIZATION: Build teacherId->assignments index with single O(n) pass instead of O(n·m) filters
  const teacherAssignmentsMap = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    assignments.forEach(assignment => {
      const teacherAssignments = map.get(assignment.teacherId) || [];
      teacherAssignments.push(assignment);
      map.set(assignment.teacherId, teacherAssignments);
    });
    return map;
  }, [assignments]);

  // OPTIMIZATION: Pre-calculate hours for all teachers once instead of on-demand per teacher
  const teacherHoursMap = useMemo(() => {
    const hoursMap = new Map<string, number>();
    
    // Group assignments by class and semester to calculate correct hours
    const assignmentsByClassAndSemester = new Map<string, Assignment[]>();
    assignments.forEach(assignment => {
      const key = `${assignment.classId}-${assignment.semester}`;
      const existing = assignmentsByClassAndSemester.get(key) || [];
      existing.push(assignment);
      assignmentsByClassAndSemester.set(key, existing);
    });
    
    // Calculate teacher hours using calculateCorrectHours to avoid double-counting parallel subjects
    const teacherHoursBySemester = new Map<string, { sem1: number; sem2: number }>();
    
    assignmentsByClassAndSemester.forEach((classAssignments, key) => {
      const [classId, semester] = key.split('-');
      const classData = classes.find(c => c.id === classId);
      if (!classData) return;
      
      // Build subject hours map for this class and semester
      const subjectHours: Record<string, number> = {};
      const teacherAssignments = new Map<string, { subjectName: string; hours: number }[]>();
      
      classAssignments.forEach(assignment => {
        if (!assignment.teacherId) return;
        
        const subject = subjects.find(s => s.id === assignment.subjectId);
        if (!subject) return;
        
        const hours = parseFloat(assignment.hoursPerWeek) || 0;
        subjectHours[subject.shortName] = hours;
        
        // Track which teacher teaches which subject
        const teacherKey = assignment.teacherId;
        const existing = teacherAssignments.get(teacherKey) || [];
        existing.push({ subjectName: subject.shortName, hours });
        teacherAssignments.set(teacherKey, existing);
      });
      
      // Calculate correct hours for this class (handles parallel subjects)
      const { totalHours, parallelGroupHours, regularHours } = calculateCorrectHours(
        subjectHours,
        classData.grade
      );
      
      // Distribute correct hours to teachers
      teacherAssignments.forEach((subjectList, teacherId) => {
        let teacherHoursForClass = 0;
        const countedParallelGroups = new Set<string>();
        
        subjectList.forEach(({ subjectName, hours }) => {
          // Check if subject is in a parallel group
          const parallelGroupEntry = Object.entries(parallelGroupHours).find(([groupId]) => {
            const group = Object.values(PARALLEL_GROUPS).find(g => g.id === groupId);
            return group?.subjects.includes(subjectName);
          });
          
          if (parallelGroupEntry) {
            // For parallel subjects, count the group hours only once per teacher per class
            const [groupId, groupHours] = parallelGroupEntry;
            if (!countedParallelGroups.has(groupId)) {
              teacherHoursForClass += groupHours;
              countedParallelGroups.add(groupId);
            }
          } else if (regularHours[subjectName]) {
            // For regular subjects, use the subject hours
            teacherHoursForClass += regularHours[subjectName];
          }
        });
        
        // Update teacher hours for this semester
        const semesterHours = teacherHoursBySemester.get(teacherId) || { sem1: 0, sem2: 0 };
        if (semester === '1') {
          semesterHours.sem1 += teacherHoursForClass;
        } else {
          semesterHours.sem2 += teacherHoursForClass;
        }
        teacherHoursBySemester.set(teacherId, semesterHours);
      });
    });
    
    // Store the maximum of the two semesters (teacher's weekly workload)
    teacherHoursBySemester.forEach((hours, teacherId) => {
      hoursMap.set(teacherId, Math.max(hours.sem1, hours.sem2));
    });
    
    return hoursMap;
  }, [assignments, classes, subjects]);

  // OPTIMIZATION: Use memoized lookup instead of recalculating on every call
  const calculateActualCurrentHours = useCallback((teacherId: string): number => {
    return teacherHoursMap.get(teacherId) || 0;
  }, [teacherHoursMap]);

  // Extract subject names for the form (using subject names consistently)
  const availableSubjects = subjects.map(subject => subject.name);

  const form = useForm<TeacherFormData>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      shortName: "",
      email: "",
      dateOfBirth: "",
      subjects: [],
      maxHours: "25.0",
      currentHours: "0.0",
      notes: "",
      qualifications: [],
      reductionHours: {
        AE: 0, BA: 0, SL: 0, SO: 0, LK: 0, 
        SB: 0, VG: 0
      },
      isActive: true,
    },
  });

  // Update form currentHours when assignments or editingTeacher changes
  useEffect(() => {
    if (editingTeacher && isDialogOpen && assignments.length > 0) {
      const actualHours = calculateActualCurrentHours(editingTeacher.id);
      form.setValue('currentHours', actualHours.toString(), { shouldDirty: false });
    }
  }, [assignments, editingTeacher, isDialogOpen, form]);

  const createMutation = useMutation({
    mutationFn: async (data: TeacherFormData) => {
      const response = await apiRequest("POST", "/api/teachers", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Lehrkraft erstellt",
        description: "Die Lehrkraft wurde erfolgreich hinzugefügt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Erstellen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TeacherFormData> }) => {
      const response = await apiRequest("PUT", `/api/teachers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Lehrkraft aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setIsDialogOpen(false);
      setEditingTeacher(null);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Aktualisieren",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Separate Mutation für automatisches Speichern beim Navigieren
  const autoSaveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TeacherFormData> }) => {
      const response = await apiRequest("PUT", `/api/teachers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      // Nur Cache invalidieren, Dialog nicht schließen
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
    },
    onError: (error) => {
      console.error("Auto-save error:", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/teachers/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Lehrkraft gelöscht",
        description: "Die Lehrkraft wurde entfernt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Löschen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);

    const actualCurrentHours = calculateActualCurrentHours(teacher.id);
    form.reset({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      shortName: teacher.shortName,
      personnelNumber: teacher.personnelNumber || "",
      email: teacher.email || "",
      dateOfBirth: teacher.dateOfBirth || "",
      subjects: teacher.subjects,
      maxHours: teacher.maxHours?.toString() || "25",
      currentHours: actualCurrentHours.toString(),
      notes: teacher.notes || "",
      qualifications: teacher.qualifications,
      reductionHours: teacher.reductionHours || {
        sV: 0, sL: 0, SB: 0, LK: 0, VG: 0, 
        FB: 0, aE: 0, BA: 0, SO: 0
      },
      isActive: teacher.isActive,
    });
    setIsDialogOpen(true); // Manually open dialog
  };

  const handleSubmit = (data: TeacherFormData) => {
    // Sicherstellen dass die berechnete Altersermäßigung im Payload enthalten ist
    const finalData = {
      ...data,
      reductionHours: {
        ...data.reductionHours,
        aE: calculateAgeReduction(data.dateOfBirth || "", data.currentHours || 0, data.maxHours || 25)
      }
    };
    
    if (editingTeacher) {
      updateMutation.mutate({ id: editingTeacher.id, data: finalData });
    } else {
      createMutation.mutate(finalData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Sind Sie sicher, dass Sie diese Lehrkraft löschen möchten?")) {
      deleteMutation.mutate(id);
    }
  };

  // Automatisches Speichern vor Navigation
  const autoSaveAndNavigateToTeacher = async (teacher: Teacher) => {
    // Nur speichern wenn wir gerade eine Lehrkraft bearbeiten und das Formular gültig ist
    if (editingTeacher && form.formState.isValid) {
      try {
        const formData = form.getValues();
        const finalData = {
          ...formData,
          reductionHours: {
            ...formData.reductionHours,
            aE: calculateAgeReduction(formData.dateOfBirth || "", formData.currentHours || 0, formData.maxHours || 25)
          }
        };
        
        // Verwende die spezielle autoSaveMutation, die das Dialog nicht schließt
        await autoSaveMutation.mutateAsync({ id: editingTeacher.id, data: finalData });
      } catch (error) {
        console.log("Auto-save failed:", error);
        // Fehler ignorieren und trotzdem weiternavigieren
      }
    }
    
    // Zur neuen Lehrkraft navigieren
    navigateToTeacher(teacher);
  };

  // Navigation zwischen Lehrern im Dialog
  const navigateToTeacher = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    
    const actualCurrentHours = calculateActualCurrentHours(teacher.id);
    // Form mit den Daten des neuen Lehrers füllen
    form.reset({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      shortName: teacher.shortName,
      email: teacher.email,
      subjects: teacher.subjects,
      qualifications: teacher.qualifications || [],
      personnelNumber: teacher.personnelNumber || "",
      dateOfBirth: teacher.dateOfBirth || "",
      maxHours: teacher.maxHours?.toString() || "25",
      currentHours: actualCurrentHours.toString(),
      notes: teacher.notes || "",
      isActive: teacher.isActive,
      reductionHours: {
        AE: teacher.reductionHours?.AE || 0,
        BA: teacher.reductionHours?.BA || 0,
        SL: teacher.reductionHours?.SL || 0,
        SO: teacher.reductionHours?.SO || 0,
        LK: teacher.reductionHours?.LK || 0,
        SB: teacher.reductionHours?.SB || 0,
        VG: teacher.reductionHours?.VG || 0,
      }
    });
  };

  // Navigation Buttons
  const getCurrentTeacherIndex = () => {
    if (!editingTeacher || !filteredTeachers) return -1;
    return filteredTeachers.findIndex(t => t.id === editingTeacher.id);
  };

  const canNavigateNext = () => {
    const currentIndex = getCurrentTeacherIndex();
    return currentIndex !== -1 && currentIndex < filteredTeachers.length - 1;
  };

  const canNavigatePrevious = () => {
    const currentIndex = getCurrentTeacherIndex();
    return currentIndex > 0;
  };

  const navigateNext = () => {
    if (canNavigateNext()) {
      const currentIndex = getCurrentTeacherIndex();
      autoSaveAndNavigateToTeacher(filteredTeachers[currentIndex + 1]);
    }
  };

  const navigatePrevious = () => {
    if (canNavigatePrevious()) {
      const currentIndex = getCurrentTeacherIndex();
      autoSaveAndNavigateToTeacher(filteredTeachers[currentIndex - 1]);
    }
  };

  const filteredTeachers = teachers?.filter(teacher => {
    const matchesSearch = 
      teacher.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.shortName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSubject = filterSubject === "all" || 
      teacher.subjects.includes(filterSubject);

    return matchesSearch && matchesSubject;
  }).sort((a, b) => {
    const lastNameCompare = a.lastName.localeCompare(b.lastName);
    if (lastNameCompare !== 0) return lastNameCompare;
    return a.firstName.localeCompare(b.firstName);
  }) || [];

  const totalTeachers = teachers?.length || 0;
  const activeTeachers = teachers?.filter(t => t.isActive).length || 0;
  const averageWorkload = teachers?.length ? 
    teachers.reduce((sum, t) => {
      const actualCurrentHours = calculateActualCurrentHours(t.id);
      return sum + (actualCurrentHours / parseFloat(t.maxHours));
    }, 0) / teachers.length * 100 : 0;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Lehrerverwaltung</h2>
              <p className="text-muted-foreground">Verwaltung der Lehrkräfte und deren Qualifikationen</p>
            </div>
            <Dialog modal={false} open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (open) {
              }
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-teacher" onClick={() => {
                  setEditingTeacher(null);
              
                  form.reset();
                  setIsDialogOpen(true); // Manually open dialog
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Lehrkraft hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle className="flex items-center gap-2">
                      {editingTeacher ? (
                        <>
                          <User className="h-5 w-5" />
                          <span>Lehrkraft bearbeiten</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-5 w-5" />
                          <span>Neue Lehrkraft</span>
                        </>
                      )}
                    </DialogTitle>
                    
                    {/* Navigation nur beim Bearbeiten anzeigen */}
                    {editingTeacher && filteredTeachers.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {getCurrentTeacherIndex() + 1} von {filteredTeachers.length}
                        </span>
                        <div className="flex gap-1">
                          <Button 
                            type="button"
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigatePrevious();
                            }}
                            disabled={!canNavigatePrevious()}
                            data-testid="button-previous-teacher"
                            title="Vorherige Lehrkraft"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button 
                            type="button"
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigateNext();
                            }}
                            disabled={!canNavigateNext()}
                            data-testid="button-next-teacher"
                            title="Nächste Lehrkraft"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {/* Dropdown für direkte Navigation */}
                        <Select value={editingTeacher?.id || ""} onValueChange={(value) => {
                          const teacher = filteredTeachers.find(t => t.id === value);
                          if (teacher) autoSaveAndNavigateToTeacher(teacher);
                        }}>
                          <SelectTrigger className="w-[200px]" data-testid="select-teacher-navigation">
                            <SelectValue placeholder="Lehrkraft wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredTeachers.map((teacher) => (
                              <SelectItem key={teacher.id} value={teacher.id}>
                                {teacher.lastName}, {teacher.firstName} ({teacher.shortName})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vorname</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-first-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nachname</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-last-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="shortName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Kürzel</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="z.B. MS" data-testid="input-short-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="personnelNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Personalnummer</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="z.B. C9405000" data-testid="input-personnel-number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>E-Mail</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" value={field.value || ""} data-testid="input-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="dateOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Geburtsdatum</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" value={field.value || ""} data-testid="input-date-of-birth" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex items-end">
                        <div className="text-sm text-muted-foreground">
                          <p>Altersermäßigung (automatisch):</p>
                          <Badge variant="light" className="mt-1">
                            {calculateAgeReduction(
                              form.watch("dateOfBirth") || "", 
                              form.watch("currentHours") || 0, 
                              form.watch("maxHours") || 25
                            )} Stunden
                          </Badge>
                          <p className="text-xs mt-1">
                            {(() => {
                              const currentHours = parseFloat(form.watch("currentHours") || "0");
                              const maxHours = parseFloat(form.watch("maxHours") || "25");
                              const percentage = maxHours > 0 ? ((currentHours / maxHours) * 100).toFixed(1) : 0;
                              return `Beschäftigungsumfang: ${percentage}%`;
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="subjects"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fächer</FormLabel>
                          
                          {/* Subject Summary */}
                          {field.value.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 p-2 bg-muted/30 rounded text-xs mb-2">
                              <span className="text-muted-foreground">Gewählt ({field.value.length}):</span>
                              {field.value.map((subjectName, index) => {
                                const subject = subjects.find(s => s.name === subjectName || s.shortName === subjectName);
                                return (
                                  <Badge key={`${subject?.id || subjectName}-${index}`} variant="light" className="text-xs">
                                    {subjectName}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                          
                          <FormControl>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                  data-testid="select-subjects"
                                >
                                  {field.value.length === 0 ? "Fächer auswählen..." : `${field.value.length} Fächer ausgewählt`}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[400px] p-3" align="start">
                                <div className="space-y-2">
                                  <div className="text-sm font-medium">Fächer auswählen:</div>
                                  <div className="max-h-[300px] overflow-y-scroll overscroll-contain space-y-1 border rounded-md p-2">
                                    {subjects
                                      .sort((a, b) => {
                                        // AG-Fächer ans Ende (alle Varianten: "AG xyz", "xyz AG", "xyz-AG", "xyz10AG")
                                        const aIsAG = a.name.startsWith('AG ') || a.name.endsWith(' AG') || a.name.endsWith('-AG') || a.name.includes('AG');
                                        const bIsAG = b.name.startsWith('AG ') || b.name.endsWith(' AG') || b.name.endsWith('-AG') || b.name.includes('AG');
                                        
                                        if (aIsAG && !bIsAG) return 1;  // a nach hinten
                                        if (!aIsAG && bIsAG) return -1; // b nach hinten
                                        
                                        // Beide AG oder beide normal - alphabetisch sortieren
                                        return a.name.localeCompare(b.name);
                                      })
                                      .map((subject) => {
                                        const subjectKey = subject.shortName || subject.name;
                                        const isSelected = field.value.includes(subject.name) || field.value.includes(subject.shortName || '') || field.value.includes(subjectKey);
                                        
                                        return (
                                          <div
                                            key={subject.id}
                                            className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                                            onClick={() => {
                                              if (isSelected) {
                                                // Remove alle möglichen Varianten des Fachs
                                                field.onChange(field.value.filter(s => 
                                                  s !== subject.name && 
                                                  s !== subject.shortName && 
                                                  s !== subjectKey
                                                ));
                                              } else {
                                                // Füge das Fach hinzu (bevorzuge shortName wenn vorhanden)
                                                field.onChange([...field.value, subjectKey]);
                                              }
                                            }}
                                            data-testid={`select-option-${subject.id}`}
                                          >
                                            <Checkbox
                                              checked={isSelected}
                                              className="pointer-events-none"
                                            />
                                            <span className="text-sm">{subject.name}</span>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </FormControl>
                          
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="maxHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max. Stunden/Woche</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                step="0.5"
                                onChange={e => field.onChange(e.target.value)}
                                data-testid="input-max-hours"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="currentHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Aktuelle Stunden/Woche</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                step="0.5"
                                onChange={e => field.onChange(e.target.value)}
                                data-testid="input-current-hours"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="qualifications"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qualifikationen (eine pro Zeile)</FormLabel>
                          <FormControl>
                            <Textarea 
                              value={field.value?.join('\n') || ''}
                              onChange={e => field.onChange(e.target.value.split('\n').filter(q => q.trim()))}
                              placeholder="z.B. Lehramt Sekundarstufe I&#10;Fachleitung Mathematik"
                              data-testid="textarea-qualifications"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notizen</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field}
                              placeholder="Freie Anmerkungen zur Lehrkraft..."
                              rows={3}
                              data-testid="textarea-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Ermäßigungsstunden */}
                    <div className="space-y-4">
                      <div className="border-t pt-4">
                        <h3 className="text-lg font-medium mb-4">Ermäßigungsstunden</h3>
                        <div className="grid grid-cols-3 gap-4">
                          {reductionCategories.map((category) => (
                            <div key={category.key}>
                              <Label className="text-sm font-medium">
                                {category.label} 
                                <span className="text-xs text-muted-foreground block">
                                  {category.description}
                                </span>
                              </Label>
                              <Input 
                                type="number"
                                min="0"
                                step="0.5"
                                value={(form.watch("reductionHours") as any)?.[category.key] || 0}
                                onChange={e => {
                                  const currentReductions = form.getValues("reductionHours") || {};
                                  form.setValue("reductionHours", {
                                    ...currentReductions,
                                    [category.key]: parseFloat(e.target.value) || 0
                                  });
                                }}
                                data-testid={`input-reduction-${category.key}`}
                                disabled={category.key === 'aE'} // Altersermäßigung automatisch berechnet
                              />
                            </div>
                          ))}
                          
                          {/* Altersermäßigung (automatisch berechnet) */}
                          <div>
                            <Label className="text-sm font-medium">
                              aE
                              <span className="text-xs text-muted-foreground block">
                                Altersermäßigung (automatisch)
                              </span>
                            </Label>
                            <Input 
                              type="number"
                              value={calculateAgeReduction(
                                form.watch("dateOfBirth") || "", 
                                form.watch("currentHours") || 0, 
                                form.watch("maxHours") || 25
                              )}
                              disabled
                              data-testid="input-reduction-aE"
                              className="bg-muted"
                            />
                          </div>
                        </div>
                        
                        {/* Gesamte Ermäßigung und endgültige Stundenzahl */}
                        <div className="mt-4 p-3 bg-muted rounded-md">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Gesamte Ermäßigung:</span>
                              <div className="text-lg font-bold">
                                {(() => {
                                  const reductions = form.watch("reductionHours") || {};
                                  const currentHours = form.watch("currentHours") || 0;
                                  const maxHours = form.watch("maxHours") || 25;
                                  const ageReduction = calculateAgeReduction(form.watch("dateOfBirth") || "", currentHours, maxHours);
                                  const totalReduction = Object.entries(reductions).reduce((sum, [key, value]) => {
                                    return sum + (key === 'aE' ? ageReduction : (value || 0));
                                  }, 0);
                                  return totalReduction.toFixed(1);
                                })()} Stunden
                              </div>
                            </div>
                            <div>
                              <span className="font-medium">Grundstunden:</span>
                              <div className="text-lg font-bold">
                                {form.watch("maxHours") || 25} Stunden
                              </div>
                            </div>
                            <div>
                              <span className="font-medium">Endgültige Stundenzahl:</span>
                              <div className="text-lg font-bold text-primary">
                                {(() => {
                                  const maxHours = parseFloat(form.watch("maxHours") || "25");
                                  const currentHours = parseFloat(form.watch("currentHours") || "0");
                                  const reductions = form.watch("reductionHours") || {};
                                  const ageReduction = calculateAgeReduction(form.watch("dateOfBirth") || "", currentHours, maxHours);
                                  const totalReduction = Object.entries(reductions).reduce((sum, [key, value]) => {
                                    return sum + (key === 'aE' ? ageReduction : (value || 0));
                                  }, 0);
                                  return Math.max(0, maxHours - totalReduction).toFixed(1);
                                })()} Stunden
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Switch 
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-active"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Aktiv</FormLabel>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end space-x-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Abbrechen
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createMutation.isPending || updateMutation.isPending}
                        data-testid="button-save-teacher"
                      >
                        {createMutation.isPending || updateMutation.isPending ? "Speichert..." : "Speichern"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-total-teachers">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Lehrkräfte gesamt</p>
                    <p className="text-3xl font-bold text-foreground">{totalTeachers}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Presentation className="text-blue-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-green-600 font-medium">{activeTeachers}</span>
                  <span className="text-muted-foreground ml-1">aktiv</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-average-workload">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Durchschn. Auslastung</p>
                    <p className="text-3xl font-bold text-foreground">{averageWorkload.toFixed(0)}%</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Progress value={averageWorkload} className="w-8 h-8" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-filtered-count">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Gefilterte Ergebnisse</p>
                    <p className="text-3xl font-bold text-foreground">{filteredTeachers.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Filter className="text-purple-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card data-testid="card-filters">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <Label htmlFor="search">Suche</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Name oder Kürzel suchen..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                </div>
                <div className="w-48">
                  <Label htmlFor="filter-subject">Nach Fach filtern</Label>
                  <Select value={filterSubject} onValueChange={setFilterSubject}>
                    <SelectTrigger data-testid="select-filter-subject">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Fächer</SelectItem>
                      {availableSubjects.map(subject => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Teachers List */}
          <Card data-testid="card-teachers-list">
            <CardHeader>
              <CardTitle>Lehrkräfte ({filteredTeachers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading || isLoadingSubjects ? (
                <div className="text-center py-8">Lädt Daten...</div>
              ) : filteredTeachers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm || filterSubject !== "all" 
                    ? "Keine Lehrkräfte gefunden, die den Filterkriterien entsprechen."
                    : "Keine Lehrerdaten vorhanden. Bitte fügen Sie Lehrkräfte hinzu oder importieren Sie CSV-Daten."
                  }
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Lehrkraft
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Fächer
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Stunden
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Aktionen
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Auslastung
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Personalnummer
                        </th>
                       
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {filteredTeachers.map((teacher) => {
                        const actualCurrentHours = calculateActualCurrentHours(teacher.id);
                        const workloadPercentage = (actualCurrentHours / parseFloat(teacher.maxHours)) * 100;
                        return (
                          <tr key={teacher.id} data-testid={`row-teacher-${teacher.id}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-10 h-10 bg-gray-100 border border-gray-200 rounded-full flex items-center justify-center">
                                  <span className="text-black text-sm font-medium">
                                    {teacher.shortName}
                                  </span>
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-medium text-foreground">
                                    {teacher.lastName}
                                  </div>
                                  <div className="text-sm text-foreground">
                                    {teacher.firstName}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {teacher.subjects.map((subject, index) => (
                                  <Badge key={index} variant="light">{subject}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {actualCurrentHours.toFixed(1)} / {teacher.maxHours}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <Link href={`/stundenplaene?tab=teacher&id=${teacher.id}`}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    data-testid={`button-plan-${teacher.id}`}
                                    title="Stundenplan anzeigen"
                                  >
                                    <Calendar className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(teacher)}
                                  data-testid={`button-edit-${teacher.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(teacher.id)}
                                  data-testid={`button-delete-${teacher.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <Progress value={workloadPercentage} className="w-16 mr-2" />
                                <span className="text-sm text-muted-foreground">
                                  {Math.round(workloadPercentage)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={teacher.isActive ? "light" : "destructive"}>
                                {teacher.isActive ? "Aktiv" : "Inaktiv"}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-foreground font-mono">
                                {teacher.personnelNumber || '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
