import { FormEvent, useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { getTodayDateString, parseAppointmentDate } from "@/lib/appointmentDate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  Clock,
  Edit2,
  Loader2,
  Plus,
  RefreshCcw,
  User,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCredentialAuth } from "@/_core/hooks/useCredentialAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { getRoleLabel } from "@/lib/featureAccess";
import { toast } from "sonner";

type ViewTab = "today" | "browse" | "calendar";

type AppointmentRow = {
  appointmentId: string;
  patientId: string;
  patientName?: string;
  consultantId: number;
  consultantName?: string;
  appointmentDate: string;
  appointmentTime: string;
  duration: number | null;
  status: string | null;
  notes: string | null;
  canManage: boolean;
};

type AppointmentForm = {
  patientId: string;
  consultantId: number;
  appointmentDate: string;
  appointmentTime: string;
  notes: string;
};

const emptyForm = (): AppointmentForm => ({
  patientId: "",
  consultantId: 0,
  appointmentDate: getTodayDateString(),
  appointmentTime: "10:00",
  notes: "",
});

export default function Appointments() {
  const { user } = useCredentialAuth();
  const { hasAccess } = useFeatureAccess();
  const utils = trpc.useUtils();

  const isDoctor = user?.role === "consultant";
  const isStaffOrAdmin = user?.role === "admin" || user?.role === "staff";
  const canManage = hasAccess("appointments");

  const [viewTab, setViewTab] = useState<ViewTab>("today");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterConsultantId, setFilterConsultantId] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AppointmentRow | null>(null);
  const [form, setForm] = useState<AppointmentForm>(emptyForm());

  const consultantsQuery = trpc.consultants.getAll.useQuery(undefined, {
    enabled: canManage,
  });
  const patientsQuery = trpc.patients.getAll.useQuery(
    { includeArchived: false },
    { enabled: canManage && formOpen }
  );

  const listInput = useMemo(() => {
    const base: {
      consultantId?: number;
      status?: "Scheduled" | "Completed" | "Cancelled" | "No-show" | "Rescheduled";
      todayOnly?: boolean;
    } = {};

    if (isDoctor) {
      base.consultantId = user?.id;
    } else if (filterConsultantId !== "all") {
      base.consultantId = Number.parseInt(filterConsultantId, 10);
    }

    if (filterStatus !== "all") {
      base.status = filterStatus as typeof base.status;
    }

    if (viewTab === "today") {
      base.todayOnly = true;
    }

    return base;
  }, [isDoctor, user?.id, filterConsultantId, filterStatus, viewTab]);

  const appointmentsQuery = trpc.appointments.list.useQuery(listInput, {
    enabled: canManage,
    refetchInterval: 30_000,
  });

  const availableSlotsQuery = trpc.appointments.getAvailableSlots.useQuery(
    {
      consultantId: form.consultantId || (consultantsQuery.data?.[0]?.id ?? 0),
      date: form.appointmentDate,
    },
    {
      enabled:
        formOpen &&
        form.consultantId > 0 &&
        form.appointmentDate.length > 0 &&
        canManage,
    }
  );

  const createMutation = trpc.appointments.create.useMutation({
    onSuccess: () => {
      toast.success("Appointment created.");
      closeForm();
      utils.appointments.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to create appointment."),
  });

  const updateMutation = trpc.appointments.update.useMutation({
    onSuccess: () => {
      toast.success("Appointment updated.");
      closeForm();
      utils.appointments.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to update appointment."),
  });

  const cancelMutation = trpc.appointments.cancel.useMutation({
    onSuccess: () => {
      toast.success("Appointment cancelled.");
      setCancelTarget(null);
      utils.appointments.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to cancel appointment."),
  });

  const completeMutation = trpc.appointments.complete.useMutation({
    onSuccess: () => {
      toast.success("Appointment marked completed.");
      utils.appointments.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to complete appointment."),
  });

  const noShowMutation = trpc.appointments.markNoShow.useMutation({
    onSuccess: () => {
      toast.success("Marked as no-show.");
      utils.appointments.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to mark no-show."),
  });

  const appointments = appointmentsQuery.data?.appointments ?? [];
  const viewScope = appointmentsQuery.data?.viewScope ?? "own";

  const filteredAppointments = useMemo(() => {
    if (viewTab === "browse") {
      return appointments.filter((apt) =>
        isSameDay(parseAppointmentDate(apt.appointmentDate), selectedDate)
      );
    }
    return appointments;
  }, [appointments, selectedDate, viewTab]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(selectedDate));
    const end = endOfWeek(endOfMonth(selectedDate));
    return eachDayOfInterval({ start, end });
  }, [selectedDate]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingAppointment(null);
    setForm(emptyForm());
  };

  const openCreateForm = () => {
    const firstConsultant = consultantsQuery.data?.[0]?.id ?? 0;
    setEditingAppointment(null);
    setForm({
      ...emptyForm(),
      consultantId: isDoctor ? (user?.id ?? 0) : firstConsultant,
    });
    setFormOpen(true);
  };

  const openEditForm = (apt: AppointmentRow) => {
    setEditingAppointment(apt);
    setForm({
      patientId: apt.patientId,
      consultantId: apt.consultantId,
      appointmentDate: apt.appointmentDate,
      appointmentTime: apt.appointmentTime,
      notes: apt.notes ?? "",
    });
    setFormOpen(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.patientId.trim()) {
      toast.error("Select a patient.");
      return;
    }
    if (!form.consultantId) {
      toast.error("Select a doctor.");
      return;
    }

    if (editingAppointment) {
      updateMutation.mutate({
        appointmentId: editingAppointment.appointmentId,
        patientId: form.patientId,
        consultantId: isDoctor ? undefined : form.consultantId,
        appointmentDate: form.appointmentDate,
        appointmentTime: form.appointmentTime,
        notes: form.notes.trim() || undefined,
      });
    } else {
      createMutation.mutate({
        patientId: form.patientId,
        consultantId: form.consultantId,
        appointmentDate: form.appointmentDate,
        appointmentTime: form.appointmentTime,
        notes: form.notes.trim() || undefined,
      });
    }
  };

  const getStatusBadge = (status: string | null) => {
    const label = status ?? "Scheduled";
    const config: Record<string, string> = {
      Scheduled: "bg-blue-50 text-blue-700 border-blue-200",
      Completed: "bg-green-50 text-green-700 border-green-200",
      Cancelled: "bg-slate-100 text-slate-600 border-slate-200",
      "No-show": "bg-red-50 text-red-700 border-red-200",
      Rescheduled: "bg-amber-50 text-amber-700 border-amber-200",
    };
    return (
      <Badge variant="outline" className={config[label] ?? config.Scheduled}>
        {label}
      </Badge>
    );
  };

  const isEditableStatus = (status: string | null) =>
    status === "Scheduled" || status === "Rescheduled" || status === null;

  if (!canManage) {
    return (
      <div className="friendly-page">
        <Card className="max-w-lg border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">Appointments access required</CardTitle>
            <CardDescription className="text-amber-800">
              Your role does not have permission to view appointments. Ask an administrator to
              enable the Appointments feature for your account.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="friendly-page space-y-8">
      <div className="friendly-hero flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-teal-950">Appointments</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {viewScope === "all"
              ? "View and manage all clinic appointments (staff/admin view)."
              : `View and manage your schedule (${getRoleLabel(user?.role)} view).`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={openCreateForm}
            className="friendly-action bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            New appointment
          </Button>
          <Button
            variant="outline"
            onClick={() => appointmentsQuery.refetch()}
            disabled={appointmentsQuery.isFetching}
            className="friendly-action"
          >
            <RefreshCcw
              className={`mr-2 h-4 w-4 ${appointmentsQuery.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(["today", "browse", "calendar"] as ViewTab[]).map((tab) => (
            <Button
              key={tab}
              variant={viewTab === tab ? "default" : "outline"}
              onClick={() => setViewTab(tab)}
              className={viewTab === tab ? "bg-teal-600 hover:bg-teal-700" : ""}
            >
              {tab === "today" ? "Today" : tab === "browse" ? "By date" : "Calendar"}
            </Button>
          ))}
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Rescheduled">Rescheduled</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="No-show">No-show</SelectItem>
          </SelectContent>
        </Select>

        {isStaffOrAdmin && (
          <Select value={filterConsultantId} onValueChange={setFilterConsultantId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Doctor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All doctors</SelectItem>
              {(consultantsQuery.data ?? []).map((c: { id: number; name?: string | null }) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name ?? `Doctor ${c.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {viewTab === "calendar" ? (
        <Card className="friendly-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{format(selectedDate, "MMMM yyyy")}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, -30))}>
                  ←
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, 30))}>
                  →
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="py-2 text-center text-sm font-semibold text-muted-foreground">
                  {day}
                </div>
              ))}
              {calendarDays.map((day) => {
                const dayCount =
                  appointments.filter((apt) =>
                    isSameDay(parseAppointmentDate(apt.appointmentDate), day)
                  ).length ?? 0;
                const inMonth = day.getMonth() === selectedDate.getMonth();
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day);
                      setViewTab("browse");
                    }}
                    className={`rounded border p-2 text-left transition-colors ${
                      isSameDay(day, new Date())
                        ? "border-teal-500 bg-teal-50"
                        : inMonth
                          ? "border-slate-200 bg-white hover:bg-slate-50"
                          : "border-slate-100 bg-slate-50 text-slate-400"
                    }`}
                  >
                    <div className="text-sm font-semibold">{day.getDate()}</div>
                    {dayCount > 0 && (
                      <div className="mt-1 text-xs text-teal-700">
                        {dayCount} apt{dayCount > 1 ? "s" : ""}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {viewTab === "today"
                ? format(new Date(), "EEEE, MMMM d, yyyy")
                : format(selectedDate, "EEEE, MMMM d, yyyy")}
            </span>
            {viewTab === "browse" && (
              <Input
                type="date"
                className="ml-2 w-40 h-8"
                value={format(selectedDate, "yyyy-MM-dd")}
                onChange={(e) => setSelectedDate(parseAppointmentDate(e.target.value))}
              />
            )}
          </div>

          {appointmentsQuery.isError ? (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6 text-center text-red-700">
                <AlertCircle className="mx-auto mb-2 h-8 w-8" />
                <p>{appointmentsQuery.error.message}</p>
                <Button variant="outline" className="mt-4" onClick={() => appointmentsQuery.refetch()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : appointmentsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading appointments...
            </div>
          ) : filteredAppointments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="font-medium">No appointments found</p>
                <p className="text-sm mt-1">
                  {viewTab === "today"
                    ? "Nothing scheduled for today yet."
                    : "No appointments on this date."}
                </p>
                <Button className="mt-4 bg-teal-600 hover:bg-teal-700" onClick={openCreateForm}>
                  Book appointment
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredAppointments.map((apt) => (
                <Card key={apt.appointmentId} className="friendly-card">
                  <CardContent className="pt-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Clock className="h-4 w-4 text-teal-600" />
                          <span className="font-semibold text-lg">{apt.appointmentTime}</span>
                          <span className="text-sm text-muted-foreground">
                            {apt.duration ?? 30} min
                          </span>
                          {getStatusBadge(apt.status)}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {apt.patientName ?? apt.patientId}
                            <span className="text-muted-foreground"> ({apt.patientId})</span>
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Doctor: {apt.consultantName ?? apt.consultantId}
                        </p>
                        {apt.notes && (
                          <p className="text-sm text-slate-600 border-l-2 border-teal-200 pl-3">
                            {apt.notes}
                          </p>
                        )}
                      </div>

                      {apt.canManage && isEditableStatus(apt.status) && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditForm(apt)}>
                            <Edit2 className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => completeMutation.mutate({ appointmentId: apt.appointmentId })}
                            disabled={completeMutation.isPending}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => noShowMutation.mutate({ appointmentId: apt.appointmentId })}
                            disabled={noShowMutation.isPending}
                          >
                            No-show
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setCancelTarget(apt)}
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAppointment ? "Edit appointment" : "New appointment"}
            </DialogTitle>
            <DialogDescription>
              {isDoctor
                ? "Appointments are booked on your schedule."
                : "Select patient, doctor, date, and time."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Patient *</Label>
              <Select
                value={form.patientId}
                onValueChange={(v) => setForm({ ...form, patientId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {(patientsQuery.data ?? []).map(
                    (p: { patientId: string; firstName: string; lastName: string }) => (
                      <SelectItem key={p.patientId} value={p.patientId}>
                        {p.firstName} {p.lastName} ({p.patientId})
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {!isDoctor && (
              <div className="space-y-2">
                <Label>Doctor *</Label>
                <Select
                  value={String(form.consultantId)}
                  onValueChange={(v) =>
                    setForm({ ...form, consultantId: Number.parseInt(v, 10) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(consultantsQuery.data ?? []).map(
                      (c: { id: number; name?: string | null }) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name ?? `Doctor ${c.id}`}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="aptDate">Date *</Label>
              <Input
                id="aptDate"
                type="date"
                value={form.appointmentDate}
                onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Time *</Label>
              {availableSlotsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading slots...</p>
              ) : (availableSlotsQuery.data?.length ?? 0) > 0 ? (
                <Select
                  value={form.appointmentTime}
                  onValueChange={(v) => setForm({ ...form, appointmentTime: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSlotsQuery.data!.map((slot: string) => (
                      <SelectItem key={slot} value={slot}>
                        {slot}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="time"
                  value={form.appointmentTime}
                  onChange={(e) => setForm({ ...form, appointmentTime: e.target.value })}
                  required
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingAppointment ? "Save changes" : "Create appointment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel the appointment for {cancelTarget?.patientName ?? cancelTarget?.patientId} at{" "}
              {cancelTarget?.appointmentTime}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep appointment</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (cancelTarget) {
                  cancelMutation.mutate({ appointmentId: cancelTarget.appointmentId });
                }
              }}
              disabled={cancelMutation.isPending}
            >
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
