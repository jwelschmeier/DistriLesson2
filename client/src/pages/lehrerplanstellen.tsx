import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import { type Assignment } from "@shared/schema";

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  shortName: string;
  subjects: string[];
  currentHours: number;
  maxHours: number;
  qualifications: string[];
  isActive: boolean;
}

interface PlanstelleOverview {
  subject: string;
  required: number;
  available: number;
  teachers: number;
  status: "good" | "warning" | "critical";
}

// Mock data for demonstration
const mockPlanstellenOverview: PlanstelleOverview[] = [
  { subject: "Deutsch", required: 13.2, available: 12.5, teachers: 4, status: "warning" },
  { subject: "Mathematik", required: 12.5, available: 11.8, teachers: 3, status: "warning" },
  { subject: "Englisch", required: 9.8, available: 8.2, teachers: 3, status: "critical" },
  { subject: "Naturwissenschaften", required: 8.2, available: 6.5, teachers: 2, status: "critical" },
  { subject: "Geschichte", required: 6.0, available: 6.2, teachers: 2, status: "good" },
  { subject: "Sport", required: 5.2, available: 4.8, teachers: 2, status: "warning" },
  { subject: "Kunst", required: 3.5, available: 3.8, teachers: 1, status: "good" },
  { subject: "Musik", required: 3.0, available: 2.5, teachers: 1, status: "critical" },
];

export default function Lehrerplanstellen() {
  const { data: teachers, isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
  });

  // Calculate actual current hours for a teacher based on assignments
  const calculateActualCurrentHours = (teacherId: string): number => {
    const teacherAssignments = assignments.filter(a => a.teacherId === teacherId);
    
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
    // This matches the logic in stundenplaene.tsx
    return Math.max(s1Hours, s2Hours);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "good": return "text-green-600";
      case "warning": return "text-orange-600";
      case "critical": return "text-red-600";
      default: return "text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "good": return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case "critical": return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "good": return "Gut versorgt";
      case "warning": return "Unterbesetzt";
      case "critical": return "Kritisch";
      default: return "Unbekannt";
    }
  };

  const totalTeachers = teachers?.length || 0;
  const activeTeachers = teachers?.filter(t => t.isActive).length || 0;
  
  // Calculate workload with the actual calculated hours
  const averageWorkload = teachers?.length ? 
    teachers.reduce((sum, t) => {
      const actualHours = calculateActualCurrentHours(t.id);
      return sum + (actualHours / t.maxHours);
    }, 0) / teachers.length * 100 : 0;

  const goodSupplied = mockPlanstellenOverview.filter(p => p.status === "good").length;
  const warnings = mockPlanstellenOverview.filter(p => p.status === "warning").length;
  const critical = mockPlanstellenOverview.filter(p => p.status === "critical").length;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Lehrerplanstellen</h2>
            <p className="text-muted-foreground">Übersicht über verfügbare und benötigte Lehrerstellen</p>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card data-testid="card-total-teachers">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Lehrkräfte gesamt</p>
                    <p className="text-3xl font-bold text-foreground">{totalTeachers}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="text-blue-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-green-600 font-medium">{activeTeachers}</span>
                  <span className="text-muted-foreground ml-1">aktiv</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-good-supplied">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Gut versorgt</p>
                    <p className="text-3xl font-bold text-green-600">{goodSupplied}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="text-green-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-muted-foreground">Fächer</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-warnings">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Warnungen</p>
                    <p className="text-3xl font-bold text-orange-600">{warnings}</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-orange-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-muted-foreground">Unterbesetzt</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-critical">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Kritisch</p>
                    <p className="text-3xl font-bold text-red-600">{critical}</p>
                  </div>
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <TrendingDown className="text-red-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-muted-foreground">Stark unterbesetzt</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Subject Overview */}
          <Card data-testid="card-subject-overview">
            <CardHeader>
              <CardTitle>Fachbezogene Planstellenübersicht</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Fach
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Benötigt
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Verfügbar
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Lehrkräfte
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Abdeckung
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {mockPlanstellenOverview.map((subject, index) => {
                      const coverage = (subject.available / subject.required) * 100;
                      return (
                        <tr key={index} data-testid={`row-subject-${subject.subject.toLowerCase()}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-foreground">{subject.subject}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                            {subject.required.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                            {subject.available.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                            {subject.teachers}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Progress value={Math.min(coverage, 100)} className="w-20 mr-2" />
                              <span className="text-sm text-muted-foreground">
                                {coverage.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {getStatusIcon(subject.status)}
                              <Badge 
                                variant={subject.status === "good" ? "light" : 
                                        subject.status === "warning" ? "light" : "destructive"}
                                className="ml-2"
                              >
                                {getStatusBadge(subject.status)}
                              </Badge>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Teacher List */}
          <Card data-testid="card-teacher-list">
            <CardHeader>
              <CardTitle>Lehrkräfte nach Fächern</CardTitle>
            </CardHeader>
            <CardContent>
              {teachersLoading || assignmentsLoading ? (
                <div className="text-center py-8">Lade Lehrerdaten...</div>
              ) : !teachers || teachers.length === 0 ? (
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
                          Stunden
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Auslastung
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Qualifikationen
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {teachers.map((teacher) => {
                        const actualCurrentHours = calculateActualCurrentHours(teacher.id);
                        const workloadPercentage = (actualCurrentHours / teacher.maxHours) * 100;
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
                                  <div className="text-sm text-muted-foreground">{teacher.shortName}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-wrap gap-1">
                                {teacher.subjects.map((subject, index) => (
                                  <Badge key={index} variant="light">{subject}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {actualCurrentHours.toFixed(1)} / {teacher.maxHours}
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
                              <div className="flex flex-wrap gap-1">
                                {teacher.qualifications.slice(0, 2).map((qual, index) => (
                                  <Badge key={index} variant="light">{qual}</Badge>
                                ))}
                                {teacher.qualifications.length > 2 && (
                                  <Badge variant="light">+{teacher.qualifications.length - 2}</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={teacher.isActive ? "light" : "destructive"}>
                                {teacher.isActive ? "Aktiv" : "Inaktiv"}
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
        </div>
      </main>
    </div>
  );
}
