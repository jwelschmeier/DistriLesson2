import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError, redirectToLogin } from "@/lib/authUtils";
import { Sidebar } from "@/components/layout/sidebar";
import { ChatGPTImport } from "@/components/ChatGPTImport";
import { Trash2, Mail, Copy, Calendar, Users, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Invitation {
  id: string;
  email: string;
  role: string;
  used: boolean;
  usedBy?: string;
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
  token: string;
}

export default function AdminPanel() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");

  // Fetch invitations
  const { data: invitations, isLoading } = useQuery<Invitation[]>({
    queryKey: ["/api/admin/invitations"],
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Nicht autorisiert",
          description: "Sie werden zur Anmeldung weitergeleitet...",
          variant: "destructive",
        });
        setTimeout(() => redirectToLogin(), 500);
        return false;
      }
      return failureCount < 3;
    },
  });

  // Create invitation mutation
  const createInvitationMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = "Failed to create invitation";
        
        if (errorData.error) {
          if (Array.isArray(errorData.error)) {
            // Handle Zod validation errors
            errorMessage = errorData.error.map((err: any) => err.message || `${err.path?.join('.')}: ${err.code}`).join(", ");
          } else if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          } else {
            errorMessage = JSON.stringify(errorData.error);
          }
        }
        
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Einladung erstellt",
        description: "Die Einladung wurde erfolgreich erstellt und kann nun versendet werden.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations"] });
      setEmail("");
      setRole("user");
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Nicht autorisiert",
          description: "Sie werden zur Anmeldung weitergeleitet...",
          variant: "destructive",
        });
        setTimeout(() => redirectToLogin(), 500);
        return;
      }
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Erstellen der Einladung",
        variant: "destructive",
      });
    },
  });

  // Delete invitation mutation
  const deleteInvitationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/invitations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete invitation");
      }

      return response.ok;
    },
    onSuccess: () => {
      toast({
        title: "Einladung gelöscht",
        description: "Die Einladung wurde erfolgreich gelöscht.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Nicht autorisiert",
          description: "Sie werden zur Anmeldung weitergeleitet...",
          variant: "destructive",
        });
        setTimeout(() => redirectToLogin(), 500);
        return;
      }
      toast({
        title: "Fehler",
        description: "Fehler beim Löschen der Einladung",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine E-Mail-Adresse ein.",
        variant: "destructive",
      });
      return;
    }
    createInvitationMutation.mutate({ email: email.trim(), role });
  };

  const copyInvitationLink = async (token: string) => {
    const link = `${window.location.origin}/invitation/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: "Link kopiert",
        description: "Der Einladungslink wurde in die Zwischenablage kopiert.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Fehler beim Kopieren des Links",
        variant: "destructive",
      });
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 space-y-8">
          <div className="flex items-center gap-3 mb-6">
            <Users className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Administrator Panel
            </h1>
          </div>

      {/* Create Invitation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Neue Einladung erstellen
          </CardTitle>
          <CardDescription>
            Erstellen Sie eine neue Einladung für einen Benutzer. Der Einladungslink ist 7 Tage gültig.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail-Adresse</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="benutzer@schule.de"
                  required
                  data-testid="input-invitation-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rolle</Label>
                <Select value={role} onValueChange={(value) => setRole(value as "user" | "admin")}>
                  <SelectTrigger data-testid="select-invitation-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Benutzer</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={createInvitationMutation.isPending}
              data-testid="button-create-invitation"
            >
              {createInvitationMutation.isPending ? "Wird erstellt..." : "Einladung erstellen"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Invitations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Einladungen verwalten
          </CardTitle>
          <CardDescription>
            Übersicht aller erstellten Einladungen und deren Status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Lade Einladungen...</div>
          ) : !invitations || invitations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Noch keine Einladungen erstellt.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erstellt</TableHead>
                    <TableHead>Läuft ab</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium" data-testid={`text-invitation-email-${invitation.id}`}>
                        {invitation.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="light">
                          {invitation.role === "admin" ? "Administrator" : "Benutzer"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {invitation.used ? (
                          <Badge variant="light">Verwendet</Badge>
                        ) : isExpired(invitation.expiresAt) ? (
                          <Badge variant="destructive">Abgelaufen</Badge>
                        ) : (
                          <Badge variant="light">Aktiv</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(invitation.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                      </TableCell>
                      <TableCell>
                        {format(new Date(invitation.expiresAt), "dd.MM.yyyy HH:mm", { locale: de })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!invitation.used && !isExpired(invitation.expiresAt) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyInvitationLink(invitation.token)}
                              data-testid={`button-copy-link-${invitation.id}`}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteInvitationMutation.mutate(invitation.id)}
                            disabled={deleteInvitationMutation.isPending}
                            data-testid={`button-delete-invitation-${invitation.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ChatGPT Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            ChatGPT Import
          </CardTitle>
          <CardDescription>
            Stundenplan-Daten mit ChatGPT automatisch importieren und verarbeiten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChatGPTImport />
        </CardContent>
      </Card>
        </div>
      </main>
    </div>
  );
}