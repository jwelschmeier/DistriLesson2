import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, BookOpen, Calendar } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <GraduationCap className="h-16 w-16 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Schulverwaltungssystem
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Professionelle Verwaltung von Lehrern, Schülern, Klassen und Stundenplänen
            für moderne Schulen.
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader>
              <Users className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-2" />
              <CardTitle>Lehrerverwaltung</CardTitle>
              <CardDescription>
                Verwalten Sie Lehrkräfte, deren Qualifikationen und Arbeitszeiten
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader>
              <BookOpen className="h-8 w-8 text-green-600 dark:text-green-400 mb-2" />
              <CardTitle>Fächerverwaltung</CardTitle>
              <CardDescription>
                Organisieren Sie Unterrichtsfächer und Wochenstunden
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardHeader>
              <Calendar className="h-8 w-8 text-purple-600 dark:text-purple-400 mb-2" />
              <CardTitle>Stundenplanung</CardTitle>
              <CardDescription>
                Erstellen und optimieren Sie Stundenpläne automatisch
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Login Section */}
        <div className="max-w-md mx-auto">
          <Card className="bg-white dark:bg-gray-800 shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Anmelden</CardTitle>
              <CardDescription>
                Melden Sie sich mit Ihrem Google-Konto an, um das System zu nutzen.
                Eine gültige Einladung ist erforderlich.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleLogin}
                className="w-full text-lg py-6"
                data-testid="button-login"
              >
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Mit Google anmelden
                </div>
              </Button>
              
              <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                <p>Noch keine Einladung erhalten?</p>
                <p>Wenden Sie sich an Ihren Administrator.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}