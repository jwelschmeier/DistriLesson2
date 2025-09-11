import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Edit, Trash2, School, Users, Search, Filter, Calendar } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { insertClassSchema, insertStudentSchema, type Class, type Student, type Teacher, type InsertClass, type InsertStudent } from "@shared/schema";
import { calculateCorrectHours } from "@shared/parallel-subjects";
import { z } from "zod";

const classFormSchema = insertClassSchema.extend({
  name: z.string().min(1, "Klassenname ist erforderlich"),
  grade: z.number().min(5).max(10),
  studentCount: z.number().min(0),
  targetHoursSemester1: z.string().nullable().optional(),
  targetHoursSemester2: z.string().nullable().optional(),
});

const studentFormSchema = insertStudentSchema.extend({
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  grade: z.number().min(5).max(10),
});

type ClassFormData = z.infer<typeof classFormSchema>;
type StudentFormData = z.infer<typeof studentFormSchema>;

export default function Klassenverwaltung() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGrade, setFilterGrade] = useState("all");
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
  const [isStudentDialogOpen, setIsStudentDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: classes, isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: students, isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
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
      targetHoursSemester1: null,
      targetHoursSemester2: null,
      classTeacher1Id: undefined,
      classTeacher2Id: undefined,
    },
  });

  const studentForm = useForm<StudentFormData>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      classId: "",
      grade: 5,
    },
  });

  const createClassMutation = useMutation({
    mutationFn: async (data: ClassFormData) => {
      const response = await apiRequest("POST", "/api/classes", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Klasse erstellt",
        description: "Die Klasse wurde erfolgreich hinzugefügt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      setIsClassDialogOpen(false);
      classForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Erstellen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateClassMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ClassFormData> }) => {
      const response = await apiRequest("PUT", `/api/classes/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Klasse aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
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
        description: "Die Klasse wurde entfernt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Löschen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createStudentMutation = useMutation({
    mutationFn: async (data: StudentFormData) => {
      const response = await apiRequest("POST", "/api/students", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Schüler hinzugefügt",
        description: "Der Schüler wurde erfolgreich hinzugefügt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setIsStudentDialogOpen(false);
      studentForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Hinzufügen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditClass = (classData: Class) => {
    setEditingClass(classData);
    classForm.reset({
      name: classData.name,
      grade: classData.grade,
      studentCount: classData.studentCount,
      subjectHours: classData.subjectHours,
      targetHoursSemester1: classData.targetHoursSemester1 || null,
      targetHoursSemester2: classData.targetHoursSemester2 || null,
      classTeacher1Id: classData.classTeacher1Id || "none",
      classTeacher2Id: classData.classTeacher2Id || "none",
    });
    setIsClassDialogOpen(true);
  };

  const handleClassSubmit = (data: ClassFormData) => {
    // Convert "none" values to null for teacher IDs to explicitly clear assignments
    const sanitizedData = {
      ...data,
      classTeacher1Id: data.classTeacher1Id === "none" ? null : data.classTeacher1Id,
      classTeacher2Id: data.classTeacher2Id === "none" ? null : data.classTeacher2Id,
    };
    
    if (editingClass) {
      updateClassMutation.mutate({ id: editingClass.id, data: sanitizedData });
    } else {
      createClassMutation.mutate(sanitizedData);
    }
  };

  const handleDeleteClass = (id: string) => {
    if (confirm("Sind Sie sicher, dass Sie diese Klasse löschen möchten?")) {
      deleteClassMutation.mutate(id);
    }
  };

  const handleStudentSubmit = (data: StudentFormData) => {
    createStudentMutation.mutate(data);
  };

  const filteredClasses = classes?.filter(classData => {
    const matchesSearch = classData.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = filterGrade === "all" || classData.grade.toString() === filterGrade;
    return matchesSearch && matchesGrade;
  }) || [];

  const getStudentsInClass = (classId: string) => {
    return students?.filter(student => student.classId === classId) || [];
  };

  const totalClasses = classes?.length || 0;
  const totalStudents = students?.length || 0;
  const averageClassSize = totalClasses > 0 ? totalStudents / totalClasses : 0;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Klassenverwaltung</h2>
              <p className="text-muted-foreground">Verwaltung der Klassen und Schülerzuordnungen</p>
            </div>
            <div className="flex items-center space-x-2">
              <Dialog open={isStudentDialogOpen} onOpenChange={setIsStudentDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-add-student">
                    <Users className="mr-2 h-4 w-4" />
                    Schüler hinzufügen
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Neuen Schüler hinzufügen</DialogTitle>
                  </DialogHeader>
                  <Form {...studentForm}>
                    <form onSubmit={studentForm.handleSubmit(handleStudentSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={studentForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vorname</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-student-first-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={studentForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nachname</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-student-last-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={studentForm.control}
                        name="classId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Klasse</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-student-class">
                                  <SelectValue placeholder="Klasse auswählen" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {classes?.map(classData => (
                                  <SelectItem key={classData.id} value={classData.id}>
                                    {classData.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={studentForm.control}
                        name="grade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jahrgangsstufe</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                              <FormControl>
                                <SelectTrigger data-testid="select-student-grade">
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

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsStudentDialogOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createStudentMutation.isPending}
                          data-testid="button-save-student"
                        >
                          {createStudentMutation.isPending ? "Speichert..." : "Hinzufügen"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>

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
                <DialogContent>
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
                              <Input {...field} placeholder="z.B. 5a" data-testid="input-class-name" />
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

                      <FormField
                        control={classForm.control}
                        name="studentCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Schüleranzahl</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                                data-testid="input-student-count"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={classForm.control}
                          name="targetHoursSemester1"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Soll-Stunden 1. HJ</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number"
                                  step="0.5"
                                  placeholder="z.B. 30.0"
                                  value={field.value || ""}
                                  onChange={e => field.onChange(e.target.value || null)}
                                  data-testid="input-target-hours-semester1"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={classForm.control}
                          name="targetHoursSemester2"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Soll-Stunden 2. HJ</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number"
                                  step="0.5"
                                  placeholder="z.B. 30.0"
                                  value={field.value || ""}
                                  onChange={e => field.onChange(e.target.value || null)}
                                  data-testid="input-target-hours-semester2"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={classForm.control}
                        name="classTeacher1Id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Klassenlehrer 1</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                              <FormControl>
                                <SelectTrigger data-testid="select-class-teacher-1">
                                  <SelectValue placeholder="Klassenlehrer 1 auswählen..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">Kein Klassenlehrer</SelectItem>
                                {teachers?.map(teacher => (
                                  <SelectItem key={teacher.id} value={teacher.id}>
                                    {teacher.firstName} {teacher.lastName} ({teacher.shortName})
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
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                              <FormControl>
                                <SelectTrigger data-testid="select-class-teacher-2">
                                  <SelectValue placeholder="Klassenlehrer 2 auswählen..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">Kein Klassenlehrer</SelectItem>
                                {teachers?.map(teacher => (
                                  <SelectItem key={teacher.id} value={teacher.id}>
                                    {teacher.firstName} {teacher.lastName} ({teacher.shortName})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsClassDialogOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createClassMutation.isPending || updateClassMutation.isPending}
                          data-testid="button-save-class"
                        >
                          {createClassMutation.isPending || updateClassMutation.isPending ? "Speichert..." : "Speichern"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-total-classes">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Klassen gesamt</p>
                    <p className="text-3xl font-bold text-foreground">{totalClasses}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <School className="text-blue-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-total-students">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Schüler gesamt</p>
                    <p className="text-3xl font-bold text-foreground">{totalStudents}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="text-green-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-average-class-size">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Ø Klassengröße</p>
                    <p className="text-3xl font-bold text-foreground">{averageClassSize.toFixed(1)}</p>
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
                      placeholder="Klassenname suchen..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                </div>
                <div className="w-48">
                  <Label htmlFor="filter-grade">Nach Jahrgangsstufe filtern</Label>
                  <Select value={filterGrade} onValueChange={setFilterGrade}>
                    <SelectTrigger data-testid="select-filter-grade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Jahrgänge</SelectItem>
                      {[5, 6, 7, 8, 9, 10].map(grade => (
                        <SelectItem key={grade} value={grade.toString()}>
                          Klasse {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Classes List */}
          <Card data-testid="card-classes-list">
            <CardHeader>
              <CardTitle>Klassen ({filteredClasses.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {classesLoading ? (
                <div className="text-center py-8">Lade Klassendaten...</div>
              ) : filteredClasses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm || filterGrade !== "all" 
                    ? "Keine Klassen gefunden, die den Filterkriterien entsprechen."
                    : "Keine Klassendaten vorhanden. Bitte fügen Sie Klassen hinzu oder importieren Sie CSV-Daten."
                  }
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredClasses.map((classData) => {
                    const studentsInClass = getStudentsInClass(classData.id);
                    return (
                      <Card key={classData.id} className="hover:shadow-md transition-shadow" data-testid={`card-class-${classData.id}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{classData.name}</CardTitle>
                            <Badge variant="outline">Klasse {classData.grade}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Schüler:</span>
                              <span className="font-medium">{studentsInClass.length} / {classData.studentCount}</span>
                            </div>
                            
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Jahrgangsstufe:</span>
                              <span className="font-medium">{classData.grade}</span>
                            </div>

                            {(() => {
                              // Convert semester-based subjectHours to total hours for calculation
                              const totalSubjectHours: Record<string, number> = {};
                              for (const [subject, semesterHours] of Object.entries(classData.subjectHours || {})) {
                                if (typeof semesterHours === 'object' && semesterHours !== null) {
                                  totalSubjectHours[subject] = (Number(semesterHours['1']) || 0) + (Number(semesterHours['2']) || 0);
                                } else {
                                  totalSubjectHours[subject] = Number(semesterHours) || 0;
                                }
                              }
                              
                              const correctHours = calculateCorrectHours(totalSubjectHours, classData.grade);
                              const rawTotal = Object.values(totalSubjectHours).reduce((sum, hours) => sum + hours, 0);
                              const parallelGroupsInfo = Object.entries(correctHours.parallelGroupHours).map(([group, hours]) => `${group}: ${hours}h`).join(', ');
                              
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Gesamtstunden (korrekt):</span>
                                    <span className="font-medium text-green-600">{correctHours.totalHours}h</span>
                                  </div>
                                  {rawTotal !== correctHours.totalHours && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">Ohne Parallelkorrektur:</span>
                                      <span className="text-red-500 line-through">{rawTotal}h</span>
                                    </div>
                                  )}
                                  {parallelGroupsInfo && (
                                    <div className="text-xs text-muted-foreground">
                                      Parallel: {parallelGroupsInfo}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {studentsInClass.length > 0 && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-2">Schüler:</p>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                  {studentsInClass.slice(0, 5).map((student) => (
                                    <div key={student.id} className="text-sm">
                                      {student.firstName} {student.lastName}
                                    </div>
                                  ))}
                                  {studentsInClass.length > 5 && (
                                    <div className="text-sm text-muted-foreground">
                                      ... und {studentsInClass.length - 5} weitere
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center space-x-2 pt-3">
                              <Link href={`/stundenplaene?tab=class&id=${classData.id}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid={`button-plan-class-${classData.id}`}
                                  title="Stundenplan anzeigen"
                                >
                                  <Calendar className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditClass(classData)}
                                data-testid={`button-edit-class-${classData.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteClass(classData.id)}
                                data-testid={`button-delete-class-${classData.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
