import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Edit, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { insertAssignmentSchema, type Assignment, type Teacher, type Class, type Subject, type InsertAssignment } from "@shared/schema";
import { z } from "zod";

const assignmentFormSchema = insertAssignmentSchema.extend({
  teacherId: z.string().min(1, "Lehrkraft muss ausgewählt werden"),
  classId: z.string().min(1, "Klasse muss ausgewählt werden"),
  subjectId: z.string().min(1, "Fach muss ausgewählt werden"),
  hoursPerWeek: z.number().min(1).max(10),
});

type AssignmentFormData = z.infer<typeof assignmentFormSchema>;

interface AssignmentWithDetails extends Assignment {
  teacher?: Teacher;
  class?: Class;
  subject?: Subject;
}

interface ConflictCheck {
  hasConflict: boolean;
  message: string;
  type: "warning" | "error";
}

export default function StdvLe() {
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teachers } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: classes } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  const { data: assignments, isLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
  });

  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      teacherId: "",
      classId: "",
      subjectId: "",
      hoursPerWeek: 1,
      isOptimized: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AssignmentFormData) => {
      const response = await apiRequest("POST", "/api/assignments", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Zuweisung erstellt",
        description: "Die Unterrichtszuweisung wurde erfolgreich erstellt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<AssignmentFormData> }) => {
      const response = await apiRequest("PUT", `/api/assignments/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Zuweisung aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setIsDialogOpen(false);
      setEditingAssignment(null);
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/assignments/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Zuweisung gelöscht",
        description: "Die Unterrichtszuweisung wurde entfernt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Löschen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const checkConflicts = (assignment: AssignmentFormData): ConflictCheck => {
    const teacher = teachers?.find(t => t.id === assignment.teacherId);
    const subject = subjects?.find(s => s.id === assignment.subjectId);

    if (!teacher || !subject) {
      return { hasConflict: false, message: "", type: "warning" };
    }

    // Check if teacher has qualification for this subject
    if (!teacher.subjects.includes(subject.name)) {
      return {
        hasConflict: true,
        message: `${teacher.firstName} ${teacher.lastName} hat keine Qualifikation für ${subject.name}`,
        type: "error"
      };
    }

    // Check teacher workload
    const currentHours = teacher.currentHours + assignment.hoursPerWeek;
    if (currentHours > teacher.maxHours) {
      return {
        hasConflict: true,
        message: `${teacher.firstName} ${teacher.lastName} würde mit ${currentHours}h überbelastet (Max: ${teacher.maxHours}h)`,
        type: "error"
      };
    }

    if (currentHours > teacher.maxHours * 0.9) {
      return {
        hasConflict: true,
        message: `${teacher.firstName} ${teacher.lastName} würde stark ausgelastet (${currentHours}/${teacher.maxHours}h)`,
        type: "warning"
      };
    }

    return { hasConflict: false, message: "", type: "warning" };
  };

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    form.reset({
      teacherId: assignment.teacherId,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      hoursPerWeek: assignment.hoursPerWeek,
      isOptimized: assignment.isOptimized,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: AssignmentFormData) => {
    const conflicts = checkConflicts(data);
    
    if (conflicts.hasConflict && conflicts.type === "error") {
      toast({
        title: "Konflikt erkannt",
        description: conflicts.message,
        variant: "destructive",
      });
      return;
    }

    if (editingAssignment) {
      updateMutation.mutate({ id: editingAssignment.id, data });
    } else {
      createMutation.mutate(data);
    }

    if (conflicts.hasConflict && conflicts.type === "warning") {
      toast({
        title: "Warnung",
        description: conflicts.message,
        variant: "default",
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Sind Sie sicher, dass Sie diese Zuweisung löschen möchten?")) {
      deleteMutation.mutate(id);
    }
  };

  // Create enriched assignments with teacher, class, and subject details
  const enrichedAssignments: AssignmentWithDetails[] = assignments?.map(assignment => ({
    ...assignment,
    teacher: teachers?.find(t => t.id === assignment.teacherId),
    class: classes?.find(c => c.id === assignment.classId),
    subject: subjects?.find(s => s.id === assignment.subjectId),
  })) || [];

  const filteredAssignments = enrichedAssignments.filter(assignment => {
    const matchesTeacher = selectedTeacher === "all" || assignment.teacherId === selectedTeacher;
    const matchesClass = selectedClass === "all" || assignment.classId === selectedClass;
    return matchesTeacher && matchesClass;
  });

  const totalAssignments = assignments?.length || 0;
  const totalHours = assignments?.reduce((sum, a) => sum + a.hoursPerWeek, 0) || 0;
  const optimizedAssignments = assignments?.filter(a => a.isOptimized).length || 0;

  const getConflictStatus = (assignment: AssignmentWithDetails) => {
    if (!assignment.teacher || !assignment.subject) return null;
    
    if (!assignment.teacher.subjects.includes(assignment.subject.name)) {
      return { type: "error", message: "Keine Qualifikation" };
    }
    
    if (assignment.teacher.currentHours > assignment.teacher.maxHours) {
      return { type: "error", message: "Überbelastung" };
    }
    
    if (assignment.teacher.currentHours > assignment.teacher.maxHours * 0.9) {
      return { type: "warning", message: "Hohe Belastung" };
    }
    
    return { type: "success", message: "OK" };
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">StdV-Le (Stundenverteilung Lehrer)</h2>
              <p className="text-muted-foreground">Manuelle Zuordnung der Unterrichtsstunden an Lehrkräfte</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-assignment" onClick={() => {
                  setEditingAssignment(null);
                  form.reset();
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Zuweisung erstellen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingAssignment ? "Zuweisung bearbeiten" : "Neue Zuweisung"}
                  </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="teacherId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lehrkraft</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-teacher">
                                <SelectValue placeholder="Lehrkraft auswählen" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
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
                      control={form.control}
                      name="classId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Klasse</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-class">
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
                      control={form.control}
                      name="subjectId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fach</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-subject">
                                <SelectValue placeholder="Fach auswählen" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {subjects?.map(subject => (
                                <SelectItem key={subject.id} value={subject.id}>
                                  {subject.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="hoursPerWeek"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Wochenstunden</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min="1" 
                              max="10"
                              onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                              data-testid="input-hours"
                            />
                          </FormControl>
                          <FormMessage />
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
                        data-testid="button-save-assignment"
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
            <Card data-testid="card-total-assignments">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Zuweisungen gesamt</p>
                    <p className="text-3xl font-bold text-foreground">{totalAssignments}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-blue-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-total-hours">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Stunden gesamt</p>
                    <p className="text-3xl font-bold text-foreground">{totalHours}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-green-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-optimized">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Optimiert</p>
                    <p className="text-3xl font-bold text-foreground">{optimizedAssignments}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="text-purple-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card data-testid="card-filters">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="w-64">
                  <label className="block text-sm font-medium text-foreground mb-2">Nach Lehrkraft filtern</label>
                  <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                    <SelectTrigger data-testid="select-filter-teacher">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Lehrkräfte</SelectItem>
                      {teachers?.map(teacher => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.firstName} {teacher.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-64">
                  <label className="block text-sm font-medium text-foreground mb-2">Nach Klasse filtern</label>
                  <Select value={selectedClass} onValueChange={setSelectedClass}>
                    <SelectTrigger data-testid="select-filter-class">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Klassen</SelectItem>
                      {classes?.map(classData => (
                        <SelectItem key={classData.id} value={classData.id}>
                          {classData.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Assignments List */}
          <Card data-testid="card-assignments-list">
            <CardHeader>
              <CardTitle>Unterrichtszuweisungen ({filteredAssignments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Lade Zuweisungen...</div>
              ) : filteredAssignments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {selectedTeacher !== "all" || selectedClass !== "all"
                    ? "Keine Zuweisungen gefunden, die den Filterkriterien entsprechen."
                    : "Keine Unterrichtszuweisungen vorhanden. Bitte erstellen Sie Zuweisungen oder verwenden Sie die Optimierung."
                  }
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Lehrkraft
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Klasse
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Fach
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Stunden/Woche
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Typ
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Aktionen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {filteredAssignments.map((assignment) => {
                        const conflictStatus = getConflictStatus(assignment);
                        return (
                          <tr key={assignment.id} data-testid={`row-assignment-${assignment.id}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                                  <span className="text-secondary-foreground text-sm font-medium">
                                    {assignment.teacher?.shortName || "?"}
                                  </span>
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-medium text-foreground">
                                    {assignment.teacher ? 
                                      `${assignment.teacher.firstName} ${assignment.teacher.lastName}` : 
                                      "Unbekannt"
                                    }
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant="outline">
                                {assignment.class?.name || "Unbekannt"}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {assignment.subject?.name || "Unbekannt"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {assignment.hoursPerWeek}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {conflictStatus && (
                                <div className="flex items-center">
                                  {conflictStatus.type === "error" && (
                                    <AlertTriangle className="w-4 h-4 text-red-500 mr-1" />
                                  )}
                                  {conflictStatus.type === "warning" && (
                                    <AlertTriangle className="w-4 h-4 text-orange-500 mr-1" />
                                  )}
                                  {conflictStatus.type === "success" && (
                                    <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                                  )}
                                  <Badge 
                                    variant={
                                      conflictStatus.type === "error" ? "destructive" :
                                      conflictStatus.type === "warning" ? "secondary" : "default"
                                    }
                                  >
                                    {conflictStatus.message}
                                  </Badge>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={assignment.isOptimized ? "default" : "outline"}>
                                {assignment.isOptimized ? "Automatisch" : "Manuell"}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(assignment)}
                                  data-testid={`button-edit-${assignment.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(assignment.id)}
                                  data-testid={`button-delete-${assignment.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
