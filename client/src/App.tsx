import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import PatientRegistration from "./pages/PatientRegistration";
import PatientRecords from "./pages/PatientRecords";
import AmbientScribe from "./pages/AmbientScribe";
import PharmacyInventory from "./pages/PharmacyInventory";
import Billing from "./pages/Billing";
import AuditLogs from "./pages/AuditLogs";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/register-patient"} component={PatientRegistration} />
      <Route path={"/patients"} component={PatientRecords} />
      <Route path={"/scribe"} component={AmbientScribe} />
      <Route path={"/pharmacy"} component={PharmacyInventory} />
      <Route path={"/billing"} component={Billing} />
      <Route path={"/audit-logs"} component={AuditLogs} />
      <Route path={"/notifications"} component={Notifications} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <DashboardLayout>
            <Router />
          </DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
