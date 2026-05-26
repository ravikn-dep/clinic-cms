
import { useCredentialAuth } from "@/_core/hooks/useCredentialAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, Users, Pill, AlertCircle, CheckCircle } from "lucide-react";

export default function StaffDashboard() {
  const { user } = useCredentialAuth();
  const { hasAccess } = useFeatureAccess();

  if (!user || user.role !== "staff") {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-red-800">
            This dashboard is only available for staff members.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="text-slate-600">Staff operations dashboard</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">3</div>
            <p className="text-xs text-slate-500 mt-1">Awaiting completion</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Low Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">1</div>
            <p className="text-xs text-slate-500 mt-1">Requires attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending POs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">2</div>
            <p className="text-xs text-slate-500 mt-1">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Registered Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">4</div>
            <p className="text-xs text-slate-500 mt-1">New patients</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-teal-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasAccess('patient_records') && (
              <Button asChild className="w-full justify-start gap-2 bg-teal-600 hover:bg-teal-700">
                <Link href="/register-patient">
                  <Users className="h-4 w-4" />
                  Register New Patient
                </Link>
              </Button>
            )}
            {hasAccess('pharmacy') && (
              <Button asChild variant="outline" className="w-full justify-start gap-2">
                <Link href="/pharmacy">
                  <Pill className="h-4 w-4" />
                  Manage Inventory
                </Link>
              </Button>
            )}
            {hasAccess('purchase_orders') && (
              <Button asChild variant="outline" className="w-full justify-start gap-2">
                <Link href="/purchase-orders">
                  <Package className="h-4 w-4" />
                  View Purchase Orders
                </Link>
              </Button>
            )}
            {!hasAccess('patient_records') && !hasAccess('pharmacy') && !hasAccess('purchase_orders') && (
              <p className="text-sm text-gray-500 py-4">No features available. Contact administrator.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Alerts & Notifications
            </CardTitle>
            <CardDescription>Items requiring immediate attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">Paracetamol stock low</p>
              <p className="text-xs text-amber-700 mt-1">Current: 15 units (Reorder: 50)</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-medium text-blue-900">PO #2024-001 pending</p>
              <p className="text-xs text-blue-700 mt-1">Awaiting admin approval</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-sm font-medium text-green-900">4 patients registered today</p>
              <p className="text-xs text-green-700 mt-1">All records updated</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
