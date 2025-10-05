import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { HelpBotButton } from "@/components/HelpBotButton";

// Lazy load all page components
const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/pages/landing"));
const InvitationAccept = lazy(() => import("@/pages/invitation-accept"));
const AdminUsers = lazy(() => import("@/pages/admin-users"));
const AdminChatGPT = lazy(() => import("@/pages/admin-chatgpt"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const CSVImport = lazy(() => import("@/pages/csv-import"));
const Planstellberechnung = lazy(() => import("@/pages/planstellberechnung"));
const Lehrerplanstellen = lazy(() => import("@/pages/lehrerplanstellen"));
const Lehrerverwaltung = lazy(() => import("@/pages/lehrerverwaltung"));
const Klassenverwaltung = lazy(() => import("@/pages/klassenverwaltung"));
const Faecherverwaltung = lazy(() => import("@/pages/faecherverwaltung"));
const StdvKlOptimum = lazy(() => import("@/pages/stdv-kl-optimum"));
const Stundenplaene = lazy(() => import("@/pages/stundenplaene"));
const MasterStundenplan = lazy(() => import("@/pages/master-stundenplan"));
const Schuljahreswechsel = lazy(() => import("@/pages/schuljahreswechsel"));
const PdfImport = lazy(() => import("@/pages/pdf-import"));
const ChatGPTImportPage = lazy(() => import("@/pages/chatgpt-import"));
const KlassenAuswahl = lazy(() => import("@/pages/klassen-auswahl"));
const KlassenMatrix = lazy(() => import("@/pages/klassen-matrix"));
const DiffKurseMatrix = lazy(() => import("@/pages/diff-kurse-matrix"));

// Loading fallback component
const LoadingFallback = () => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

function Router() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return <LoadingFallback />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
      {/* Public routes - available for unauthenticated users */}
      <Route path="/invitation/:token" component={InvitationAccept} />
      
      {/* Authentication routing */}
      {!isAuthenticated ? (
        // Show landing page for unauthenticated users
        <Route path="/*?" component={Landing} />
      ) : (
        // Protected routes - only available for authenticated users
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/csv-import" component={CSVImport} />
          <Route path="/planstellberechnung" component={Planstellberechnung} />
          <Route path="/lehrerplanstellen" component={Lehrerplanstellen} />
          <Route path="/lehrerverwaltung" component={Lehrerverwaltung} />
          <Route path="/klassenverwaltung" component={Klassenverwaltung} />
          <Route path="/faecherverwaltung" component={Faecherverwaltung} />
          <Route path="/stdv-kl-optimum" component={StdvKlOptimum} />
          <Route path="/stundenplaene" component={Stundenplaene} />
          <Route path="/master-stundenplan" component={MasterStundenplan} />
          <Route path="/schuljahreswechsel" component={Schuljahreswechsel} />
          <Route path="/lehrer-faecher-zuordnung/select" component={KlassenAuswahl} />
          <Route path="/lehrer-faecher-zuordnung/diff-kurse" component={DiffKurseMatrix} />
          <Route path="/lehrer-faecher-zuordnung/:classId" component={KlassenMatrix} />
          <Route path="/pdf-import" component={PdfImport} />
          <Route path="/chatgpt-import" component={ChatGPTImportPage} />
          
          {/* Admin-only routes */}
          {isAdmin && (
            <>
              <Route path="/admin/users" component={AdminUsers} />
              <Route path="/admin/chatgpt" component={AdminChatGPT} />
            </>
          )}
          
          <Route component={NotFound} />
        </>
      )}
      </Switch>
    </Suspense>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  
  return (
    <>
      <Router />
      {isAuthenticated && <HelpBotButton />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
