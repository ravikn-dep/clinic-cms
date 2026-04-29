import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
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
  Sparkles,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";

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
  const todayConsultations = patients.slice(0, 5);
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const stats = [
    {
      label: "Patients cared for",
      value: patientsQuery.isLoading ? null : patients.length,
      icon: Users,
      helper: "Registered in this workspace",
      tone: "from-teal-50 to-cyan-50 text-teal-700 border-teal-100",
    },
    {
      label: "Today’s queue",
      value: patientsQuery.isLoading ? null : todayConsultations.length,
      icon: Clock,
      helper: "Refreshing every 30 seconds",
      tone: "from-emerald-50 to-teal-50 text-emerald-700 border-emerald-100",
    },
    {
      label: "Low-stock attention",
      value: lowStockQuery.isLoading ? null : lowStockItems.length,
      icon: AlertTriangle,
      helper: "Items below reorder level",
      tone: "from-amber-50 to-orange-50 text-amber-700 border-amber-100",
    },
    {
      label: "Inventory items",
      value: inventoryQuery.isLoading ? null : inventoryItems.length,
      icon: PackageCheck,
      helper: "Active pharmacy catalogue",
      tone: "from-violet-50 to-fuchsia-50 text-violet-700 border-violet-100",
    },
  ];

  const quickActions = [
    {
      title: "Register Patient",
      description: "Start a warm, guided intake",
      icon: Users,
      path: "/register-patient",
    },
    {
      title: "Ambient Scribe",
      description: "Create a consultation note",
      icon: ClipboardPenLine,
      path: "/scribe",
    },
    {
      title: "Pharmacy",
      description: "Review stock and alerts",
      icon: PackageCheck,
      path: "/pharmacy",
    },
    {
      title: "Billing",
      description: "Prepare invoices clearly",
      icon: Receipt,
      path: "/billing",
    },
  ];

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
                Good day, {user?.name || "Doctor"}. Let’s make today’s care feel calm and organized.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Your clinic workspace brings registration, notes, pharmacy, billing, and audit activity together in a softer, friendlier dashboard.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <Button onClick={() => navigate("/register-patient")} size="lg" className="friendly-action bg-teal-600 text-white hover:bg-teal-700">
              + New Patient
            </Button>
            <Button onClick={() => navigate("/scribe")} size="lg" variant="outline" className="friendly-action border-teal-200 bg-white/80 text-teal-800 hover:bg-teal-50">
              Start Scribe
            </Button>
          </div>
        </div>
      </section>

      {hasDashboardError && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardContent className="flex items-center gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Dashboard data could not be refreshed. The latest cached values remain visible where available.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className={`friendly-card overflow-hidden bg-gradient-to-br ${stat.tone}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <p className="text-sm font-medium opacity-85">{stat.label}</p>
                  <div className="text-4xl font-bold text-foreground">
                    {stat.value === null ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : stat.value}
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

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="friendly-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-teal-950">
                  <Sparkles className="h-5 w-5 text-amber-500" /> Today’s Patient Queue
                </CardTitle>
                <CardDescription>Patients scheduled for consultation today. The queue refreshes automatically while the dashboard is open.</CardDescription>
              </div>
              <Badge variant="outline" className="rounded-full border-teal-200 bg-teal-50 text-teal-800">
                Live queue
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {patientsQuery.isLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-dashed border-teal-200 bg-teal-50/50 py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing queue...
              </div>
            ) : todayConsultations.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-teal-200 bg-teal-50/50 px-6 py-12 text-center">
                <p className="font-semibold text-teal-950">No patients are waiting right now.</p>
                <p className="mt-2 text-sm text-muted-foreground">When you register a patient, they will appear here for a quick next-step review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayConsultations.map((patient, idx) => (
                  <div key={patient.patientId} className="flex flex-col gap-3 rounded-3xl border border-white/80 bg-white/78 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="rounded-2xl border-teal-200 bg-teal-50 px-3 py-2 text-base font-semibold text-teal-800">
                        #{idx + 1}
                      </Badge>
                      <div>
                        <p className="font-semibold text-teal-950">
                          {patient.firstName} {patient.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">ID: {patient.patientId}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="friendly-action border-teal-200 bg-white/90 text-teal-800 hover:bg-teal-50" onClick={() => navigate("/patients")}>
                      View Details <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="friendly-card">
          <CardHeader>
            <CardTitle className="text-teal-950">Friendly quick actions</CardTitle>
            <CardDescription>Jump into the most common clinic tasks with clear next steps.</CardDescription>
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
      </div>

      {lowStockItems.length > 0 && (
        <Card className="friendly-card border-amber-200 bg-amber-50/80">
          <CardHeader>
            <CardTitle className="text-amber-900">Low Stock Alerts</CardTitle>
            <CardDescription className="text-amber-800">{lowStockItems.length} item(s) below reorder level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.itemId} className="flex flex-col gap-3 rounded-3xl border border-amber-200 bg-white/85 p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-amber-900">{item.itemName}</p>
                    <p className="text-sm text-amber-700">Batch: {item.batchNumber} | Qty: {item.quantityAvailable} / {item.reorderLevel}</p>
                  </div>
                  <Button variant="outline" size="sm" className="friendly-action border-amber-300 bg-white text-amber-700">
                    Reorder
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
