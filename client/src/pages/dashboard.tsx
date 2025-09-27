import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Presentation, GraduationCap, Calculator, Clock, BarChart3, Bell } from "lucide-react";
import { Link } from "wouter";

interface DashboardStats {
  totalTeachers: number;
  totalStudents: number;
  totalHours: number;
  averageWorkload: number;
}

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  shortName: string;
  subjects: string[];
  currentHours: string;
  maxHours: string;
  personnelNumber?: string;
  email?: string;
  dateOfBirth?: string;
  qualifications: string[];
  reductionHours: {
    AE?: number;
    BA?: number;
    SL?: number;
    SO?: number;
    LK?: number;
    SB?: number;
    VG?: number;
  };
  notes?: string;
  isActive: boolean;
  createdAt?: string;
}

interface Assignment {
  id: string;
  teacherId: string;
  classId: string;
  subjectId: string;
  hoursPerWeek: string;
  semester: string;
  teamTeachingId?: string;
  isOptimized: boolean;
  teacher?: Teacher;
  class?: {
    id: string;
    name: string;
  };
  subject?: {
    id: string;
    name: string;
  };
}

interface SubjectStaffing {
  subject: string;
  current: number;
  required: number;
  percentage: number;
}

const mockSubjectStaffing: SubjectStaffing[] = [
  { subject: "Deutsch", current: 12.5, required: 13.2, percentage: 95 },
  { subject: "Mathematik", current: 11.8, required: 12.5, percentage: 94 },
  { subject: "Englisch", current: 8.2, required: 9.8, percentage: 84 },
  { subject: "Naturwissenschaften", current: 6.5, required: 8.2, percentage: 79 },
  { subject: "Sport", current: 4.8, required: 5.2, percentage: 92 },
];

const mockNotifications = [
  { id: 1, message: "CSV Import erfolgreich", time: "vor 2 Stunden", type: "success" },
  { id: 2, message: "Konflikt in Klasse 9B erkannt", time: "vor 4 Stunden", type: "warning" },
  { id: 3, message: "Optimierung abgeschlossen", time: "vor 6 Stunden", type: "info" },
  { id: 4, message: "Fehlende Qualifikation erkannt", time: "vor 1 Tag", type: "error" },
];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  const { data: teachers, isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: assignments } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
  });

  // Calculate actual current hours for a teacher based on assignments
  const calculateActualCurrentHours = (teacherId: string): number => {
    const teacherAssignments = assignments?.filter(a => a.teacherId === teacherId) || [];
    
    // Group assignments to prevent double-counting of team teaching hours
    const processedAssignments = new Map<string, { hours: number; semester: string }>();
    
    teacherAssignments.forEach(assignment => {
      const hours = Number.parseFloat(assignment.hoursPerWeek);
      
      // Skip 0-hour assignments as they're often placeholders
      if (!Number.isFinite(hours) || hours <= 0) return;
      
      // For team teaching, we need to count the hours for each teacher individually
      // but avoid double-counting within the same teacher's workload
      const groupKey = assignment.teamTeachingId 
        ? `team-${assignment.teamTeachingId}-${assignment.classId}-${assignment.subjectId}-${assignment.semester}-${assignment.teacherId}`
        : `individual-${assignment.classId}-${assignment.subjectId}-${assignment.teacherId}-${assignment.semester}`;
      
      const existing = processedAssignments.get(groupKey);
      
      // Keep the assignment with maximum hours (handles duplicates)
      if (!existing || hours > existing.hours) {
        processedAssignments.set(groupKey, { hours: hours, semester: assignment.semester });
      }
    });
    
    // Calculate semester hours separately
    const s1Hours = Array.from(processedAssignments.values())
      .filter(p => p.semester === "1")
      .reduce((sum, p) => sum + p.hours, 0);
      
    const s2Hours = Array.from(processedAssignments.values())
      .filter(p => p.semester === "2")
      .reduce((sum, p) => sum + p.hours, 0);
    
    // Return the maximum of the two semesters (teacher's weekly workload)
    // This matches the logic in stundenplaene.tsx and lehrerverwaltung.tsx
    return Math.max(s1Hours, s2Hours);
  };

  const getWorkloadStatus = (current: number, max: number) => {
    const percentage = (current / max) * 100;
    if (percentage > 100) return "Überzuweisung";
    if (percentage < 80) return "Unterzuweisung";
    return "Vollständig zugewiesen";
  };

  const getWorkloadColor = (current: number, max: number) => {
    const percentage = (current / max) * 100;
    if (percentage > 100) return "bg-red-500";
    if (percentage < 80) return "bg-orange-500";
    return "bg-green-500";
  };

  const getSubjectColor = (percentage: number) => {
    if (percentage >= 95) return "bg-green-500";
    if (percentage >= 85) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header Bar */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
              <p className="text-muted-foreground">Übersicht über die Unterrichtsverteilung</p>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/csv-import">
                <Button data-testid="button-csv-import">
                  <Upload className="mr-2 h-4 w-4" />
                  CSV Importieren
                </Button>
              </Link>
              <Button variant="secondary" data-testid="button-export">
                <Download className="mr-2 h-4 w-4" />
                Exportieren
              </Button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card data-testid="card-teachers">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Lehrkräfte gesamt</p>
                    <p className="text-3xl font-bold text-foreground" data-testid="text-total-teachers">
                      {statsLoading ? "..." : stats?.totalTeachers || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Presentation className="text-blue-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-green-600 font-medium">+2</span>
                  <span className="text-muted-foreground ml-1">seit letztem Monat</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-students">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Schüler gesamt</p>
                    <p className="text-3xl font-bold text-foreground" data-testid="text-total-students">
                      {statsLoading ? "..." : stats?.totalStudents || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <GraduationCap className="text-green-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-green-600 font-medium">+15</span>
                  <span className="text-muted-foreground ml-1">seit letztem Monat</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-positions">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Planstellen Soll</p>
                    <p className="text-3xl font-bold text-foreground">82.5</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Calculator className="text-orange-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-orange-600 font-medium">-4.5</span>
                  <span className="text-muted-foreground ml-1">Fehlbedarf</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-hours">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Unterrichtsstunden</p>
                    <p className="text-3xl font-bold text-foreground" data-testid="text-total-hours">
                      {statsLoading ? "..." : stats?.totalHours || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-purple-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-green-600 font-medium">95%</span>
                  <span className="text-muted-foreground ml-1">zugewiesen</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Planstellenübersicht */}
            <Card className="lg:col-span-2" data-testid="card-staffing-overview">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="mr-2 text-primary" />
                  Planstellenübersicht
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockSubjectStaffing.map((subject) => (
                    <div key={subject.subject}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">{subject.subject}</span>
                        <span className="text-sm text-muted-foreground">
                          {subject.current} / {subject.required} Stellen
                        </span>
                      </div>
                      <Progress value={subject.percentage} className="w-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activities */}
            <Card data-testid="card-notifications">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="mr-2 text-primary" />
                  Aktuelle Meldungen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockNotifications.map((notification) => (
                    <div key={notification.id} className="flex items-start space-x-3">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        notification.type === 'success' ? 'bg-green-500' :
                        notification.type === 'warning' ? 'bg-orange-500' :
                        notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{notification.message}</p>
                        <p className="text-xs text-muted-foreground">{notification.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Teacher Assignment Overview */}
          <Card data-testid="card-teacher-assignments">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Presentation className="mr-2 text-primary" />
                  Lehrerzuweisungen
                </CardTitle>
                <Link href="/lehrerverwaltung">
                  <Button variant="link" className="text-primary hover:text-primary/80">
                    Alle anzeigen →
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {teachersLoading ? (
                <div className="text-center py-8">Lade Lehrerdaten...</div>
              ) : teachers?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Lehrerdaten vorhanden. Bitte importieren Sie CSV-Daten.
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
                          Wochenstunden
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Auslastung
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {teachers?.slice(0, 5).map((teacher) => {
                        const actualCurrentHours = calculateActualCurrentHours(teacher.id);
                        const maxHours = Number.parseFloat(teacher.maxHours) || 25;
                        const workloadPercentage = (actualCurrentHours / maxHours) * 100;
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
                                  <div className="text-sm text-muted-foreground" data-testid={`text-teacher-hours-${teacher.id}`}>
                                    {actualCurrentHours.toFixed(1)} / {maxHours.toFixed(1)} Std.
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-wrap gap-1">
                                {teacher.subjects.slice(0, 2).map((subject, index) => (
                                  <Badge key={index} variant="light">{subject}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {actualCurrentHours.toFixed(1)} / {maxHours.toFixed(1)}
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
                              <Badge 
                                variant={workloadPercentage > 100 ? "destructive" : "light"}
                              >
                                {getWorkloadStatus(actualCurrentHours, maxHours)}
                              </Badge>
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

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href="/planstellberechnung">
              <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-action-planstellberechnung">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Calculator className="text-blue-600 text-xl" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-foreground">Planstellberechnung</h4>
                      <p className="text-sm text-muted-foreground">Stellen neu berechnen</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/stdv-kl-optimum">
              <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-action-optimization">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <Clock className="text-green-600 text-xl" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-foreground">Optimierung starten</h4>
                      <p className="text-sm text-muted-foreground">Automatische Zuweisung</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-action-conflicts">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Bell className="text-orange-600 text-xl" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Konflikte lösen</h4>
                    <p className="text-sm text-muted-foreground">3 offene Konflikte</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
