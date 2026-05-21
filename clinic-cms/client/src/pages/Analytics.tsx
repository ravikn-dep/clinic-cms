import { useState, useMemo } from "react";
import { format, subDays, parseISO } from "date-fns";
import { parseAppointmentDate } from "@/lib/appointmentDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, Calendar, DollarSign } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Analytics() {
  const [timeRange, setTimeRange] = useState<"week" | "month" | "year">("month");

  const appointmentsQuery = trpc.appointments.list.useQuery({});
  const billsQuery = trpc.bills.getAll.useQuery();
  const patientsQuery = trpc.patients.getAll.useQuery();

  // Calculate analytics data
  const analyticsData = useMemo(() => {
    const appointments = appointmentsQuery.data?.appointments ?? [];
    const bills = billsQuery.data || [];
    const patients = patientsQuery.data || [];

    // Calculate date range
    const now = new Date();
    let daysBack = 30;
    if (timeRange === "week") daysBack = 7;
    if (timeRange === "year") daysBack = 365;
    const startDate = subDays(now, daysBack);

    // Filter data by date range
    const filteredAppointments = appointments.filter((apt: { appointmentDate: string }) => {
      const aptDate = parseAppointmentDate(apt.appointmentDate);
      return aptDate >= startDate;
    });

    const filteredBills = bills.filter((bill: { createdAt?: string | Date }) => {
      if (!bill.createdAt) return false;
      const billDate = typeof bill.createdAt === "string" ? parseISO(bill.createdAt) : bill.createdAt;
      return billDate >= startDate;
    });

    // Calculate metrics
    const totalAppointments = filteredAppointments.length;
    const completedAppointments = filteredAppointments.filter((apt: any) => apt.status === "Completed").length;
    const noShowAppointments = filteredAppointments.filter((apt: any) => apt.status === "No-show").length;
    const totalRevenue = filteredBills.reduce((sum: number, bill: any) => sum + (bill.totalAmount || 0), 0);
    const averageRevenue = filteredBills.length > 0 ? totalRevenue / filteredBills.length : 0;

    // Appointment status breakdown
    const statusBreakdown = [
      { name: "Completed", value: completedAppointments, color: "#10b981" },
      { name: "Scheduled", value: filteredAppointments.filter((apt: any) => apt.status === "Scheduled").length, color: "#3b82f6" },
      { name: "No-show", value: noShowAppointments, color: "#ef4444" },
      { name: "Cancelled", value: filteredAppointments.filter((apt: any) => apt.status === "Cancelled").length, color: "#6b7280" },
    ];

    // Daily appointment trend
    const dailyTrend: Record<string, number> = {};
    filteredAppointments.forEach((apt: { appointmentDate: string }) => {
      const date = format(parseAppointmentDate(apt.appointmentDate), "MMM dd");
      dailyTrend[date] = (dailyTrend[date] || 0) + 1;
    });

    const trendData = Object.entries(dailyTrend).map(([date, count]) => ({
      date,
      appointments: count,
    }));

    // Daily revenue trend
    const dailyRevenue: Record<string, number> = {};
    filteredBills.forEach((bill: any) => {
      const date = format(parseISO(bill.createdAt), "MMM dd");
      dailyRevenue[date] = (dailyRevenue[date] || 0) + (bill.totalAmount || 0);
    });

    const revenueData = Object.entries(dailyRevenue).map(([date, revenue]) => ({
      date,
      revenue: Math.round(revenue * 100) / 100,
    }));

    // Consultant performance
    const consultantStats: Record<string, { appointments: number; completed: number }> = {};
    filteredAppointments.forEach((apt: any) => {
      const consultantId = apt.consultantId;
      if (!consultantStats[consultantId]) {
        consultantStats[consultantId] = { appointments: 0, completed: 0 };
      }
      consultantStats[consultantId].appointments += 1;
      if (apt.status === "Completed") {
        consultantStats[consultantId].completed += 1;
      }
    });

    const consultantData = Object.entries(consultantStats).map(([consultantId, stats]) => ({
      consultant: `Consultant ${consultantId}`,
      appointments: stats.appointments,
      completed: stats.completed,
      completionRate: Math.round((stats.completed / stats.appointments) * 100),
    }));

    return {
      metrics: {
        totalAppointments,
        completedAppointments,
        noShowAppointments,
        totalRevenue,
        averageRevenue,
        completionRate: totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0,
        totalPatients: patients.length,
      },
      statusBreakdown,
      trendData,
      revenueData,
      consultantData,
    };
  }, [appointmentsQuery.data, billsQuery.data, patientsQuery.data, timeRange]);

  const isLoading =
    appointmentsQuery.isLoading || billsQuery.isLoading || patientsQuery.isLoading;

  const hasError =
    appointmentsQuery.isError || billsQuery.isError || patientsQuery.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600"></div>
          <p className="mt-4 text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Unable to load analytics</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Check that the database is running and you are signed in as an administrator.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Analytics Dashboard</h1>
          <p className="text-slate-600 mt-1">Clinic performance metrics and insights</p>
        </div>
        <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
            <SelectItem value="year">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
            <Calendar className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.metrics.totalAppointments}</div>
            <p className="text-xs text-slate-600 mt-1">
              {analyticsData.metrics.completionRate}% completion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.metrics.completedAppointments}</div>
            <p className="text-xs text-slate-600 mt-1">
              {analyticsData.metrics.noShowAppointments} no-shows
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{analyticsData.metrics.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-slate-600 mt-1">
              Avg: ₹{analyticsData.metrics.averageRevenue.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.metrics.totalPatients}</div>
            <p className="text-xs text-slate-600 mt-1">Registered patients</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appointment Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Appointment Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData.statusBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {analyticsData.statusBreakdown.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Appointment Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Appointment Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData.trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="appointments" stroke="#0d9488" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData.revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: any) => `₹${value.toLocaleString()}`} />
                <Bar dataKey="revenue" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Consultant Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Consultant Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData.consultantData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="consultant" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="appointments" fill="#3b82f6" />
                <Bar dataKey="completed" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
