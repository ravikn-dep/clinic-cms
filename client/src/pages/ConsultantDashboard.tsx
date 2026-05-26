import { trpc } from "@/lib/trpc";
import { useCredentialAuth } from "@/_core/hooks/useCredentialAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Calendar, FileText, TrendingUp, Users as UsersIcon } from "lucide-react";

export default function ConsultantDashboard() {
  const { user } = useCredentialAuth();
  const { hasAccess } = useFeatureAccess();

  if (!user || user.role !== "consultant") {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-red-800">
            This dashboard is only available for consultants.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="text-slate-600">Your consultation dashboard</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Today's Consultations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0</div>
            <p className="text-xs text-slate-500 mt-1">Scheduled for today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0</div>
            <p className="text-xs text-slate-500 mt-1">Total consultations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending Follow-ups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0</div>
            <p className="text-xs text-slate-500 mt-1">Awaiting action</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Patient Satisfaction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">95%</div>
            <p className="text-xs text-slate-500 mt-1">Average rating</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasAccess('ambient_scribe') && (
              <Button asChild className="w-full justify-start gap-2 bg-teal-600 hover:bg-teal-700">
                <Link href="/scribe">
                  <FileText className="h-4 w-4" />
                  Start Consultation Notes
                </Link>
              </Button>
            )}
            {hasAccess('patient_records') && (
              <Button asChild variant="outline" className="w-full justify-start gap-2">
                <Link href="/patients">
                  <UsersIcon className="h-4 w-4" />
                  View Patient Records
                </Link>
              </Button>
            )}
            {!hasAccess('ambient_scribe') && !hasAccess('patient_records') && (
              <p className="text-sm text-gray-500 py-4">No features available. Contact administrator.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Performance
            </CardTitle>
            <CardDescription>This month's metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Consultation Efficiency</span>
                <span className="font-medium">92%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: "92%" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Patient Follow-up Rate</span>
                <span className="font-medium">88%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-600 rounded-full" style={{ width: "88%" }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
