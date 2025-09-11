import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
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

function Router() {
  return (
    <Switch>
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
