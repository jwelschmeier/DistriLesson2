import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { BarChart3, Upload, Calculator, Users, Presentation, School, Clock, Sparkles, BookOpen, Calendar, Grid, RefreshCw, Menu, ChevronLeft, MessageSquare, Moon, Sun } from "lucide-react";
import logoImage from "@assets/logo-removebg-preview_1757711438324.png";
import logoImageDark from "@assets/Screenshot_2025-09-27_20.41.06-removebg-preview_1758998518377.png";

const navigationItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },

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
  { href: "/admin/users", label: "Benutzer verwalten", icon: Users },
  { href: "/admin/chatgpt", label: "ChatGPT Import", icon: MessageSquare },
  { href: "/csv-import", label: "CSV Import", icon: Upload },
];

export function Sidebar() {
  const [location] = useLocation();
  const { isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <aside className={cn(
      "bg-card border-r border-border flex flex-col transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className={cn(
        "border-b border-border flex items-center",
        isCollapsed ? "p-2 justify-center" : "p-6"
      )}>
        {!isCollapsed && (
          <div className="flex justify-center flex-1">
            <div className="w-full h-20 flex items-center justify-center overflow-hidden">
              <img 
                src={theme === "dark" ? logoImageDark : logoImage} 
                alt="DistriLesson PLANNER" 
                className="h-full object-contain" 
              />
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCollapsed}
          className={cn(
            "p-2 hover:bg-accent",
            isCollapsed ? "" : "ml-2"
          )}
          data-testid="button-toggle-sidebar"
          title={isCollapsed ? "Sidebar erweitern" : "Sidebar ausblenden"}
        >
          {isCollapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>
      {/* Navigation Menu */}
      <nav className={cn(
        "flex-1 space-y-2",
        isCollapsed ? "p-2" : "p-4"
      )}>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center rounded-md transition-colors group relative",
                isCollapsed 
                  ? "p-2 justify-center" 
                  : "space-x-3 px-3 py-2",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              data-testid={`nav-${item.href.replace('/', '') || 'dashboard'}`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
        
        {/* Admin-only navigation items */}
        {isAdmin && (
          <>
            {!isCollapsed && (
              <div className="pt-4 pb-2">
                <div className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Administration
                </div>
              </div>
            )}
            {adminNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-md transition-colors group relative",
                    isCollapsed 
                      ? "p-2 justify-center" 
                      : "space-x-3 px-3 py-2",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  data-testid={`nav-admin-${item.href.replace('/', '')}`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>
      
      {/* Theme Toggle */}
      <div className={cn(
        "border-t border-border",
        isCollapsed ? "p-2" : "p-4"
      )}>
        <Button
          variant="ghost"
          size={isCollapsed ? "sm" : "default"}
          onClick={toggleTheme}
          className={cn(
            "w-full flex items-center transition-colors",
            isCollapsed 
              ? "justify-center p-2" 
              : "justify-start space-x-3 px-3 py-2",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          data-testid="button-theme-toggle"
          title={isCollapsed ? (theme === "dark" ? "Zum Light Mode wechseln" : "Zum Dark Mode wechseln") : undefined}
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5 flex-shrink-0" />
          ) : (
            <Moon className="w-5 h-5 flex-shrink-0" />
          )}
          {!isCollapsed && (
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          )}
        </Button>
      </div>
      
      {/* User Info */}
      <div className={cn(
        "border-t border-border",
        isCollapsed ? "p-2" : "p-4"
      )}>
        <div className={cn(
          "flex items-center",
          isCollapsed ? "justify-center" : "space-x-3"
        )}>
          <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-secondary-foreground text-sm font-medium">DS</span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Dr. Schmidt</p>
              <p className="text-xs text-muted-foreground">Administrator</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
