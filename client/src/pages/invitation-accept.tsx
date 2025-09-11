import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Clock, Mail, ShieldCheck } from "lucide-react";

interface InvitationData {
  email: string;
  role: string;
  valid: boolean;
}

export default function InvitationAccept() {
  const { token } = useParams<{ token: string }>();
  const [invitationData, setInvitationData] = useState<InvitationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const validateInvitation = async () => {
      if (!token) {
        setError("Ungültiger Einladungslink");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/invitation/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Fehler beim Validieren der Einladung");
        } else {
          setInvitationData(data);
        }
      } catch (error) {
        setError("Netzwerkfehler beim Validieren der Einladung");
      } finally {
        setIsLoading(false);
      }
    };

    validateInvitation();
  }, [token]);

  const handleAcceptInvitation = () => {
    // Redirect to login which will handle the invitation acceptance
    const params = new URLSearchParams({ invitation_token: token || "" });
    window.location.href = `/api/login?${params.toString()}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3">Validiere Einladung...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {error ? (
          <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                <div>
                  <CardTitle className="text-red-900 dark:text-red-100">
                    Einladung ungültig
                  </CardTitle>
                  <CardDescription className="text-red-700 dark:text-red-300">
                    Diese Einladung kann nicht verwendet werden
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Alert className="border-red-200 bg-red-100 dark:bg-red-900/30 dark:border-red-700">
                <AlertDescription className="text-red-800 dark:text-red-200">
                  {error}
                </AlertDescription>
              </Alert>
              <div className="mt-4 text-center">
                <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                  Mögliche Gründe:
                </p>
                <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                  <li>• Die Einladung ist abgelaufen</li>
                  <li>• Die Einladung wurde bereits verwendet</li>
                  <li>• Der Einladungslink ist ungültig</li>
                </ul>
                <p className="text-sm text-red-700 dark:text-red-300 mt-4">
                  Bitte wenden Sie sich an Ihren Administrator für eine neue Einladung.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : invitationData ? (
          <Card className="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                <div>
                  <CardTitle className="text-green-900 dark:text-green-100">
                    Einladung gültig
                  </CardTitle>
                  <CardDescription className="text-green-700 dark:text-green-300">
                    Sie sind berechtigt, sich anzumelden
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border">
                  <Mail className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      E-Mail-Adresse
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="text-invitation-email">
                      {invitationData.email}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border">
                  <ShieldCheck className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Berechtigung
                    </p>
                    <div className="mt-1">
                      <Badge 
                        variant={invitationData.role === "admin" ? "default" : "secondary"}
                        data-testid="badge-invitation-role"
                      >
                        {invitationData.role === "admin" ? "Administrator" : "Benutzer"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <Alert className="border-green-200 bg-green-100 dark:bg-green-900/30 dark:border-green-700">
                <Clock className="h-4 w-4" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Diese Einladung ist noch gültig. Melden Sie sich mit Ihrem Google-Konto an, 
                  das der angegebenen E-Mail-Adresse entspricht.
                </AlertDescription>
              </Alert>

              <Button 
                onClick={handleAcceptInvitation} 
                className="w-full text-lg py-6"
                data-testid="button-accept-invitation"
              >
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Mit Google anmelden und beitreten
                </div>
              </Button>

              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                <p>
                  Stellen Sie sicher, dass Sie mit dem Google-Konto angemeldet sind, 
                  das der E-Mail-Adresse <strong>{invitationData.email}</strong> entspricht.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}