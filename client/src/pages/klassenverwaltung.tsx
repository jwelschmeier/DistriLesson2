import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, School, Search, Filter, Calendar } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { insertClassSchema, type Class, type Teacher } from "@shared/schema";
import { calculateCorrectHours } from "@shared/parallel-subjects";
import { z } from "zod";

const classFormSchema = insertClassSchema.extend({
  name: z.string().min(1, "Klassenname ist erforderlich"),
  grade: z.number().min(5).max(10),
  studentCount: z.number().min(0),
  targetHoursSemester1: z.string().nullable().optional(),
  targetHoursSemester2: z.string().nullable().optional(),
});

const gradeBulkEditSchema = z.object({
  grade: z.number().min(5).max(10),
  targetHoursTotal: z.string().min(1, "Gesamtstunden sind erforderlich"),
  targetHoursSemester1: z.string().nullable().optional(),
  targetHoursSemester2: z.string().nullable().optional(),
});

type ClassFormData = z.infer<typeof classFormSchema>;
type GradeBulkEditData = z.infer<typeof gradeBulkEditSchema>;

export default function Klassenverwaltung() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGrade, setFilterGrade] = useState("all");
  const [filterType, setFilterType] = useState<"all" | "klassen" | "kurse">("all");
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
  const [isGradeBulkEditOpen, setIsGradeBulkEditOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: classes, isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: teachers, isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const classForm = useForm<ClassFormData>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      name: "",
      grade: 5,
      studentCount: 0,
      subjectHours: {},
      targetHoursTotal: null,
      targetHoursSemester1: null,
      targetHoursSemester2: null,
      classTeacher1Id: undefined,
      classTeacher2Id: undefined,
    },
  });

  const gradeBulkForm = useForm<GradeBulkEditData>({
    resolver: zodResolver(gradeBulkEditSchema),
    defaultValues: {
      grade: 5,
      targetHoursTotal: "",
      targetHoursSemester1: null,
      targetHoursSemester2: null,
    },
  });

  const createClassMutation = useMutation({
    mutationFn: async (data: ClassFormData) => {
      const response = await apiRequest("POST", "/api/classes", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Klasse hinzugefügt",
        description: "Die Klasse wurde erfolgreich hinzugefügt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setIsClassDialogOpen(false);
      classForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Hinzufügen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateClassMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClassFormData }) => {
      const response = await apiRequest("PUT", `/api/classes/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Klasse aktualisiert",
        description: "Die Klasse wurde erfolgreich aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      setIsClassDialogOpen(false);
      setEditingClass(null);
      classForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Aktualisieren",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteClassMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/classes/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Klasse gelöscht",
        description: "Die Klasse wurde erfolgreich gelöscht.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
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

  const gradeBulkEditMutation = useMutation({
    mutationFn: async (data: GradeBulkEditData) => {
      const response = await apiRequest("POST", "/api/classes/bulk-edit", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Klassen aktualisiert",
        description: "Die Klassen wurden erfolgreich aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      setIsGradeBulkEditOpen(false);
      gradeBulkForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Aktualisieren",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to create all differentiation courses at once
  const createDifferentiationCoursesMutation = useMutation({
    mutationFn: async () => {
      // EXAKTE Kursliste basierend auf der CSV-Datei - keine Abweichungen!
      const courses = [
        // Jahrgang 5 - Religionskurse
        { name: "05ER1", grade: 5 }, { name: "05ER2", grade: 5 },
        { name: "05KR1", grade: 5 }, { name: "05KR2", grade: 5 }, { name: "05KR3", grade: 5 },
        { name: "05PP1", grade: 5 },
        
        // Jahrgang 6 - Religionskurse und Förderung  
        { name: "06ER1", grade: 6 }, { name: "06ER2", grade: 6 },
        { name: "06FÖRS1", grade: 6 }, { name: "06FÖRS2", grade: 6 },
        { name: "06KR1", grade: 6 }, { name: "06KR2", grade: 6 }, { name: "06KR3", grade: 6 },
        { name: "06PP1", grade: 6 }, { name: "06PP2", grade: 6 },
        
        // Jahrgang 7 - EXAKT aus CSV
        { name: "07DF", grade: 7 }, { name: "07EF", grade: 7 },
        { name: "07ER1", grade: 7 }, { name: "07ER2", grade: 7 },
        { name: "07FS", grade: 7 }, 
        { name: "07INF_IF", grade: 7 }, // Combined name from CSV
        { name: "07KR1", grade: 7 }, { name: "07KR2", grade: 7 }, { name: "07KR3", grade: 7 },
        { name: "07MF", grade: 7 },
        { name: "07MUS", grade: 7 }, // CSV uses MUS, not MU
        { name: "07NW_BI", grade: 7 }, // Combined name from CSV
        { name: "07PP1", grade: 7 }, { name: "07PP2", grade: 7 },
        { name: "07SW", grade: 7 },
        { name: "07TC1", grade: 7 }, { name: "07TC2", grade: 7 }, // CSV has TC1/TC2 for Jahrgang 7
        
        // Jahrgang 8 - EXAKT aus CSV
        { name: "08DF", grade: 8 }, { name: "08EF", grade: 8 },
        { name: "08ER1", grade: 8 }, { name: "08ER2", grade: 8 },
        { name: "08FS", grade: 8 },
        { name: "08INF_IF", grade: 8 }, // Combined name from CSV
        { name: "08KR1", grade: 8 }, { name: "08KR2", grade: 8 },
        { name: "08MF", grade: 8 },
        { name: "08MUS", grade: 8 }, // CSV uses MUS
        { name: "08NW_BI", grade: 8 }, // Combined name from CSV
        { name: "08PP1", grade: 8 },
        { name: "08SW", grade: 8 },
        { name: "08TC", grade: 8 }, // CSV uses TC for Jahrgang 8+
        
        // Jahrgang 9 - EXAKT aus CSV
        { name: "09DF", grade: 9 }, { name: "09EF", grade: 9 },
        { name: "09ER1", grade: 9 }, { name: "09ER2", grade: 9 },
        { name: "09FS", grade: 9 },
        { name: "09INF_IF", grade: 9 }, // Combined name from CSV
        { name: "09KR1", grade: 9 }, { name: "09KR2", grade: 9 }, { name: "09KR3", grade: 9 },
        { name: "09MF", grade: 9 },
        { name: "09MUS", grade: 9 }, // CSV uses MUS
        { name: "09NW_BI", grade: 9 }, // Combined name from CSV
        { name: "09PP1", grade: 9 },
        { name: "09SW", grade: 9 },
        { name: "09TC", grade: 9 }, // CSV uses TC
        
        // Jahrgang 10 - EXAKT aus CSV
        { name: "10DF", grade: 10 }, { name: "10EF", grade: 10 },
        { name: "10ER1", grade: 10 }, { name: "10ER2", grade: 10 },
        { name: "10FS", grade: 10 },
        { name: "10INF_IF", grade: 10 }, // Combined name from CSV
        { name: "10KR1", grade: 10 }, { name: "10KR2", grade: 10 }, { name: "10KR3", grade: 10 },
        { name: "10MF", grade: 10 },
        { name: "10NW_BI", grade: 10 }, // Combined name from CSV
        { name: "10PP1", grade: 10 },
        { name: "10SW", grade: 10 },
        { name: "10TC", grade: 10 } // CSV uses TC
      ];

      const results = [];
      let createdCount = 0;
      let skippedCount = 0;
      
      for (const course of courses) {
        try {
          // Check if course already exists
          const existingCourse = classes?.find(c => c.name === course.name);
          if (existingCourse) {
            skippedCount++;
            continue;
          }

          const courseData = {
            name: course.name,
            grade: course.grade,
            studentCount: 15, // Default for differentiation courses
            subjectHours: {},
            targetHoursTotal: null,
            targetHoursSemester1: null,
            targetHoursSemester2: null,
            classTeacher1Id: undefined,
            classTeacher2Id: undefined,
          };

          const response = await apiRequest("POST", "/api/classes", courseData);
          await response.json();
          createdCount++;
        } catch (error) {
          console.error(`Failed to create course ${course.name}:`, error);
        }
      }
      
      return { createdCount, skippedCount };
    },
    onSuccess: (result) => {
      toast({
        title: "Differenzierungskurse erstellt",
        description: `${result.createdCount} Kurse erstellt, ${result.skippedCount} bereits vorhanden.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Erstellen der Kurse",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClassSubmit = async (data: ClassFormData) => {
    if (editingClass) {
      updateClassMutation.mutate({ id: editingClass.id, data });
    } else {
      createClassMutation.mutate(data);
    }
  };

  const handleEditClass = (classData: Class) => {
    setEditingClass(classData);
    classForm.reset({
      name: classData.name,
      grade: classData.grade,
      studentCount: classData.studentCount,
      subjectHours: classData.subjectHours,
      targetHoursTotal: classData.targetHoursTotal,
      targetHoursSemester1: classData.targetHoursSemester1,
      targetHoursSemester2: classData.targetHoursSemester2,
      classTeacher1Id: classData.classTeacher1Id,
      classTeacher2Id: classData.classTeacher2Id,
    });
    setIsClassDialogOpen(true);
  };

  const handleDeleteClass = async (id: string) => {
    if (window.confirm("Sind Sie sicher, dass Sie diese Klasse löschen möchten?")) {
      deleteClassMutation.mutate(id);
    }
  };

  const handleGradeBulkEditSubmit = async (data: GradeBulkEditData) => {
    gradeBulkEditMutation.mutate(data);
  };

  // Hilfsfunktion: Unterscheidet zwischen normalen Klassen und Kursen
  const isRegularClass = (className: string): boolean => {
    // Normale Klassen: 05A, 06B, 07C, etc. (Jahrgang + einzelner Buchstabe)
    return /^\d{2}[A-Z]$/.test(className);
  };

  const filteredClasses = classes?.filter((classData) => {
    const matchesSearch = classData.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = filterGrade === "all" || classData.grade.toString() === filterGrade;
    
    // Typ-Filter: Klassen vs Kurse
    let matchesType = true;
    if (filterType === "klassen") {
      matchesType = isRegularClass(classData.name);
    } else if (filterType === "kurse") {
      matchesType = !isRegularClass(classData.name);
    }
    
    return matchesSearch && matchesGrade && matchesType;
  }) || [];

  const totalClasses = classes?.length || 0;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Klassenverwaltung</h2>
              <p className="text-muted-foreground">Verwaltung der Klassen und Stundenpläne</p>
            </div>
            <div className="flex items-center space-x-2">
              <Dialog open={isClassDialogOpen} onOpenChange={setIsClassDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-class" onClick={() => {
                    setEditingClass(null);
                    classForm.reset();
                  }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Klasse hinzufügen
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingClass ? "Klasse bearbeiten" : "Neue Klasse"}
                    </DialogTitle>
                  </DialogHeader>
                  <Form {...classForm}>
                    <form onSubmit={classForm.handleSubmit(handleClassSubmit)} className="space-y-4">
                      <FormField
                        control={classForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Klassenname</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="z.B. 05A" data-testid="input-class-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={classForm.control}
                        name="grade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jahrgangsstufe</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                              <FormControl>
                                <SelectTrigger data-testid="select-class-grade">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {[5, 6, 7, 8, 9, 10].map(grade => (
                                  <SelectItem key={grade} value={grade.toString()}>
                                    Klasse {grade}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={classForm.control}
                          name="classTeacher1Id"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Klassenlehrer 1</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || undefined}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-class-teacher-1">
                                    <SelectValue placeholder="Auswählen..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {teachers?.map(teacher => (
                                    <SelectItem key={teacher.id} value={teacher.id}>
                                      {teacher.shortName} - {teacher.firstName} {teacher.lastName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={classForm.control}
                          name="classTeacher2Id"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Klassenlehrer 2</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || undefined}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-class-teacher-2">
                                    <SelectValue placeholder="Auswählen..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {teachers?.filter(t => t.id !== classForm.watch("classTeacher1Id")).map(teacher => (
                                    <SelectItem key={teacher.id} value={teacher.id}>
                                      {teacher.shortName} - {teacher.firstName} {teacher.lastName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsClassDialogOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createClassMutation.isPending || updateClassMutation.isPending}
                          data-testid="button-save-class"
                        >
                          {createClassMutation.isPending || updateClassMutation.isPending ? "Speichert..." : (editingClass ? "Aktualisieren" : "Hinzufügen")}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>

              <Dialog open={isGradeBulkEditOpen} onOpenChange={setIsGradeBulkEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-grade-bulk-edit">
                    <Edit className="mr-2 h-4 w-4" />
                    Jahrgangsstufe bearbeiten
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Jahrgangsstufe Massenbearbeitung</DialogTitle>
                  </DialogHeader>
                  <Form {...gradeBulkForm}>
                    <form onSubmit={gradeBulkForm.handleSubmit(handleGradeBulkEditSubmit)} className="space-y-4">
                      <FormField
                        control={gradeBulkForm.control}
                        name="grade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jahrgangsstufe</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {[5, 6, 7, 8, 9, 10].map(grade => (
                                  <SelectItem key={grade} value={grade.toString()}>
                                    Klasse {grade}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={gradeBulkForm.control}
                        name="targetHoursTotal"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Zielstunden Gesamt</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.5" placeholder="z.B. 30" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={gradeBulkForm.control}
                          name="targetHoursSemester1"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>1. Halbjahr</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} type="number" step="0.5" placeholder="z.B. 15" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={gradeBulkForm.control}
                          name="targetHoursSemester2"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>2. Halbjahr</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} type="number" step="0.5" placeholder="z.B. 15" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsGradeBulkEditOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button type="submit" disabled={gradeBulkEditMutation.isPending}>
                          {gradeBulkEditMutation.isPending ? "Speichert..." : "Aktualisieren"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>

              <Button 
                variant="secondary" 
                onClick={() => createDifferentiationCoursesMutation.mutate()}
                disabled={createDifferentiationCoursesMutation.isPending}
                data-testid="button-create-differentiation-courses"
              >
                <School className="mr-2 h-4 w-4" />
                {createDifferentiationCoursesMutation.isPending 
                  ? "Erstelle Kurse..." 
                  : "Alle Kurse hinzufügen (CSV-basiert)"
                }
              </Button>
            </div>
          </div>
        </header>

        {/* Stats Overview */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gesamte Klassen</CardTitle>
                <School className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalClasses}</div>
                <p className="text-xs text-muted-foreground">
                  Aktive Klassen im System
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filter-Tabs */}
          <div className="flex items-center space-x-2 border-b border-border">
            <Button
              variant={filterType === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterType("all")}
              data-testid="filter-all"
            >
              Alle
            </Button>
            <Button
              variant={filterType === "klassen" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterType("klassen")}
              data-testid="filter-klassen"
            >
              Klassen
            </Button>
            <Button
              variant={filterType === "kurse" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterType("kurse")}
              data-testid="filter-kurse"
            >
              Kurse
            </Button>
          </div>

          {/* Search and Filter */}
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={filterType === "klassen" ? "Klassen suchen..." : filterType === "kurse" ? "Kurse suchen..." : "Klassen/Kurse suchen..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
                data-testid="input-search-classes"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterGrade} onValueChange={setFilterGrade}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-grade">
                  <SelectValue placeholder="Jahrgangsstufe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Jahrgangsstufen</SelectItem>
                  {[5, 6, 7, 8, 9, 10].map(grade => (
                    <SelectItem key={grade} value={grade.toString()}>
                      Klasse {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Classes List */}
          {classesLoading ? (
            <div className="animate-pulse">
              <div className="rounded-md border">
                <div className="border-b p-4">
                  <div className="h-4 bg-muted rounded w-full"></div>
                </div>
                {[...Array(6)].map((_, index) => (
                  <div key={index} className="border-b p-4">
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-1/4"></div>
                      <div className="h-4 bg-muted rounded w-1/6"></div>
                      <div className="h-4 bg-muted rounded w-1/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className="text-center py-12">
              <School className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Klassen gefunden</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || filterGrade !== "all" 
                  ? "Passen Sie Ihre Suchkriterien an oder fügen Sie eine neue Klasse hinzu."
                  : "Fügen Sie Ihre erste Klasse hinzu, um zu beginnen."
                }
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Klasse</TableHead>
                    <TableHead>Jahrgangsstufe</TableHead>
                    <TableHead>Wochenstunden</TableHead>
                    <TableHead>Klassenlehrer</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClasses.map((classData) => {
                    // Convert semester-based subjectHours to total hours for calculation
                    const totalSubjectHours: Record<string, number> = {};
                    for (const [subject, semesterHours] of Object.entries(classData.subjectHours || {})) {
                      if (typeof semesterHours === 'object' && semesterHours !== null) {
                        totalSubjectHours[subject] = (Number(semesterHours['1']) || 0) + (Number(semesterHours['2']) || 0);
                      } else {
                        totalSubjectHours[subject] = Number(semesterHours) || 0;
                      }
                    }
                    
                    const correctHoursResult = calculateCorrectHours(totalSubjectHours, classData.grade);
                    const correctHours = typeof correctHoursResult === 'number' ? correctHoursResult : correctHoursResult.totalHours;
                    const rawTotal = Object.values(totalSubjectHours).reduce((sum, hours) => sum + hours, 0);
                    
                    const teacher1 = teachers?.find(t => t.id === classData.classTeacher1Id);
                    const teacher2 = teachers?.find(t => t.id === classData.classTeacher2Id);
                    
                    let teacherDisplay = "Nicht zugewiesen";
                    if (teacher1 && teacher2) {
                      teacherDisplay = `${teacher1.shortName}, ${teacher2.shortName}`;
                    } else if (teacher1) {
                      teacherDisplay = teacher1.shortName;
                    }

                    return (
                      <TableRow key={classData.id} data-testid={`row-class-${classData.id}`}>
                        <TableCell className="font-medium py-2">
                          <div className="flex items-center space-x-2">
                            <span>{classData.name}</span>
                            <Badge variant="outline">Klasse {classData.grade}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-1">{classData.grade}</TableCell>
                        <TableCell className="py-1">
                          <span className={`font-medium ${rawTotal !== correctHours ? 'text-orange-600' : 'text-green-600'}`}>
                            {rawTotal} / {correctHours}
                          </span>
                        </TableCell>
                        <TableCell className="py-1">{teacherDisplay}</TableCell>
                        <TableCell className="text-right py-1">
                          <div className="flex items-center justify-end space-x-2">
                            <Link href={`/stundenplaene?tab=class&classId=${classData.id}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-view-schedule-${classData.id}`}
                              >
                                <Calendar className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClass(classData)}
                              data-testid={`button-edit-class-${classData.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClass(classData.id)}
                              data-testid={`button-delete-class-${classData.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}