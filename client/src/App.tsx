import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Link } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import PatientRegistration from "./pages/PatientRegistration";
import PatientRecords from "./pages/PatientRecords";
import AmbientScribe from "./pages/AmbientScribe";
import PharmacyInventory from "./pages/PharmacyInventory";
import Billing from "./pages/Billing";
import BillTemplateManagement from "./pages/BillTemplateManagement";
import PurchaseOrders from "./pages/PurchaseOrders";
import UserManagement from "./pages/UserManagement";
import QRLogin from "./pages/QRLogin";
import Login from "./pages/Login";
import PasswordLogin from "./pages/PasswordLogin";
import PasswordManagement from "./pages/PasswordManagement";
import DirectLogin from "./pages/DirectLogin";
import DailyExport from "./pages/DailyExport";
import ConsultantDashboard from "./pages/ConsultantDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import AuditLogs from "./pages/AuditLogs";
import Notifications from "./pages/Notifications";
import FeatureAccessControl from "./pages/FeatureAccessControl";
import OPFormCustomization from "./pages/OPFormCustomization";
import Appointments from "./pages/Appointments";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import { useAuth } from "./_core/hooks/useAuth";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { ProtectedRoute } from "./components/ProtectedRoute";

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="max-w-lg shadow-sm">
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              Audit logs contain PHI access metadata and are available only to clinic administrators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/">Return to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/direct-login"} component={DirectLogin} />
      <Route path={"/"} component={() => {
        const { user } = useAuth();
        if (!user) return <DirectLogin />;
        if (user?.role === "consultant") return <ConsultantDashboard />;
        if (user?.role === "staff") return <StaffDashboard />;
        return <Home />;
      }} />
      <Route path={"/register-patient"} component={PatientRegistration} />
      <Route path={"/patients"}>{() => <ProtectedRoute feature="patient_records"><PatientRecords /></ProtectedRoute>}</Route>
      <Route path={"/scribe"}>{() => <ProtectedRoute feature="ambient_scribe"><AmbientScribe /></ProtectedRoute>}</Route>
      <Route path={"/pharmacy"}>{() => <ProtectedRoute feature="pharmacy"><PharmacyInventory /></ProtectedRoute>}</Route>
      <Route path={"/billing"}>{() => <ProtectedRoute feature="billing"><Billing /></ProtectedRoute>}</Route>
      <Route path={"/bill-templates"}>{() => <AdminOnly><BillTemplateManagement /></AdminOnly>}</Route>
      <Route path={"/purchase-orders"}>{() => <ProtectedRoute feature="purchase_orders"><PurchaseOrders /></ProtectedRoute>}</Route>
      <Route path={"/users"}>{() => <AdminOnly><UserManagement /></AdminOnly>}</Route>
      <Route path={"/audit-logs"}>{() => <ProtectedRoute feature="audit_trail" adminOnly><AuditLogs /></ProtectedRoute>}</Route>
      <Route path={"/daily-export"}>{() => <ProtectedRoute feature="daily_export" adminOnly><DailyExport /></ProtectedRoute>}</Route>
      <Route path={"/feature-access"}>{() => <AdminOnly><FeatureAccessControl /></AdminOnly>}</Route>
      <Route path={"/op-form-customization"}>{() => <AdminOnly><OPFormCustomization /></AdminOnly>}</Route>
      <Route path={"/notifications"}>{() => <ProtectedRoute feature="notifications"><Notifications /></ProtectedRoute>}</Route>
      <Route path={"/appointments"}>{() => <ProtectedRoute feature="appointments"><Appointments /></ProtectedRoute>}</Route>
      <Route path={"/analytics"}>{() => <AdminOnly><Analytics /></AdminOnly>}</Route>
      <Route path={"/password-management"}>{() => <ProtectedRoute><PasswordManagement /></ProtectedRoute>}</Route>
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
          <Switch>
            <Route path={"/login"} component={Login} />
            <Route path={"/password-login"} component={PasswordLogin} />
            <Route path={"/qr-login"} component={QRLogin} />
            <Route component={() => (
              <DashboardLayout>
                <Router />
              </DashboardLayout>
            )} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
