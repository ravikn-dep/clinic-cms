import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Users, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const pollingOptions = {
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  };

  const patientsQuery = trpc.patients.getAll.useQuery(undefined, pollingOptions);

  const inventoryQuery = trpc.inventory.getAll.useQuery(undefined, pollingOptions);

  const lowStockQuery = trpc.inventory.getLowStock.useQuery(undefined, pollingOptions);

  const patients = patientsQuery.data || [];
  const inventoryItems = inventoryQuery.data || [];
  const lowStockItems = lowStockQuery.data || [];
  const hasDashboardError = patientsQuery.isError || inventoryQuery.isError || lowStockQuery.isError;

  // Today's consultations (mock - would need consultation date filtering)
  const todayConsultations = patients.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Welcome, {user?.name || "Doctor"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Clinic Management System - {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Button onClick={() => navigate("/register-patient")} size="lg">
          + New Patient
        </Button>
      </div>

      {hasDashboardError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Dashboard data could not be refreshed. The latest cached values remain visible where available.
          </CardContent>
        </Card>
      )}

      {/* Key Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Patients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{patientsQuery.isLoading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : patients.length}</div>
              <Users className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today's Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{patientsQuery.isLoading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : todayConsultations.length}</div>
              <Clock className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Low Stock Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{lowStockQuery.isLoading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : lowStockItems.length}</div>
              <AlertTriangle className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inventory Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{inventoryQuery.isLoading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : inventoryItems.length}</div>
              <AlertCircle className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Patient Queue */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Patient Queue</CardTitle>
            <CardDescription>Patients scheduled for consultation today. This queue refreshes every 30 seconds while the dashboard is open.</CardDescription>
        </CardHeader>
        <CardContent>
          {patientsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing queue...
            </div>
          ) : todayConsultations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No patients scheduled for today</p>
            </div>
          ) : (
            <div className="space-y-4">
              {todayConsultations.map((patient, idx) => (
                <div key={patient.patientId} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-lg font-semibold">
                      #{idx + 1}
                    </Badge>
                    <div>
                      <p className="font-semibold">
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ID: {patient.patientId}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">⚠️ Low Stock Alerts</CardTitle>
            <CardDescription className="text-amber-800">
              {lowStockItems.length} item(s) below reorder level
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.itemId} className="flex items-center justify-between p-3 bg-white rounded border border-amber-200">
                  <div>
                    <p className="font-semibold text-amber-900">{item.itemName}</p>
                    <p className="text-sm text-amber-700">
                      Batch: {item.batchNumber} | Qty: {item.quantityAvailable} / {item.reorderLevel}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="text-amber-600 border-amber-300">
                    Reorder
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              variant="outline"
              className="h-24 flex-col"
              onClick={() => navigate("/register-patient")}
            >
              <Users className="h-6 w-6 mb-2" />
              Register Patient
            </Button>
            <Button
              variant="outline"
              className="h-24 flex-col"
              onClick={() => navigate("/scribe")}
            >
              <Clock className="h-6 w-6 mb-2" />
              Ambient Scribe
            </Button>
            <Button
              variant="outline"
              className="h-24 flex-col"
              onClick={() => navigate("/pharmacy")}
            >
              <AlertTriangle className="h-6 w-6 mb-2" />
              Pharmacy
            </Button>
            <Button
              variant="outline"
              className="h-24 flex-col"
              onClick={() => navigate("/billing")}
            >
              <AlertCircle className="h-6 w-6 mb-2" />
              Billing
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
