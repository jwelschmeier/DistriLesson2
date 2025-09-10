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
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Plus, Edit, Trash2, BookOpen } from "lucide-react";
import { insertSubjectSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

type Subject = {
  id: string;
  name: string;
  shortName: string;
  category: string;
  hoursPerWeek: Record<string, number>;
  createdAt?: string;
};

const subjectFormSchema = insertSubjectSchema.extend({
  name: z.string().min(1, "Fachname ist erforderlich"),
  shortName: z.string().min(1, "Kürzel ist erforderlich").max(10, "Kürzel zu lang"),
  category: z.string().min(1, "Kategorie ist erforderlich"),
});

type SubjectFormData = z.infer<typeof subjectFormSchema>;

export default function Faecherverwaltung() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

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

  return (
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
                      <FormControl>
                        <Input 
                          placeholder="z.B. Kernfach, Nebenfach" 
                          {...field} 
                          data-testid="input-subject-category"
                        />
                      </FormControl>
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
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Alle Fächer ({subjects.length})
            </CardTitle>
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
                  {subjects.map((subject) => (
                    <TableRow key={subject.id} data-testid={`row-subject-${subject.id}`}>
                      <TableCell className="font-medium" data-testid={`text-subject-name-${subject.id}`}>
                        {subject.name}
                      </TableCell>
                      <TableCell data-testid={`text-subject-shortname-${subject.id}`}>
                        {subject.shortName}
                      </TableCell>
                      <TableCell data-testid={`text-subject-category-${subject.id}`}>
                        {subject.category}
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
                  {subjects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                        Keine Fächer gefunden. Erstellen Sie Ihr erstes Fach.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {categories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Fächer nach Kategorien</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categories.map((category) => (
                  <div key={category} className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">{category}</h3>
                    <div className="space-y-1">
                      {subjects
                        .filter((s) => s.category === category)
                        .map((subject) => (
                          <div key={subject.id} className="text-sm text-gray-600 dark:text-gray-400">
                            {subject.shortName} - {subject.name}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}