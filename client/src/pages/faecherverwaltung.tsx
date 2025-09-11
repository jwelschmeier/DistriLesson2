import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Plus, Edit, Trash2, BookOpen, Filter } from "lucide-react";
import { insertSubjectSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Sidebar } from "@/components/layout/sidebar";
import { PARALLEL_GROUPS, getParallelGroupForSubject } from "@shared/parallel-subjects";

type Subject = {
  id: string;
  name: string;
  shortName: string;
  category: string;
  hoursPerWeek: Record<string, number>;
  parallelGroup?: string | null;
  createdAt?: string;
};

const subjectFormSchema = insertSubjectSchema.extend({
  name: z.string().min(1, "Fachname ist erforderlich"),
  shortName: z.string().min(1, "Kürzel ist erforderlich").max(10, "Kürzel zu lang"),
  category: z.string().min(1, "Kategorie ist erforderlich"),
});

type SubjectFormData = z.infer<typeof subjectFormSchema>;

// Category configuration with colors
const CATEGORIES = {
  'Hauptfach': { label: 'Hauptfach', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  'Nebenfach': { label: 'Nebenfach', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  'AG': { label: 'AG', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  'Sonderbereich': { label: 'Sonderbereich', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  'Differenzierungsfach': { label: 'Differenzierungsfach', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
} as const;

export default function Faecherverwaltung() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  const form = useForm<SubjectFormData>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: {
      name: "",
      shortName: "",
      category: "",
      hoursPerWeek: {},
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: SubjectFormData) => {
      const response = await apiRequest("POST", "/api/subjects", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subjects"] });
      toast({ title: "Erfolg", description: "Fach erfolgreich erstellt" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Fehler", description: "Fach konnte nicht erstellt werden", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: SubjectFormData & { id: string }) => {
      const response = await apiRequest("PUT", `/api/subjects/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subjects"] });
      toast({ title: "Erfolg", description: "Fach erfolgreich aktualisiert" });
      setIsDialogOpen(false);
      setEditingSubject(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Fehler", description: "Fach konnte nicht aktualisiert werden", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/subjects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subjects"] });
      toast({ title: "Erfolg", description: "Fach erfolgreich gelöscht" });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Fach konnte nicht gelöscht werden", variant: "destructive" });
    },
  });

  const onSubmit = (data: SubjectFormData) => {
    if (editingSubject) {
      updateMutation.mutate({ ...data, id: editingSubject.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    form.reset({
      name: subject.name,
      shortName: subject.shortName,
      category: subject.category,
      hoursPerWeek: subject.hoursPerWeek,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Sind Sie sicher, dass Sie dieses Fach löschen möchten?")) {
      deleteMutation.mutate(id);
    }
  };

  const openCreateDialog = () => {
    setEditingSubject(null);
    form.reset({
      name: "",
      shortName: "",
      category: "",
      hoursPerWeek: {},
    });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Lädt...</div>;
  }

  const categories = Array.from(new Set(subjects.map(s => s.category)));
  const filteredSubjects = selectedCategory === 'all' ? subjects : subjects.filter(s => s.category === selectedCategory);

  const getCategoryBadge = (category: string) => {
    const categoryConfig = CATEGORIES[category as keyof typeof CATEGORIES];
    return categoryConfig ? (
      <Badge className={categoryConfig.color} data-testid={`badge-category-${category.toLowerCase()}`}>
        {categoryConfig.label}
      </Badge>
    ) : (
      <Badge variant="outline" data-testid={`badge-category-${category.toLowerCase()}`}>
        {category}
      </Badge>
    );
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Fächerverwaltung</h1>
          <p className="text-gray-600 dark:text-gray-400">Verwalten Sie die Unterrichtsfächer</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} data-testid="button-create-subject">
              <Plus className="mr-2 h-4 w-4" />
              Neues Fach
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-subject-form">
            <DialogHeader>
              <DialogTitle>
                {editingSubject ? "Fach bearbeiten" : "Neues Fach erstellen"}
              </DialogTitle>
              <DialogDescription>
                {editingSubject ? "Bearbeiten Sie die Fachdaten" : "Erstellen Sie ein neues Unterrichtsfach"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fachname</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="z.B. Mathematik" 
                          {...field} 
                          data-testid="input-subject-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shortName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kürzel</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="z.B. MA" 
                          {...field} 
                          data-testid="input-subject-shortname"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kategorie</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} data-testid="select-subject-category">
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Kategorie auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Hauptfach">Hauptfach</SelectItem>
                          <SelectItem value="Nebenfach">Nebenfach</SelectItem>
                          <SelectItem value="AG">AG</SelectItem>
                          <SelectItem value="Sonderbereich">Sonderbereich</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Abbrechen
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-subject"
                  >
                    {createMutation.isPending || updateMutation.isPending ? "Speichert..." : "Speichern"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Fächer ({filteredSubjects.length} von {subjects.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <Select value={selectedCategory} onValueChange={setSelectedCategory} data-testid="select-category-filter">
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter nach Kategorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Kategorien</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {CATEGORIES[category as keyof typeof CATEGORIES]?.label || category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table data-testid="table-subjects">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fachname</TableHead>
                    <TableHead>Kürzel</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubjects.map((subject) => (
                    <TableRow key={subject.id} data-testid={`row-subject-${subject.id}`}>
                      <TableCell className="font-medium" data-testid={`text-subject-name-${subject.id}`}>
                        {subject.name}
                      </TableCell>
                      <TableCell data-testid={`text-subject-shortname-${subject.id}`}>
                        {subject.shortName}
                      </TableCell>
                      <TableCell data-testid={`text-subject-category-${subject.id}`}>
                        {getCategoryBadge(subject.category)}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(subject)}
                            data-testid={`button-edit-subject-${subject.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(subject.id)}
                            className="text-red-600 hover:text-red-700"
                            data-testid={`button-delete-subject-${subject.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredSubjects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                        {selectedCategory === 'all' ? 'Keine Fächer gefunden. Erstellen Sie Ihr erstes Fach.' : `Keine Fächer in der Kategorie "${CATEGORIES[selectedCategory as keyof typeof CATEGORIES]?.label || selectedCategory}" gefunden.`}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Übersicht nach Kategorien</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(CATEGORIES).map(([key, config]) => {
                const categorySubjects = subjects.filter(s => s.category === key);
                return (
                  <div key={key} className="p-4 border rounded-lg hover:shadow-sm transition-shadow cursor-pointer bg-card" 
                       onClick={() => setSelectedCategory(key)}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Badge className={config.color}>{config.label}</Badge>
                        <span className="text-lg font-semibold text-foreground">
                          {categorySubjects.length} Fächer
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {categorySubjects.map((subject) => (
                        <div key={subject.id} className="flex items-center justify-between p-2 rounded bg-accent/30 hover:bg-accent/50 transition-colors">
                          <div className="flex-1">
                            <span className="font-medium text-sm text-foreground">{subject.shortName}</span>
                            <span className="text-xs text-muted-foreground ml-2">{subject.name}</span>
                          </div>
                          {Object.keys(subject.hoursPerWeek).length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {Object.entries(subject.hoursPerWeek).map(([grade, hours]) => 
                                `${grade}:${hours}h`
                              ).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        </div>
        </div>
      </main>
    </div>
  );
}