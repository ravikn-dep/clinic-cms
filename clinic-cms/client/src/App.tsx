import { Route, Switch, Link } from "wouter";
import { useEffect } from "react";
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
import PasswordManagement from "./pages/PasswordManagement";
import DirectLogin from "./pages/DirectLogin";
import DailyExport from "./pages/DailyExport";
import AuditLogs from "./pages/AuditLogs";
import Notifications from "./pages/Notifications";
import FeatureAccessControl from "./pages/FeatureAccessControl";
import OPFormCustomization from "./pages/OPFormCustomization";
import Appointments from "./pages/Appointments";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import { useCredentialAuth } from "./_core/hooks/useCredentialAuth";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ServerConnectionHelp } from "./components/ServerConnectionHelp";
import { LOGIN_PATH } from "./const";
import { TRPCClientError } from "@trpc/client";

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useCredentialAuth();

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="max-w-lg shadow-sm">
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              This area is only available to clinic administrators.
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
      <Route path={"/"}>{() => <ProtectedRoute><Home /></ProtectedRoute>}</Route>
      <Route path={"/register-patient"}>
        {() => (
          <ProtectedRoute feature="patient_records">
            <PatientRegistration />
          </ProtectedRoute>
        )}
      </Route>
      <Route path={"/patients"}>{() => <ProtectedRoute feature="patient_records"><PatientRecords /></ProtectedRoute>}</Route>
      <Route path={"/scribe"}>{() => <ProtectedRoute feature="ambient_scribe"><AmbientScribe /></ProtectedRoute>}</Route>
      <Route path={"/pharmacy"}>{() => <ProtectedRoute feature="pharmacy"><PharmacyInventory /></ProtectedRoute>}</Route>
      <Route path={"/billing"}>{() => <ProtectedRoute feature="billing"><Billing /></ProtectedRoute>}</Route>
      <Route path={"/bill-templates"}>{() => <AdminOnly><BillTemplateManagement /></AdminOnly>}</Route>
      <Route path={"/purchase-orders"}>{() => <ProtectedRoute feature="purchase_orders"><PurchaseOrders /></ProtectedRoute>}</Route>
      <Route path={"/users"}>{() => <AdminOnly><UserManagement /></AdminOnly>}</Route>
      <Route path={"/audit-logs"}>{() => <ProtectedRoute adminOnly><AuditLogs /></ProtectedRoute>}</Route>
      <Route path={"/daily-export"}>{() => <ProtectedRoute adminOnly><DailyExport /></ProtectedRoute>}</Route>
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

function getAuthErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof TRPCClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error loading session.";
}

function AuthenticatedApp() {
  const { user, loading, error } = useCredentialAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-600" />
        <p className="text-sm text-muted-foreground">Loading clinic workspace...</p>
      </div>
    );
  }

  const authError = getAuthErrorMessage(error);
  if (authError) {
    const isApiHtml = authError.includes("HTML instead of JSON");
    const isNetwork =
      authError.includes("Failed to fetch") || authError.includes("Network");

    return (
      <ServerConnectionHelp
        message={
          isApiHtml || isNetwork
            ? authError
            : `${authError} Try signing in again after the server is running.`
        }
      />
    );
  }

  if (!user) {
    if (typeof window !== "undefined" && window.location.pathname !== LOGIN_PATH) {
      window.location.replace(LOGIN_PATH);
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <Router />
    </DashboardLayout>
  );
}

function LegacyLoginRedirect() {
  useEffect(() => {
    window.location.replace(LOGIN_PATH);
  }, []);
  return null;
}

function App() {
  const location = typeof window !== "undefined" ? window.location.pathname : "";

  if (location === LOGIN_PATH) {
    return (
      <ErrorBoundary>
        <ThemeProvider defaultTheme="light">
          <DirectLogin />
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  if (location === "/direct-login" || location === "/password-login" || location === "/qr-login") {
    return <LegacyLoginRedirect />;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthenticatedApp />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
