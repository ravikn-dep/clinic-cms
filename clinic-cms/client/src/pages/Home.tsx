import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useCredentialAuth } from "@/_core/hooks/useCredentialAuth";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardPenLine,
  Clock,
  HeartPulse,
  Loader2,
  PackageCheck,
  Receipt,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useMemo } from "react";

export default function Home() {
  const { user } = useCredentialAuth();
  const { hasAccess, canAccessRoute } = useFeatureAccess();
  const [, navigate] = useLocation();

  const pollingOptions = {
    enabled: !!user,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  };

  const patientsQuery = trpc.patients.getAll.useQuery(undefined, {
    ...pollingOptions,
    enabled: pollingOptions.enabled && hasAccess("patient_records"),
  });
  const inventoryQuery = trpc.inventory.getAll.useQuery(undefined, {
    ...pollingOptions,
    enabled: pollingOptions.enabled && hasAccess("pharmacy"),
  });
  const lowStockQuery = trpc.inventory.getLowStock.useQuery(undefined, {
    ...pollingOptions,
    enabled: pollingOptions.enabled && hasAccess("pharmacy"),
  });
  const purchaseOrdersQuery = trpc.purchaseOrders.getAll.useQuery(undefined, {
    ...pollingOptions,
    enabled: pollingOptions.enabled && hasAccess("purchase_orders"),
  });
  const appointmentsQuery = trpc.appointments.list.useQuery(
    {
      consultantId:
        user?.role === "consultant" && user.id != null ? Number(user.id) : undefined,
      todayOnly: true,
    },
    {
      ...pollingOptions,
      enabled: pollingOptions.enabled && hasAccess("appointments"),
    }
  );
  const billingSummaryQuery = trpc.bills.getSummary.useQuery(undefined, {
    ...pollingOptions,
    enabled: pollingOptions.enabled && hasAccess("billing"),
  });

  const patients = patientsQuery.data || [];
  const inventoryItems = inventoryQuery.data || [];
  const lowStockItems = lowStockQuery.data || [];
  const purchaseOrders = purchaseOrdersQuery.data || [];
  const pendingPOs = purchaseOrders.filter((po) => po.paymentStatus === "Pending").length;

  const todayAppointments = useMemo(() => {
    return appointmentsQuery.data?.appointments ?? [];
  }, [appointmentsQuery.data]);

  const billingSummary = billingSummaryQuery.data;

  const dashboardErrors = useMemo(() => {
    const entries: Array<{ label: string; message: string }> = [];
    const pushError = (
      label: string,
      query: { isError: boolean; error: { message?: string } | null }
    ) => {
      if (query.isError) {
        entries.push({
          label,
          message: query.error?.message?.trim() || "Request failed",
        });
      }
    };

    if (hasAccess("patient_records")) pushError("Patient records", patientsQuery);
    if (hasAccess("pharmacy")) {
      pushError("Pharmacy inventory", inventoryQuery);
      pushError("Low stock alerts", lowStockQuery);
    }
    if (hasAccess("purchase_orders")) pushError("Purchase orders", purchaseOrdersQuery);
    if (hasAccess("appointments")) pushError("Appointments", appointmentsQuery);
    if (hasAccess("billing")) pushError("Billing summary", billingSummaryQuery);

    return entries;
  }, [
    hasAccess,
    patientsQuery,
    inventoryQuery,
    lowStockQuery,
    purchaseOrdersQuery,
    appointmentsQuery,
    billingSummaryQuery,
  ]);

  const hasDashboardError = dashboardErrors.length > 0;
  const databaseHint = dashboardErrors.some((e) =>
    /database not available|DATABASE_URL|ECONNREFUSED|ER_|Unknown column/i.test(e.message)
  );

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const stats = [
    hasAccess("patient_records") && {
      label: "Patients cared for",
      value: patientsQuery.isLoading ? null : patients.length,
      icon: Users,
      helper: "Registered in this workspace",
      tone: "from-teal-50 to-cyan-50 text-teal-700 border-teal-100",
    },
    hasAccess("appointments") && {
      label: "Today's appointments",
      value: appointmentsQuery.isLoading ? null : todayAppointments.length,
      icon: Clock,
      helper: "Scheduled for today",
      tone: "from-emerald-50 to-teal-50 text-emerald-700 border-emerald-100",
    },
    hasAccess("pharmacy") && {
      label: "Low-stock attention",
      value: lowStockQuery.isLoading ? null : lowStockItems.length,
      icon: AlertTriangle,
      helper: "Items below reorder level",
      tone: "from-amber-50 to-orange-50 text-amber-700 border-amber-100",
    },
    hasAccess("pharmacy") && {
      label: "Inventory items",
      value: inventoryQuery.isLoading ? null : inventoryItems.length,
      icon: PackageCheck,
      helper: "Active pharmacy catalogue",
      tone: "from-violet-50 to-fuchsia-50 text-violet-700 border-violet-100",
    },
    hasAccess("purchase_orders") && {
      label: "Pending POs",
      value: purchaseOrdersQuery.isLoading ? null : pendingPOs,
      icon: ShoppingCart,
      helper: "Awaiting vendor payment",
      tone: "from-rose-50 to-pink-50 text-rose-700 border-rose-100",
    },
    hasAccess("billing") && {
      label: "Pending billing",
      value: billingSummaryQuery.isLoading
        ? null
        : billingSummary?.pendingCount ?? 0,
      icon: Receipt,
      helper: billingSummaryQuery.isLoading
        ? "Loading..."
        : `₹${(billingSummary?.pendingAmount ?? 0).toLocaleString("en-IN")} outstanding`,
      tone: "from-sky-50 to-blue-50 text-sky-700 border-sky-100",
    },
    hasAccess("billing") && {
      label: "Collected today",
      value: billingSummaryQuery.isLoading
        ? null
        : `₹${(billingSummary?.todayRevenue ?? 0).toLocaleString("en-IN")}`,
      icon: Receipt,
      helper: `${billingSummary?.invoiceCount ?? 0} total invoices`,
      tone: "from-indigo-50 to-violet-50 text-indigo-700 border-indigo-100",
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: number | string | null;
    icon: typeof Users;
    helper: string;
    tone: string;
  }>;

  const quickActions = [
    canAccessRoute("/register-patient") && {
      title: "Register Patient",
      description: "Start a warm, guided intake",
      icon: Users,
      path: "/register-patient",
    },
    canAccessRoute("/scribe") && {
      title: "Ambient Scribe",
      description: "Create a consultation note",
      icon: ClipboardPenLine,
      path: "/scribe",
    },
    canAccessRoute("/pharmacy") && {
      title: "Pharmacy",
      description: "Review stock and alerts",
      icon: PackageCheck,
      path: "/pharmacy",
    },
    canAccessRoute("/billing") && {
      title: "Billing",
      description: "Prepare invoices clearly",
      icon: Receipt,
      path: "/billing",
    },
    canAccessRoute("/purchase-orders") && {
      title: "Purchase Orders",
      description: "Manage vendor orders",
      icon: ShoppingCart,
      path: "/purchase-orders",
    },
    canAccessRoute("/appointments") && {
      title: "Appointments",
      description: "View today's schedule",
      icon: CalendarDays,
      path: "/appointments",
    },
  ].filter(Boolean) as Array<{
    title: string;
    description: string;
    icon: typeof Users;
    path: string;
  }>;

  return (
    <div className="friendly-page space-y-7 lg:space-y-8">
      <section className="friendly-hero">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="friendly-chip inline-flex items-center gap-2">
                <HeartPulse className="h-3.5 w-3.5" />
                Clinic flow ready
              </span>
              <span className="friendly-chip inline-flex items-center gap-2 border-amber-200 bg-amber-50 text-amber-800">
                <CalendarDays className="h-3.5 w-3.5" />
                {todayLabel}
              </span>
            </div>
            <div className="space-y-3">
              <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-teal-950 sm:text-4xl lg:text-5xl">
                Good day, {user?.name || "Doctor"}. Let's make today's care feel calm and organized.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Your clinic workspace brings registration, notes, pharmacy, billing, and audit activity together in a softer, friendlier dashboard.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            {canAccessRoute("/register-patient") && (
              <Button
                onClick={() => navigate("/register-patient")}
                size="lg"
                className="friendly-action bg-teal-600 text-white hover:bg-teal-700"
              >
                + New Patient
              </Button>
            )}
            {canAccessRoute("/scribe") && (
              <Button
                onClick={() => navigate("/scribe")}
                size="lg"
                variant="outline"
                className="friendly-action border-teal-200 bg-white/80 text-teal-800 hover:bg-teal-50"
              >
                Start Scribe
              </Button>
            )}
          </div>
        </div>
      </section>

      {hasDashboardError && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardContent className="space-y-3 py-4 text-sm text-destructive">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium">
                  Some dashboard data could not be loaded. Check your connection or permissions.
                </p>
                <ul className="list-inside list-disc space-y-1 text-destructive/90">
                  {dashboardErrors.map((item) => (
                    <li key={item.label}>
                      <span className="font-medium">{item.label}:</span> {item.message}
                    </li>
                  ))}
                </ul>
                {databaseHint && (
                  <p className="text-destructive/90">
                    Database issue detected. Confirm MySQL is running, set{" "}
                    <code className="rounded bg-destructive/10 px-1">DATABASE_URL</code> in{" "}
                    <code className="rounded bg-destructive/10 px-1">clinic-cms/.env</code>, then run{" "}
                    <code className="rounded bg-destructive/10 px-1">pnpm db:ensure-schema</code> or{" "}
                    <code className="rounded bg-destructive/10 px-1">pnpm db:push</code>. Check{" "}
                    <a
                      href="/api/health"
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      /api/health
                    </a>{" "}
                    for database status.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {stats.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className={`friendly-card overflow-hidden bg-gradient-to-br ${stat.tone}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium opacity-85">{stat.label}</p>
                    <div className="text-4xl font-bold text-foreground">
                      {stat.value === null ? (
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      ) : (
                        stat.value
                      )}
                    </div>
                    <p className="text-xs font-medium opacity-75">{stat.helper}</p>
                  </div>
                  <div className="rounded-2xl bg-white/75 p-3 shadow-sm">
                    <stat.icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        {hasAccess("appointments") && (
          <Card className="friendly-card">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-teal-950">
                    <Sparkles className="h-5 w-5 text-amber-500" /> Today's Appointments
                  </CardTitle>
                  <CardDescription>Scheduled for today. Opens the full appointments view for details.</CardDescription>
                </div>
                <Badge variant="outline" className="rounded-full border-teal-200 bg-teal-50 text-teal-800">
                  Live
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {appointmentsQuery.isLoading ? (
                <div className="flex items-center justify-center rounded-3xl border border-dashed border-teal-200 bg-teal-50/50 py-12 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading appointments...
                </div>
              ) : todayAppointments.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-teal-200 bg-teal-50/50 px-6 py-12 text-center">
                  <p className="font-semibold text-teal-950">No appointments scheduled for today.</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => navigate("/appointments")}
                  >
                    Open appointments
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {todayAppointments.slice(0, 5).map((apt, idx: number) => (
                    <div
                      key={apt.appointmentId}
                      className="flex flex-col gap-3 rounded-3xl border border-white/80 bg-white/78 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className="rounded-2xl border-teal-200 bg-teal-50 px-3 py-2 text-base font-semibold text-teal-800">
                          #{idx + 1}
                        </Badge>
                        <div>
                          <p className="font-semibold text-teal-950">
                            {apt.appointmentTime} — {apt.patientName ?? apt.patientId}
                          </p>
                          <p className="text-sm text-muted-foreground">{apt.status ?? "Scheduled"}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="friendly-action border-teal-200 bg-white/90 text-teal-800 hover:bg-teal-50"
                        onClick={() => navigate("/appointments")}
                      >
                        View <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {quickActions.length > 0 && (
          <Card className="friendly-card">
            <CardHeader>
              <CardTitle className="text-teal-950">Quick actions</CardTitle>
              <CardDescription>Jump into tasks available for your role.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {quickActions.map((action) => (
                  <button
                    key={action.path}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="group flex items-center justify-between rounded-3xl border border-white/80 bg-white/78 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:bg-teal-50/80 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-3">
                      <span className="rounded-2xl bg-teal-100 p-3 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                        <action.icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold text-teal-950">{action.title}</span>
                        <span className="text-sm text-muted-foreground">{action.description}</span>
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-teal-700" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {hasAccess("pharmacy") && lowStockItems.length > 0 && (
        <Card className="friendly-card border-amber-200 bg-amber-50/80">
          <CardHeader>
            <CardTitle className="text-amber-900">Low Stock Alerts</CardTitle>
            <CardDescription className="text-amber-800">
              {lowStockItems.length} item(s) below reorder level
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div
                  key={item.itemId}
                  className="flex flex-col gap-3 rounded-3xl border border-amber-200 bg-white/85 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-amber-900">{item.itemName}</p>
                    <p className="text-sm text-amber-700">
                      Batch: {item.batchNumber} | Qty: {item.quantityAvailable} / {item.reorderLevel}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="friendly-action border-amber-300 bg-white text-amber-700"
                    onClick={() => navigate("/pharmacy")}
                  >
                    View pharmacy
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
