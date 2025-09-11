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
import { Plus, Edit, Trash2, Presentation, Search, Filter, Calendar } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { insertTeacherSchema, type Teacher, type InsertTeacher, type Subject } from "@shared/schema";
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
    sV: z.number().optional(), // Schülervertretung
    sL: z.number().optional(), // Schulleitung  
    SB: z.number().optional(), // Schwerbehinderung
    LK: z.number().optional(), // Lehrerkonferenz
    VG: z.number().optional(), // weitere Kategorie
    FB: z.number().optional(), // Fachberater
    aE: z.number().optional(), // Altersermäßigung (automatisch berechnet)
    BA: z.number().optional(), // Besondere Aufgaben
    SO: z.number().optional(), // Sonstiges
  }).optional(),
});

type TeacherFormData = z.infer<typeof teacherFormSchema>;

// Load subjects dynamically from API instead of hardcoded list

// Kategorien für Ermäßigungsstunden mit Beschreibungen
const reductionCategories = [
  { key: "sV", label: "sV", description: "Schülervertretung" },
  { key: "sL", label: "sL", description: "Schulleitung" },
  { key: "SB", label: "SB", description: "Schwerbehinderung" },
  { key: "LK", label: "LK", description: "Lehrerkonferenz" },
  { key: "VG", label: "VG", description: "Weitere Kategorie" },
  { key: "FB", label: "FB", description: "Fachberater" },
  { key: "BA", label: "BA", description: "Besondere Aufgaben" },
  { key: "SO", label: "SO", description: "Sonstiges" },
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
        sV: 0, sL: 0, SB: 0, LK: 0, VG: 0, 
        FB: 0, aE: 0, BA: 0, SO: 0
      },
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
      personnelNumber: teacher.personnelNumber || "",
      email: teacher.email || "",
      dateOfBirth: teacher.dateOfBirth || "",
      subjects: teacher.subjects,
      maxHours: teacher.maxHours,
      currentHours: teacher.currentHours,
      notes: teacher.notes || "",
      qualifications: teacher.qualifications,
      reductionHours: teacher.reductionHours || {
        sV: 0, sL: 0, SB: 0, LK: 0, VG: 0, 
        FB: 0, aE: 0, BA: 0, SO: 0
      },
      isActive: teacher.isActive,
    });
    setIsDialogOpen(true);
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
    teachers.reduce((sum, t) => sum + (parseFloat(t.currentHours) / parseFloat(t.maxHours)), 0) / teachers.length * 100 : 0;

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
                          <Badge variant="secondary" className="mt-1">
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
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Lehrkraft
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Personalnummer
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
                        const workloadPercentage = (parseFloat(teacher.currentHours) / parseFloat(teacher.maxHours)) * 100;
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
                              <span className="text-sm text-foreground font-mono">
                                {teacher.personnelNumber || '-'}
                              </span>
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
