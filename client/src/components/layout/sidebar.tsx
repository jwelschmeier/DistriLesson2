import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { GraduationCap, BarChart3, Upload, Calculator, Users, Presentation, School, Clock, Sparkles, BookOpen } from "lucide-react";

const navigationItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/csv-import", label: "CSV Import", icon: Upload },
  { href: "/planstellberechnung", label: "Planstellberechnung", icon: Calculator },
  { href: "/lehrerplanstellen", label: "Lehrerplanstellen", icon: Users },
  { href: "/lehrerverwaltung", label: "Lehrerverwaltung", icon: Presentation },
  { href: "/klassenverwaltung", label: "Klassenverwaltung", icon: School },
  { href: "/faecherverwaltung", label: "Fächerverwaltung", icon: BookOpen },
  { href: "/stdv-le", label: "StdV-Le", icon: Clock },
  { href: "/stdv-kl-optimum", label: "StdV-Kl-Optimum", icon: Sparkles },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <GraduationCap className="text-primary-foreground text-lg" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">SCHILD NRW</h1>
            <p className="text-sm text-muted-foreground">Unterrichtsverteilung</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              data-testid={`nav-${item.href.replace('/', '') || 'dashboard'}`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
            <span className="text-secondary-foreground text-sm font-medium">DS</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Dr. Schmidt</p>
            <p className="text-xs text-muted-foreground">Administrator</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
