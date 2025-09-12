import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { BarChart3, Upload, Calculator, Users, Presentation, School, Clock, Sparkles, BookOpen, Calendar, Grid, Settings, RefreshCw } from "lucide-react";
import logoImage from "@assets/logo_1757710962783.png";

const navigationItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/csv-import", label: "CSV Import", icon: Upload },
  { href: "/planstellberechnung", label: "Planstellberechnung", icon: Calculator },
  { href: "/lehrerplanstellen", label: "Lehrerplanstellen", icon: Users },
  { href: "/lehrerverwaltung", label: "Lehrerverwaltung", icon: Presentation },
  { href: "/klassenverwaltung", label: "Klassenverwaltung", icon: School },
  { href: "/faecherverwaltung", label: "Fächerverwaltung", icon: BookOpen },
  { href: "/stundenplaene", label: "Stundenpläne", icon: Calendar },
  { href: "/master-stundenplan", label: "Master-Stundenplan", icon: Grid },
  { href: "/stdv-le", label: "StdV-Le", icon: Clock },
  { href: "/stdv-kl-optimum", label: "StdV-Kl-Optimum", icon: Sparkles },
  { href: "/schuljahreswechsel", label: "Schuljahreswechsel", icon: RefreshCw },
];

const adminNavigationItems = [
  { href: "/admin", label: "Admin-Panel", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();
  const { isAdmin } = useAuth();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex justify-center">
          <div className="w-full h-20 flex items-center justify-center overflow-hidden">
            <img src={logoImage} alt="DistriLesson PLANNER" className="h-full object-contain" />
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
        
        {/* Admin-only navigation items */}
        {isAdmin && (
          <>
            <div className="pt-4 pb-2">
              <div className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Administration
              </div>
            </div>
            {adminNavigationItems.map((item) => {
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
                  data-testid={`nav-admin-${item.href.replace('/', '')}`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
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
