import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Clock, Users, BookOpen, Presentation, School, GraduationCap } from "lucide-react";
import { type Teacher, type Class, type Subject, type Assignment } from "@shared/schema";

interface ExtendedAssignment extends Assignment {
  teacher?: Teacher;
  class?: Class;
  subject?: Subject;
}

export default function Stundenplaene() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  
  const [activeTab, setActiveTab] = useState<string>("teacher");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

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

  // Handle URL query parameters for deep linking
  useEffect(() => {
    const tab = searchParams.get('tab');
    const id = searchParams.get('id');
    
    // Set active tab if specified in URL
    if (tab && (tab === 'teacher' || tab === 'class')) {
      setActiveTab(tab);
    }
    
    // Set selected teacher/class if ID is provided and data is loaded
    if (id) {
      if (tab === 'teacher' && teachers) {
        // Check if the teacher ID exists in the data
        const teacherExists = teachers.find(teacher => teacher.id === id);
        if (teacherExists) {
          setSelectedTeacherId(id);
        }
      } else if (tab === 'class' && classes) {
        // Check if the class ID exists in the data
        const classExists = classes.find(cls => cls.id === id);
        if (classExists) {
          setSelectedClassId(id);
        }
      }
    }
  }, [searchParams, teachers, classes]);

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

  // Filter assignments for selected teacher
  const teacherAssignments = useMemo(() => {
    if (!selectedTeacherId) return [];
    return extendedAssignments.filter(assignment => assignment.teacherId === selectedTeacherId);
  }, [extendedAssignments, selectedTeacherId]);

  // Filter assignments for selected class
  const classAssignments = useMemo(() => {
    if (!selectedClassId) return [];
    return extendedAssignments.filter(assignment => assignment.classId === selectedClassId);
  }, [extendedAssignments, selectedClassId]);

  // Calculate teacher summary statistics
  const teacherSummary = useMemo(() => {
    const totalHours = teacherAssignments.reduce((sum, assignment) => sum + assignment.hoursPerWeek, 0);
    const s1Hours = teacherAssignments
      .filter(assignment => assignment.semester === "1")
      .reduce((sum, assignment) => sum + assignment.hoursPerWeek, 0);
    const s2Hours = teacherAssignments
      .filter(assignment => assignment.semester === "2")
      .reduce((sum, assignment) => sum + assignment.hoursPerWeek, 0);
    
    return { totalHours, s1Hours, s2Hours };
  }, [teacherAssignments]);

  // Calculate class summary statistics
  const classSummary = useMemo(() => {
    const totalHours = classAssignments.reduce((sum, assignment) => sum + assignment.hoursPerWeek, 0);
    const uniqueTeachers = new Set(classAssignments.map(assignment => assignment.teacherId));
    const teacherCount = uniqueTeachers.size;
    
    return { totalHours, teacherCount };
  }, [classAssignments]);

  const selectedTeacher = selectedTeacherId ? teacherMap.get(selectedTeacherId) : null;
  const selectedClass = selectedClassId ? classMap.get(selectedClassId) : null;

  const isLoading = teachersLoading || classesLoading || subjectsLoading || assignmentsLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Stundenpläne</h2>
                <p className="text-muted-foreground">Übersicht über Lehrer- und Klassenstundenpläne</p>
              </div>
            </div>
          </header>
          <div className="p-6 flex items-center justify-center">
            <div className="text-center">
              <Clock className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Lade Stundenplandaten...</p>
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
              <h2 className="text-2xl font-semibold text-foreground">Stundenpläne</h2>
              <p className="text-muted-foreground">Übersicht über Lehrer- und Klassenstundenpläne</p>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Schuljahr 2024/25</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" data-testid="tabs-stundenplaene">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="teacher" data-testid="tab-lehrer">
                <Presentation className="h-4 w-4 mr-2" />
                Lehrer
              </TabsTrigger>
              <TabsTrigger value="class" data-testid="tab-klasse">
                <School className="h-4 w-4 mr-2" />
                Klasse
              </TabsTrigger>
            </TabsList>

            {/* Teacher Tab Content */}
            <TabsContent value="teacher" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Presentation className="mr-2 text-primary" />
                    Lehrer auswählen
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId} data-testid="select-teacher">
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Wählen Sie eine Lehrkraft aus..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers?.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.firstName} {teacher.lastName} ({teacher.shortName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {selectedTeacher && (
                <>
                  {/* Teacher Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card data-testid="card-teacher-total-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">Gesamtstunden</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-teacher-total-hours">
                              {teacherSummary.totalHours}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Clock className="text-blue-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-teacher-s1-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">1. Halbjahr</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-teacher-s1-hours">
                              {teacherSummary.s1Hours}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <BookOpen className="text-green-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-teacher-s2-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">2. Halbjahr</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-teacher-s2-hours">
                              {teacherSummary.s2Hours}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                            <BookOpen className="text-orange-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Teacher Assignments Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Stundenplan für {selectedTeacher.firstName} {selectedTeacher.lastName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {teacherAssignments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground" data-testid="empty-teacher-assignments">
                          <Calendar className="h-8 w-8 mx-auto mb-2" />
                          <p>Keine Zuweisungen für diese Lehrkraft vorhanden.</p>
                        </div>
                      ) : (
                        <Table data-testid="table-teacher-assignments">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Klasse</TableHead>
                              <TableHead>Fach</TableHead>
                              <TableHead>Stunden</TableHead>
                              <TableHead>Semester</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {teacherAssignments.map((assignment) => (
                              <TableRow key={assignment.id} data-testid={`row-teacher-assignment-${assignment.id}`}>
                                <TableCell className="font-medium">
                                  {assignment.class?.name || 'Unbekannt'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary">
                                    {assignment.subject?.shortName || assignment.subject?.name || 'Unbekannt'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{assignment.hoursPerWeek}</TableCell>
                                <TableCell>
                                  <Badge variant={assignment.semester === "1" ? "default" : "outline"}>
                                    {assignment.semester === "1" ? "1. HJ" : "2. HJ"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Class Tab Content */}
            <TabsContent value="class" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <School className="mr-2 text-primary" />
                    Klasse auswählen
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedClassId} onValueChange={setSelectedClassId} data-testid="select-class">
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Wählen Sie eine Klasse aus..." />
                    </SelectTrigger>
                    <SelectContent>
                      {classes?.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name} (Stufe {cls.grade})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {selectedClass && (
                <>
                  {/* Class Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card data-testid="card-class-total-hours">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">Gesamtstunden</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-class-total-hours">
                              {classSummary.totalHours}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Clock className="text-purple-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-class-teachers">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-muted-foreground text-sm font-medium">Lehrkräfte</p>
                            <p className="text-3xl font-bold text-foreground" data-testid="text-class-teachers">
                              {classSummary.teacherCount}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <Users className="text-green-600 text-xl" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Class Information Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <GraduationCap className="mr-2 text-primary" />
                        Klasseninformationen
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Klassenname:</span>
                          <p className="font-medium">{selectedClass.name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Jahrgangsstufe:</span>
                          <p className="font-medium">{selectedClass.grade}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Schüleranzahl:</span>
                          <p className="font-medium">{selectedClass.studentCount}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Class Assignments Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Stundenplan für Klasse {selectedClass.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {classAssignments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground" data-testid="empty-class-assignments">
                          <Calendar className="h-8 w-8 mx-auto mb-2" />
                          <p>Keine Zuweisungen für diese Klasse vorhanden.</p>
                        </div>
                      ) : (
                        <Table data-testid="table-class-assignments">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Lehrkraft</TableHead>
                              <TableHead>Fach</TableHead>
                              <TableHead>Stunden</TableHead>
                              <TableHead>Semester</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {classAssignments.map((assignment) => (
                              <TableRow key={assignment.id} data-testid={`row-class-assignment-${assignment.id}`}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                                      <span className="text-secondary-foreground text-sm font-medium">
                                        {assignment.teacher?.shortName || '??'}
                                      </span>
                                    </div>
                                    <span>
                                      {assignment.teacher ? 
                                        `${assignment.teacher.firstName} ${assignment.teacher.lastName}` : 
                                        'Unbekannt'}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary">
                                    {assignment.subject?.shortName || assignment.subject?.name || 'Unbekannt'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{assignment.hoursPerWeek}</TableCell>
                                <TableCell>
                                  <Badge variant={assignment.semester === "1" ? "default" : "outline"}>
                                    {assignment.semester === "1" ? "1. HJ" : "2. HJ"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}