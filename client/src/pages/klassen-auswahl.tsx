import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Class } from "@shared/schema";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Search, BookOpen } from "lucide-react";
import { useState } from "react";

export default function KlassenAuswahl() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");

  const { data: classes = [], isLoading } = useQuery<Class[]>({ 
    queryKey: ['/api/classes'],
    staleTime: 60000 // 1 minute cache
  });

  // Differenzierungsfächer (FS, SW, NW, IF, TC, MUS)
  const DIFF_SUBJECTS = ['FS', 'SW', 'NW', 'IF', 'TC', 'MUS'];
  
  // Helper: Check if a course is a Diff-Kurs (grade 7-10, one of the diff subjects)
  const isDiffKurs = (classItem: Class): boolean => {
    if (classItem.type !== 'kurs') return false;
    const grade = classItem.grade;
    if (grade < 7 || grade > 10) return false;
    
    // Extract subject from course name (e.g., "07FS" -> "FS")
    const match = classItem.name.match(/^\d{2}([A-Z]+)$/i);
    if (!match) return false;
    
    const subject = match[1].toUpperCase();
    return DIFF_SUBJECTS.includes(subject);
  };

  // Group classes by grade level (Jahrgang)
  const classesByGrade = classes.reduce((acc, classItem) => {
    const grade = classItem.grade;
    if (!acc[grade]) {
      acc[grade] = [];
    }
    acc[grade].push(classItem);
    return acc;
  }, {} as Record<number, Class[]>);

  // Filter classes based on search term and type
  const filteredClasses = classes.filter(classItem => {
    const matchesSearch = classItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      classItem.grade.toString().includes(searchTerm);
    
    let matchesType = false;
    if (selectedType === "all") {
      matchesType = true;
    } else if (selectedType === "diff-kurse") {
      matchesType = isDiffKurs(classItem);
    } else if (selectedType === "kurs") {
      // Regular Kurse exclude Diff-Kurse
      matchesType = classItem.type === "kurs" && !isDiffKurs(classItem);
    } else {
      matchesType = classItem.type === selectedType;
    }
    
    return matchesSearch && matchesType;
  });

  const filteredClassesByGrade = filteredClasses.reduce((acc, classItem) => {
    const grade = classItem.grade;
    if (!acc[grade]) {
      acc[grade] = [];
    }
    acc[grade].push(classItem);
    return acc;
  }, {} as Record<number, Class[]>);

  const grades = Object.keys(filteredClassesByGrade).map(Number).sort();

  return (
    <div className="flex h-screen bg-muted/50 dark:bg-muted/20">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Klassenauswahl</h2>
              <p className="text-muted-foreground">Wählen Sie eine Klasse für die Lehrer-Fächer-Zuordnung</p>
            </div>
          </div>
        </header>

        <div className="p-6">
          {/* Search and Filter */}
          <div className="mb-6 space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Klasse oder Jahrgang suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-class-search"
              />
            </div>
            
            {/* Type Filter */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setSelectedType("all")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedType === "all" 
                    ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" 
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                data-testid="filter-all"
              >
                Alle
              </button>
              <button
                onClick={() => setSelectedType("klasse")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedType === "klasse" 
                    ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300" 
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                data-testid="filter-klasse"
              >
                Klassen
              </button>
              <button
                onClick={() => setSelectedType("kurs")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedType === "kurs" 
                    ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300" 
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                data-testid="filter-kurs"
              >
                Kurse
              </button>
              <button
                onClick={() => setSelectedType("diff-kurse")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedType === "diff-kurse" 
                    ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300" 
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                data-testid="filter-diff-kurse"
              >
                Diff-Kurse
              </button>
              <button
                onClick={() => setSelectedType("ag")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedType === "ag" 
                    ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300" 
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                data-testid="filter-ag"
              >
                AGs
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
              <span className="ml-3 text-muted-foreground">Klassen werden geladen...</span>
            </div>
          ) : (
            <div className="space-y-8">
              {grades.map(grade => (
                <div key={grade} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold" data-testid={`heading-grade-${grade}`}>
                      {grade}. Jahrgang
                    </h3>
                    <Badge variant="secondary" data-testid={`badge-grade-${grade}-count`}>
                      {filteredClassesByGrade[grade].length} Klassen
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredClassesByGrade[grade].map(classItem => (
                      <Link
                        key={classItem.id}
                        href={`/lehrer-faecher-zuordnung/${classItem.id}`}
                        data-testid={`link-class-${classItem.id}`}
                      >
                        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center justify-between">
                              {classItem.name}
                              <Badge variant="outline">{grade}. Klasse</Badge>
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              {classItem.studentCount} Schüler
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="text-sm text-muted-foreground">
                              <div className="mb-2">
                                <span className="font-medium">Wochenstunden gesamt:</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  1. HJ: {classItem.targetHoursSemester1 || '-'}h
                                </div>
                                <div>
                                  2. HJ: {classItem.targetHoursSemester2 || '-'}h
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              
              {grades.length === 0 && (
                <div className="text-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground">
                    {searchTerm ? 'Keine Klassen gefunden' : 'Keine Klassen verfügbar'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {searchTerm 
                      ? 'Versuchen Sie einen anderen Suchbegriff' 
                      : 'Erstellen Sie zuerst Klassen in der Klassenverwaltung'
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}