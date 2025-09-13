import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { HelpBotButton } from "@/components/HelpBotButton";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import InvitationAccept from "@/pages/invitation-accept";
import AdminPanel from "@/pages/admin-panel";
import Dashboard from "@/pages/dashboard";
import CSVImport from "@/pages/csv-import";
import Planstellberechnung from "@/pages/planstellberechnung";
import Lehrerplanstellen from "@/pages/lehrerplanstellen";
import Lehrerverwaltung from "@/pages/lehrerverwaltung";
import Klassenverwaltung from "@/pages/klassenverwaltung";
import Faecherverwaltung from "@/pages/faecherverwaltung";
import StdvLe from "@/pages/stdv-le";
import StdvKlOptimum from "@/pages/stdv-kl-optimum";
import Stundenplaene from "@/pages/stundenplaene";
import MasterStundenplan from "@/pages/master-stundenplan";
import Schuljahreswechsel from "@/pages/schuljahreswechsel";
import PdfImport from "@/pages/pdf-import";
import ChatGPTImportPage from "@/pages/chatgpt-import";

function Router() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
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
          <Route path="/stdv-le" component={StdvLe} />
          <Route path="/stdv-kl-optimum" component={StdvKlOptimum} />
          <Route path="/stundenplaene" component={Stundenplaene} />
          <Route path="/master-stundenplan" component={MasterStundenplan} />
          <Route path="/schuljahreswechsel" component={Schuljahreswechsel} />
          <Route path="/pdf-import" component={PdfImport} />
          <Route path="/chatgpt-import" component={ChatGPTImportPage} />
          
          {/* Admin-only routes */}
          {isAdmin && (
            <Route path="/admin" component={AdminPanel} />
          )}
          
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

function App() {
  const { isAuthenticated } = useAuth();
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        {isAuthenticated && <HelpBotButton />}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
