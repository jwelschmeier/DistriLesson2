import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  Calendar, Clock, Users, BookOpen, Presentation, School, 
  GraduationCap, Filter, Download, Grid, List, BarChart3,
  Search, Eye, AlertTriangle, CheckCircle, FileText, Printer
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Teacher, type Class, type Subject, type Assignment } from "@shared/schema";
import { calculateCorrectHours } from "@shared/parallel-subjects";

interface ExtendedAssignment extends Assignment {
  teacher?: Teacher;
  class?: Class;
  subject?: Subject;
}

interface TeacherWorkload {
  teacher: Teacher;
  semester1Hours: number;
  semester2Hours: number;
  totalHours: number;
  maxHours: number;
  utilizationPercent: number;
  isOverloaded: boolean;
}

interface ClassCoverage {
  class: Class;
  totalAssignments: number;
  totalHours: number;
  requiredSubjects: number;
  coveredSubjects: number;
  coverage: number;
  missingSubjects: string[];
}

export default function MasterStundenplan() {
  const [activeView, setActiveView] = useState<'table' | 'grid' | 'semester'>('table');
  const [selectedSemester, setSelectedSemester] = useState<'all' | '1' | '2'>('all');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [conflictFilter, setConflictFilter] = useState<'all' | 'conflicts' | 'normal'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'teacher' | 'class' | 'subject' | 'hours'>('teacher');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { toast } = useToast();

  // Data queries
  const { data: teachers, isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: classes, isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: subjects, isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
  });

  // Create lookup maps for efficient joins
  const teacherMap = useMemo(() => {
    if (!teachers) return new Map();
    return new Map(teachers.map(teacher => [teacher.id, teacher]));
  }, [teachers]);

  const classMap = useMemo(() => {
    if (!classes) return new Map();
    return new Map(classes.map(cls => [cls.id, cls]));
  }, [classes]);

  const subjectMap = useMemo(() => {
    if (!subjects) return new Map();
    return new Map(subjects.map(subject => [subject.id, subject]));
  }, [subjects]);

  // Extended assignments with joined data
  const extendedAssignments = useMemo((): ExtendedAssignment[] => {
    if (!assignments) return [];
    
    return assignments.map(assignment => ({
      ...assignment,
      teacher: teacherMap.get(assignment.teacherId),
      class: classMap.get(assignment.classId),
      subject: subjectMap.get(assignment.subjectId),
    }));
  }, [assignments, teacherMap, classMap, subjectMap]);

  // Calculate teacher workload statistics
  const teacherWorkloads = useMemo((): TeacherWorkload[] => {
    if (!teachers) return [];

    return teachers.map(teacher => {
      const teacherAssignments = extendedAssignments.filter(a => a.teacherId === teacher.id);
      
      const semester1Hours = teacherAssignments
        .filter(a => a.semester === "1")
        .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
      
      const semester2Hours = teacherAssignments
        .filter(a => a.semester === "2")
        .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
      
      const totalHours = semester1Hours + semester2Hours;
      const maxHours = parseFloat(teacher.maxHours);
      const utilizationPercent = maxHours > 0 ? (totalHours / maxHours) * 100 : 0;
      const isOverloaded = totalHours > maxHours;

      return {
        teacher,
        semester1Hours,
        semester2Hours,
        totalHours,
        maxHours,
        utilizationPercent,
        isOverloaded,
      };
    });
  }, [teachers, extendedAssignments]);

  // Calculate class coverage statistics
  const classCoverages = useMemo((): ClassCoverage[] => {
    if (!classes) return [];

    return classes.map(classItem => {
      const classAssignments = extendedAssignments.filter(a => a.classId === classItem.id);
      const totalAssignments = classAssignments.length;
      // Use correct calculation that handles parallel subjects
      const correctHours = calculateCorrectHours(classItem.subjectHours, classItem.grade);
      const totalHours = correctHours.totalHours;
      
      // Simplified coverage calculation - in a real system this would be more complex
      const assignedSubjects = new Set(classAssignments.map(a => a.subjectId));
      const requiredSubjects = subjects?.length || 0;
      const coveredSubjects = assignedSubjects.size;
      const coverage = requiredSubjects > 0 ? (coveredSubjects / requiredSubjects) * 100 : 0;
      
      const missingSubjects = subjects
        ?.filter(subject => !assignedSubjects.has(subject.id))
        .map(subject => subject.shortName) || [];

      return {
        class: classItem,
        totalAssignments,
        totalHours,
        requiredSubjects,
        coveredSubjects,
        coverage,
        missingSubjects,
      };
    });
  }, [classes, subjects, extendedAssignments]);

  // Filtered and sorted assignments
  const filteredAssignments = useMemo(() => {
    let filtered = [...extendedAssignments];

    // Apply filters
    if (selectedSemester !== 'all') {
      filtered = filtered.filter(a => a.semester === selectedSemester);
    }

    if (selectedTeacher !== 'all') {
      filtered = filtered.filter(a => a.teacherId === selectedTeacher);
    }

    if (selectedClass !== 'all') {
      filtered = filtered.filter(a => a.classId === selectedClass);
    }

    if (selectedSubject !== 'all') {
      filtered = filtered.filter(a => a.subjectId === selectedSubject);
    }

    if (conflictFilter !== 'all') {
      if (conflictFilter === 'conflicts') {
        filtered = filtered.filter(a => {
          const teacher = teacherWorkloads.find(tw => tw.teacher.id === a.teacherId);
          return teacher?.isOverloaded;
        });
      } else {
        filtered = filtered.filter(a => {
          const teacher = teacherWorkloads.find(tw => tw.teacher.id === a.teacherId);
          return !teacher?.isOverloaded;
        });
      }
    }

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(a => 
        (a.teacher?.firstName?.toLowerCase()?.includes(term) ?? false) ||
        (a.teacher?.lastName?.toLowerCase()?.includes(term) ?? false) ||
        (a.teacher?.shortName?.toLowerCase()?.includes(term) ?? false) ||
        (a.class?.name?.toLowerCase()?.includes(term) ?? false) ||
        (a.subject?.name?.toLowerCase()?.includes(term) ?? false) ||
        (a.subject?.shortName?.toLowerCase()?.includes(term) ?? false)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'hours') {
        const aValue = Number(a.hoursPerWeek) || 0;
        const bValue = Number(b.hoursPerWeek) || 0;
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }

      let aValue: string, bValue: string;
      
      switch (sortBy) {
        case 'teacher':
          aValue = `${a.teacher?.lastName || ''} ${a.teacher?.firstName || ''}`.trim();
          bValue = `${b.teacher?.lastName || ''} ${b.teacher?.firstName || ''}`.trim();
          break;
        case 'class':
          aValue = a.class?.name || '';
          bValue = b.class?.name || '';
          break;
        case 'subject':
          aValue = a.subject?.shortName || '';
          bValue = b.subject?.shortName || '';
          break;
        default:
          aValue = a.createdAt ? new Date(a.createdAt).toISOString() : '';
          bValue = b.createdAt ? new Date(b.createdAt).toISOString() : '';
      }

      const comparison = aValue.localeCompare(bValue);
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [extendedAssignments, selectedSemester, selectedTeacher, selectedClass, selectedSubject, conflictFilter, searchTerm, sortBy, sortOrder, teacherWorkloads]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    const totalAssignments = filteredAssignments.length;
    const totalHours = filteredAssignments.reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
    const semester1Hours = filteredAssignments
      .filter(a => a.semester === "1")
      .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
    const semester2Hours = filteredAssignments
      .filter(a => a.semester === "2")
      .reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0);
    
    const overloadedTeachers = teacherWorkloads.filter(tw => tw.isOverloaded).length;
    const averageUtilization = teacherWorkloads.length > 0 
      ? teacherWorkloads.reduce((sum, tw) => sum + tw.utilizationPercent, 0) / teacherWorkloads.length 
      : 0;

    return {
      totalAssignments,
      totalHours,
      semester1Hours,
      semester2Hours,
      overloadedTeachers,
      averageUtilization,
    };
  }, [filteredAssignments, teacherWorkloads]);

  // Export functionality
  const exportToCSV = useCallback(() => {
    const headers = ['Lehrkraft', 'Klasse', 'Fach', 'Stunden/Woche', 'Semester', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredAssignments.map(a => [
        `"${a.teacher?.firstName} ${a.teacher?.lastName} (${a.teacher?.shortName})"`,
        `"${a.class?.name}"`,
        `"${a.subject?.shortName}"`,
        a.hoursPerWeek,
        a.semester,
        teacherWorkloads.find(tw => tw.teacher.id === a.teacherId)?.isOverloaded ? 'Überlastet' : 'Normal'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'master_stundenplan.csv';
    link.click();
    
    toast({
      title: "Export erfolgreich",
      description: `${filteredAssignments.length} Zuweisungen als CSV exportiert.`,
    });
  }, [filteredAssignments, teacherWorkloads, toast]);

  const printView = useCallback(() => {
    window.print();
    toast({
      title: "Druckansicht",
      description: "Druckdialog wurde geöffnet.",
    });
  }, [toast]);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setSelectedSemester('all');
    setSelectedTeacher('all');
    setSelectedClass('all');
    setSelectedSubject('all');
    setConflictFilter('all');
    setSearchTerm('');
    setSortBy('teacher');
    setSortOrder('asc');
    toast({
      title: "Filter zurückgesetzt",
      description: "Alle Filter und Sortierungen wurden zurückgesetzt.",
    });
  }, [toast]);

  const isLoading = teachersLoading || classesLoading || subjectsLoading || assignmentsLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Master-Stundenplan</h2>
                <p className="text-foreground/70 font-medium">Umfassende Übersicht aller Stundenpläne</p>
              </div>
            </div>
          </header>
          <div className="p-6 flex items-center justify-center">
            <div className="text-center">
              <Clock className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Lade Master-Stundenplan-Daten...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header Bar */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Master-Stundenplan</h2>
              <p className="text-muted-foreground">Umfassende Übersicht aller Stundenpläne</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Export Actions */}
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToCSV}
                  data-testid="button-export-csv"
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={printView}
                  data-testid="button-print"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Drucken
                </Button>
              </div>
              
              {/* View Mode Toggle */}
              <div className="flex items-center space-x-1 bg-accent/50 border border-border rounded-md p-1">
                <Button
                  variant={activeView === 'table' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView('table')}
                  data-testid="button-view-table"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeView === 'grid' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView('grid')}
                  data-testid="button-view-grid"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeView === 'semester' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView('semester')}
                  data-testid="button-view-semester"
                >
                  <Calendar className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Statistics Overview */}
        <div className="p-6 bg-primary/5 border-b border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground/70">Gesamt Zuweisungen</p>
                    <p className="text-2xl font-bold" data-testid="stat-total-assignments">{overallStats.totalAssignments}</p>
                  </div>
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground/70">Gesamt Stunden</p>
                    <p className="text-2xl font-bold" data-testid="stat-total-hours">{overallStats.totalHours}</p>
                    <p className="text-xs text-foreground/60 font-medium">
                      S1: {overallStats.semester1Hours} | S2: {overallStats.semester2Hours}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground/70">Überlastete Lehrer</p>
                    <p className="text-2xl font-bold text-destructive" data-testid="stat-overloaded-teachers">{overallStats.overloadedTeachers}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground/70">Ø Auslastung</p>
                    <p className="text-2xl font-bold" data-testid="stat-average-utilization">
                      {Math.round(overallStats.averageUtilization)}%
                    </p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="px-6 py-4 border-b border-border bg-accent/30">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="flex items-center space-x-2 min-w-64">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Lehrer, Klasse oder Fach..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
                data-testid="input-search"
              />
            </div>

            {/* Filters */}
            <Select value={selectedSemester} onValueChange={(value: 'all' | '1' | '2') => setSelectedSemester(value)}>
              <SelectTrigger className="w-32" data-testid="select-semester">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Semester</SelectItem>
                <SelectItem value="1">1. Semester</SelectItem>
                <SelectItem value="2">2. Semester</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
              <SelectTrigger className="w-48" data-testid="select-teacher-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Lehrer</SelectItem>
                {teachers?.map(teacher => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.shortName} - {teacher.firstName} {teacher.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-32" data-testid="select-class-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Klassen</SelectItem>
                {classes?.map(classItem => (
                  <SelectItem key={classItem.id} value={classItem.id}>
                    {classItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-32" data-testid="select-subject-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Fächer</SelectItem>
                {subjects?.map(subject => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.shortName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={conflictFilter} onValueChange={(value: 'all' | 'conflicts' | 'normal') => setConflictFilter(value)}>
              <SelectTrigger className="w-32" data-testid="select-conflict-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="conflicts">Konflikte</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(value: 'teacher' | 'class' | 'subject' | 'hours') => setSortBy(value)}>
              <SelectTrigger className="w-32" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teacher">Nach Lehrer</SelectItem>
                <SelectItem value="class">Nach Klasse</SelectItem>
                <SelectItem value="subject">Nach Fach</SelectItem>
                <SelectItem value="hours">Nach Stunden</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              data-testid="button-sort-order"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              data-testid="button-reset-filters"
            >
              <Filter className="h-4 w-4 mr-2" />
              Zurücksetzen
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6">
          {/* Table View */}
          {activeView === 'table' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <List className="mr-2 text-primary" />
                    Alle Zuweisungen ({filteredAssignments.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lehrkraft</TableHead>
                        <TableHead>Klasse</TableHead>
                        <TableHead>Fach</TableHead>
                        <TableHead className="text-center">Stunden/Woche</TableHead>
                        <TableHead className="text-center">Semester</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssignments.map((assignment) => {
                        const teacherWorkload = teacherWorkloads.find(tw => tw.teacher.id === assignment.teacherId);
                        const isOverloaded = teacherWorkload?.isOverloaded || false;
                        
                        return (
                          <TableRow key={assignment.id} data-testid={`row-assignment-${assignment.id}`}>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <div>
                                  <p className="font-medium">
                                    {assignment.teacher?.firstName} {assignment.teacher?.lastName}
                                  </p>
                                  <p className="text-sm font-medium text-primary">
                                    {assignment.teacher?.shortName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="light">{assignment.class?.name}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="light">{assignment.subject?.shortName}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-medium">{assignment.hoursPerWeek}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="light">
                                {assignment.semester === "1" ? "1. Semester" : "2. Semester"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {isOverloaded ? (
                                <Badge variant="destructive" className="flex items-center w-fit mx-auto">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Überlastet
                                </Badge>
                              ) : (
                                <Badge variant="light" className="flex items-center w-fit mx-auto">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Normal
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  
                  {filteredAssignments.length === 0 && (
                    <div className="text-center py-12">
                      <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-muted-foreground">Keine Zuweisungen gefunden</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        Passen Sie Ihre Filter an oder erstellen Sie neue Zuweisungen.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grid View */}
          {activeView === 'grid' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center">
                      <Grid className="mr-2 text-primary" />
                      Lehrer-Übersicht ({teacherWorkloads.length} Lehrer)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {teacherWorkloads
                      .filter(tw => {
                        if (selectedTeacher !== 'all' && tw.teacher.id !== selectedTeacher) return false;
                        const teacherAssignments = extendedAssignments.filter(a => a.teacherId === tw.teacher.id);
                        return teacherAssignments.length > 0;
                      })
                      .map((teacherWorkload) => {
                        const teacherAssignments = filteredAssignments.filter(a => a.teacherId === teacherWorkload.teacher.id);
                        const semester1Assignments = teacherAssignments.filter(a => a.semester === "1");
                        const semester2Assignments = teacherAssignments.filter(a => a.semester === "2");
                        
                        return (
                          <Card
                            key={teacherWorkload.teacher.id}
                            className={`transition-all hover:shadow-lg ${teacherWorkload.isOverloaded ? 'border-destructive bg-destructive/5' : 'hover:border-primary'}`}
                            data-testid={`card-teacher-${teacherWorkload.teacher.id}`}
                          >
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-semibold text-sm">
                                    {teacherWorkload.teacher.firstName} {teacherWorkload.teacher.lastName}
                                  </h4>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    {teacherWorkload.teacher.shortName}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <Badge
                                    variant={teacherWorkload.isOverloaded ? "destructive" : "secondary"}
                                    className="text-xs"
                                  >
                                    {Math.round(teacherWorkload.utilizationPercent)}%
                                  </Badge>
                                </div>
                              </div>
                              
                              {/* Progress Bar */}
                              <div className="w-full bg-secondary rounded-full h-2 mt-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    teacherWorkload.isOverloaded
                                      ? 'bg-destructive'
                                      : teacherWorkload.utilizationPercent > 80
                                      ? 'bg-orange-500'
                                      : 'bg-primary'
                                  }`}
                                  style={{
                                    width: `${Math.min(teacherWorkload.utilizationPercent, 100)}%`,
                                  }}
                                />
                              </div>
                              
                              {/* Hours Summary */}
                              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>
                                  {teacherWorkload.totalHours}h / {teacherWorkload.maxHours}h
                                </span>
                                <span>
                                  S1: {teacherWorkload.semester1Hours}h | S2: {teacherWorkload.semester2Hours}h
                                </span>
                              </div>
                            </CardHeader>
                            
                            <CardContent className="pt-2">
                              {teacherAssignments.length > 0 ? (
                                <div className="space-y-3">
                                  {/* Semester 1 */}
                                  {semester1Assignments.length > 0 && (
                                    <div>
                                      <div className="flex items-center text-xs font-medium text-muted-foreground mb-2">
                                        <span className="flex-1">1. Semester</span>
                                        <span>{semester1Assignments.reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0)}h</span>
                                      </div>
                                      <div className="space-y-1">
                                        {semester1Assignments.map((assignment) => (
                                          <div
                                            key={assignment.id}
                                            className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs"
                                          >
                                            <div className="flex items-center space-x-2">
                                              <Badge variant="light" className="text-xs px-1">
                                                {assignment.class?.name}
                                              </Badge>
                                              <span className="font-medium">
                                                {assignment.subject?.shortName}
                                              </span>
                                            </div>
                                            <span className="font-mono text-muted-foreground">
                                              {assignment.hoursPerWeek}h
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Semester 2 */}
                                  {semester2Assignments.length > 0 && (
                                    <div>
                                      <div className="flex items-center text-xs font-medium text-muted-foreground mb-2">
                                        <span className="flex-1">2. Semester</span>
                                        <span>{semester2Assignments.reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0)}h</span>
                                      </div>
                                      <div className="space-y-1">
                                        {semester2Assignments.map((assignment) => (
                                          <div
                                            key={assignment.id}
                                            className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs"
                                          >
                                            <div className="flex items-center space-x-2">
                                              <Badge variant="light" className="text-xs px-1">
                                                {assignment.class?.name}
                                              </Badge>
                                              <span className="font-medium">
                                                {assignment.subject?.shortName}
                                              </span>
                                            </div>
                                            <span className="font-mono text-muted-foreground">
                                              {assignment.hoursPerWeek}h
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-center py-4">
                                  <Clock className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                                  <p className="text-xs text-muted-foreground">Keine Zuweisungen</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>
                  
                  {teacherWorkloads.filter(tw => {
                    if (selectedTeacher !== 'all' && tw.teacher.id !== selectedTeacher) return false;
                    const teacherAssignments = extendedAssignments.filter(a => a.teacherId === tw.teacher.id);
                    return teacherAssignments.length > 0;
                  }).length === 0 && (
                    <div className="text-center py-12">
                      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-muted-foreground">Keine Lehrer gefunden</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        Passen Sie Ihre Filter an oder erstellen Sie neue Zuweisungen.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Semester View */}
          {activeView === 'semester' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Semester 1 */}
                <Card className="h-fit">
                  <CardHeader className="bg-primary/5 border-b">
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center">
                        <Calendar className="mr-2 text-primary" />
                        1. Semester
                      </span>
                      <Badge variant="light" className="text-sm">
                        {filteredAssignments.filter(a => a.semester === "1").length} Zuweisungen
                      </Badge>
                    </CardTitle>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Gesamt: {overallStats.semester1Hours} Stunden</span>
                      <span>
                        Ø {Math.round(overallStats.semester1Hours / (teachers?.length || 1))} Std/Lehrer
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                      {/* Group by class for Semester 1 */}
                      {classes
                        ?.filter(cls => {
                          const classAssignments = filteredAssignments.filter(
                            a => a.classId === cls.id && a.semester === "1"
                          );
                          return classAssignments.length > 0;
                        })
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(cls => {
                          const classAssignments = filteredAssignments.filter(
                            a => a.classId === cls.id && a.semester === "1"
                          );
                          
                          return (
                            <div key={cls.id} className="border rounded-lg p-3 bg-card">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-sm">{cls.name}</h4>
                                <Badge variant="light" className="text-xs">
                                  {classAssignments.reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0)} Stunden
                                </Badge>
                              </div>
                              
                              <div className="space-y-2">
                                {classAssignments
                                  .sort((a, b) => (a.subject?.shortName || '').localeCompare(b.subject?.shortName || ''))
                                  .map(assignment => (
                                    <div
                                      key={assignment.id}
                                      className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs"
                                      data-testid={`semester1-assignment-${assignment.id}`}
                                    >
                                      <div className="flex items-center space-x-2">
                                        <Badge variant="light" className="text-xs px-1">
                                          {assignment.subject?.shortName}
                                        </Badge>
                                        <span className="font-medium text-muted-foreground">
                                          {assignment.teacher?.shortName}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {assignment.teacher?.firstName} {assignment.teacher?.lastName}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <span className="font-mono">
                                          {assignment.hoursPerWeek}h
                                        </span>
                                        {teacherWorkloads.find(tw => tw.teacher.id === assignment.teacherId)?.isOverloaded && (
                                          <AlertTriangle className="h-3 w-3 text-destructive" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          );
                        })}
                      
                      {filteredAssignments.filter(a => a.semester === "1").length === 0 && (
                        <div className="text-center py-8">
                          <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Keine Zuweisungen im 1. Semester</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Semester 2 */}
                <Card className="h-fit">
                  <CardHeader className="bg-secondary/5 border-b">
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center">
                        <Calendar className="mr-2 text-secondary-foreground" />
                        2. Semester
                      </span>
                      <Badge variant="light" className="text-sm">
                        {filteredAssignments.filter(a => a.semester === "2").length} Zuweisungen
                      </Badge>
                    </CardTitle>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Gesamt: {overallStats.semester2Hours} Stunden</span>
                      <span>
                        Ø {Math.round(overallStats.semester2Hours / (teachers?.length || 1))} Std/Lehrer
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                      {/* Group by class for Semester 2 */}
                      {classes
                        ?.filter(cls => {
                          const classAssignments = filteredAssignments.filter(
                            a => a.classId === cls.id && a.semester === "2"
                          );
                          return classAssignments.length > 0;
                        })
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(cls => {
                          const classAssignments = filteredAssignments.filter(
                            a => a.classId === cls.id && a.semester === "2"
                          );
                          
                          return (
                            <div key={cls.id} className="border rounded-lg p-3 bg-card">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-sm">{cls.name}</h4>
                                <Badge variant="light" className="text-xs">
                                  {classAssignments.reduce((sum, a) => sum + parseFloat(a.hoursPerWeek), 0)} Stunden
                                </Badge>
                              </div>
                              
                              <div className="space-y-2">
                                {classAssignments
                                  .sort((a, b) => (a.subject?.shortName || '').localeCompare(b.subject?.shortName || ''))
                                  .map(assignment => (
                                    <div
                                      key={assignment.id}
                                      className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs"
                                      data-testid={`semester2-assignment-${assignment.id}`}
                                    >
                                      <div className="flex items-center space-x-2">
                                        <Badge variant="light" className="text-xs px-1">
                                          {assignment.subject?.shortName}
                                        </Badge>
                                        <span className="font-medium text-muted-foreground">
                                          {assignment.teacher?.shortName}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {assignment.teacher?.firstName} {assignment.teacher?.lastName}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <span className="font-mono">
                                          {assignment.hoursPerWeek}h
                                        </span>
                                        {teacherWorkloads.find(tw => tw.teacher.id === assignment.teacherId)?.isOverloaded && (
                                          <AlertTriangle className="h-3 w-3 text-destructive" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          );
                        })}
                      
                      {filteredAssignments.filter(a => a.semester === "2").length === 0 && (
                        <div className="text-center py-8">
                          <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Keine Zuweisungen im 2. Semester</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Semester Comparison Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="mr-2 text-primary" />
                    Semester-Vergleich
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <h4 className="font-semibold text-lg text-primary">
                        {Math.abs(overallStats.semester1Hours - overallStats.semester2Hours)}
                      </h4>
                      <p className="text-sm text-muted-foreground">Stunden-Unterschied</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {overallStats.semester1Hours > overallStats.semester2Hours ? 'S1 höher' : 
                         overallStats.semester2Hours > overallStats.semester1Hours ? 'S2 höher' : 'Ausgeglichen'}
                      </p>
                    </div>
                    
                    <div className="text-center p-4 border rounded-lg">
                      <h4 className="font-semibold text-lg text-secondary">
                        {filteredAssignments.filter(a => a.semester === "1").length + 
                         filteredAssignments.filter(a => a.semester === "2").length}
                      </h4>
                      <p className="text-sm text-muted-foreground">Gesamt Zuweisungen</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        S1: {filteredAssignments.filter(a => a.semester === "1").length} | 
                        S2: {filteredAssignments.filter(a => a.semester === "2").length}
                      </p>
                    </div>
                    
                    <div className="text-center p-4 border rounded-lg">
                      <h4 className="font-semibold text-lg text-destructive">
                        {overallStats.overloadedTeachers}
                      </h4>
                      <p className="text-sm text-muted-foreground">Überlastete Lehrer</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {Math.round(overallStats.averageUtilization)}% Ø Auslastung
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}