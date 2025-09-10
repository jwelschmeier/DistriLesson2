import { useState } from "react";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Presentation, Search, Filter } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { insertTeacherSchema, type Teacher, type InsertTeacher } from "@shared/schema";
import { z } from "zod";

const teacherFormSchema = insertTeacherSchema.extend({
  subjects: z.array(z.string()).min(1, "Mindestens ein Fach muss ausgewählt werden"),
  qualifications: z.array(z.string()).optional(),
});

type TeacherFormData = z.infer<typeof teacherFormSchema>;

const availableSubjects = [
  "Deutsch", "Mathematik", "Englisch", "Französisch", "Spanisch",
  "Geschichte", "Erdkunde", "Politik", "Biologie", "Chemie", "Physik",
  "Sport", "Kunst", "Musik", "Religion", "Ethik", "Informatik", "Technik"
];

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

  const form = useForm<TeacherFormData>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      shortName: "",
      email: "",
      subjects: [],
      maxHours: 25,
      currentHours: 0,
      qualifications: [],
      isActive: true,
    },
  });

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
    form.reset({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      shortName: teacher.shortName,
      email: teacher.email || "",
      subjects: teacher.subjects,
      maxHours: teacher.maxHours,
      currentHours: teacher.currentHours,
      qualifications: teacher.qualifications,
      isActive: teacher.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: TeacherFormData) => {
    if (editingTeacher) {
      updateMutation.mutate({ id: editingTeacher.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Sind Sie sicher, dass Sie diese Lehrkraft löschen möchten?")) {
      deleteMutation.mutate(id);
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
  }) || [];

  const totalTeachers = teachers?.length || 0;
  const activeTeachers = teachers?.filter(t => t.isActive).length || 0;
  const averageWorkload = teachers?.length ? 
    teachers.reduce((sum, t) => sum + (t.currentHours / t.maxHours), 0) / teachers.length * 100 : 0;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Lehrerverwaltung</h2>
              <p className="text-muted-foreground">Verwaltung der Lehrkräfte und deren Qualifikationen</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-teacher" onClick={() => {
                  setEditingTeacher(null);
                  form.reset();
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Lehrkraft hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingTeacher ? "Lehrkraft bearbeiten" : "Neue Lehrkraft"}
                  </DialogTitle>
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

                    <FormField
                      control={form.control}
                      name="subjects"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fächer</FormLabel>
                          <div className="grid grid-cols-3 gap-2 p-3 border rounded-md">
                            {availableSubjects.map((subject) => (
                              <label key={subject} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={field.value.includes(subject)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      field.onChange([...field.value, subject]);
                                    } else {
                                      field.onChange(field.value.filter(s => s !== subject));
                                    }
                                  }}
                                  data-testid={`checkbox-subject-${subject.toLowerCase()}`}
                                />
                                <span className="text-sm">{subject}</span>
                              </label>
                            ))}
                          </div>
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
                                onChange={e => field.onChange(parseInt(e.target.value))}
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
                                onChange={e => field.onChange(parseInt(e.target.value))}
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
              {isLoading ? (
                <div className="text-center py-8">Lade Lehrerdaten...</div>
              ) : filteredTeachers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm || filterSubject !== "all" 
                    ? "Keine Lehrkräfte gefunden, die den Filterkriterien entsprechen."
                    : "Keine Lehrerdaten vorhanden. Bitte fügen Sie Lehrkräfte hinzu oder importieren Sie CSV-Daten."
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
                          Fächer
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Stunden
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Auslastung
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Aktionen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {filteredTeachers.map((teacher) => {
                        const workloadPercentage = (teacher.currentHours / teacher.maxHours) * 100;
                        return (
                          <tr key={teacher.id} data-testid={`row-teacher-${teacher.id}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                                  <span className="text-secondary-foreground text-sm font-medium">
                                    {teacher.shortName}
                                  </span>
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-medium text-foreground">
                                    {teacher.firstName} {teacher.lastName}
                                  </div>
                                  <div className="text-sm text-muted-foreground">{teacher.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-wrap gap-1">
                                {teacher.subjects.slice(0, 3).map((subject, index) => (
                                  <Badge key={index} variant="outline">{subject}</Badge>
                                ))}
                                {teacher.subjects.length > 3 && (
                                  <Badge variant="outline">+{teacher.subjects.length - 3}</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {teacher.currentHours} / {teacher.maxHours}
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
                              <Badge variant={teacher.isActive ? "default" : "destructive"}>
                                {teacher.isActive ? "Aktiv" : "Inaktiv"}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
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
