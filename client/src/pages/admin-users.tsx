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
import { Trash2, Mail, Copy, Calendar, Users } from "lucide-react";
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

export default function AdminUsers() {
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations"] });
      setEmail("");
      setRole("user");
      toast({
        title: "Einladung erstellt",
        description: "Die Einladung wurde erfolgreich verschickt.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Erstellen der Einladung",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete invitation mutation
  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/invitations/${invitationId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations"] });
      toast({
        title: "Einladung gelöscht",
        description: "Die Einladung wurde erfolgreich gelöscht.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Löschen der Einladung",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({
        title: "E-Mail erforderlich",
        description: "Bitte geben Sie eine E-Mail-Adresse ein.",
        variant: "destructive",
      });
      return;
    }
    createInvitationMutation.mutate({ email, role });
  };

  const copyInvitationLink = (token: string) => {
    const invitationUrl = `${window.location.origin}/invitation/${token}`;
    navigator.clipboard.writeText(invitationUrl);
    toast({
      title: "Link kopiert",
      description: "Der Einladungslink wurde in die Zwischenablage kopiert.",
    });
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd.MM.yyyy HH:mm", { locale: de });
  };

  const formatDateShort = (dateString: string) => {
    return format(new Date(dateString), "dd.MM.yyyy", { locale: de });
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-8 space-y-8">
          <div className="flex items-center space-x-2">
            <Users className="h-6 w-6" />
            <h1 className="text-3xl font-bold" data-testid="heading-user-management">
              Benutzer verwalten
            </h1>
          </div>
          
          {/* User Invitation Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Benutzer einladen
              </CardTitle>
              <CardDescription>
                Senden Sie eine Einladung an neue Benutzer, damit diese sich registrieren können.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-Mail-Adresse</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="benutzer@schule.de"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      data-testid="input-invitation-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rolle</Label>
                    <Select value={role} onValueChange={(value: "user" | "admin") => setRole(value)}>
                      <SelectTrigger data-testid="select-invitation-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Benutzer</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button 
                      type="submit" 
                      disabled={createInvitationMutation.isPending}
                      data-testid="button-send-invitation"
                      className="w-full"
                    >
                      {createInvitationMutation.isPending ? "Wird gesendet..." : "Einladung senden"}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Invitations Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Einladungen verwalten
              </CardTitle>
              <CardDescription>
                Übersicht über alle gesendeten Einladungen und deren Status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <p className="mt-2 text-muted-foreground">Lade Einladungen...</p>
                </div>
              ) : invitations && invitations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erstellt</TableHead>
                      <TableHead>Gültig bis</TableHead>
                      <TableHead>Verwendet</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invitation) => (
                      <TableRow key={invitation.id} data-testid={`row-invitation-${invitation.id}`}>
                        <TableCell className="font-medium">{invitation.email}</TableCell>
                        <TableCell>
                          <Badge variant={invitation.role === 'admin' ? 'default' : 'secondary'}>
                            {invitation.role === 'admin' ? 'Administrator' : 'Benutzer'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              invitation.used 
                                ? 'default' 
                                : isExpired(invitation.expiresAt) 
                                ? 'destructive' 
                                : 'secondary'
                            }
                          >
                            {invitation.used 
                              ? 'Verwendet' 
                              : isExpired(invitation.expiresAt) 
                              ? 'Abgelaufen' 
                              : 'Ausstehend'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateShort(invitation.createdAt)}</TableCell>
                        <TableCell>{formatDateShort(invitation.expiresAt)}</TableCell>
                        <TableCell>
                          {invitation.used && invitation.usedAt ? (
                            <div>
                              <div className="text-sm">{formatDate(invitation.usedAt)}</div>
                              {invitation.usedBy && (
                                <div className="text-xs text-muted-foreground">von {invitation.usedBy}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            {!invitation.used && !isExpired(invitation.expiresAt) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyInvitationLink(invitation.token)}
                                data-testid={`button-copy-invitation-${invitation.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
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
              ) : (
                <div className="text-center py-8">
                  <Mail className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-semibold text-foreground">Keine Einladungen</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Es wurden noch keine Einladungen versendet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}