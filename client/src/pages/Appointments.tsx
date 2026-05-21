import { useState, useMemo } from "react";
import { format, parseISO, isSameDay, addDays, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, User, AlertCircle, CheckCircle, XCircle, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCredentialAuth as useAuth } from "@/_core/hooks/useCredentialAuth";
import { toast } from "sonner";

export default function Appointments() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingData, setBookingData] = useState({
    patientId: "",
    consultantId: 1,
    appointmentDate: format(new Date(), "yyyy-MM-dd"),
    appointmentTime: "10:00",
    notes: "",
  });

  // Fetch appointments
  const appointmentsQuery = trpc.appointments.list.useQuery({
    consultantId: user?.role === "consultant" ? user?.id : undefined,
    patientId: undefined,
    status: filterStatus !== "all" ? (filterStatus as any) : undefined,
  });

  // Fetch available slots
  const availableSlotsQuery = trpc.appointments.getAvailableSlots.useQuery({
    consultantId: bookingData.consultantId,
    date: bookingData.appointmentDate,
  });

  // Create appointment mutation
  const createMutation = trpc.appointments.create.useMutation({
    onSuccess: () => {
      toast.success("Appointment booked successfully");
      setIsBookingOpen(false);
      setBookingData({
        patientId: "",
        consultantId: 1,
        appointmentDate: format(new Date(), "yyyy-MM-dd"),
        appointmentTime: "10:00",
        notes: "",
      });
      appointmentsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to book appointment");
    },
  });

  // Cancel appointment mutation
  const cancelMutation = trpc.appointments.cancel.useMutation({
    onSuccess: () => {
      toast.success("Appointment cancelled");
      appointmentsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel appointment");
    },
  });

  // Mark no-show mutation
  const noShowMutation = trpc.appointments.markNoShow.useMutation({
    onSuccess: () => {
      toast.success("Appointment marked as no-show");
      appointmentsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to mark no-show");
    },
  });

  // Complete appointment mutation
  const completeMutation = trpc.appointments.complete.useMutation({
    onSuccess: () => {
      toast.success("Appointment completed");
      appointmentsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to complete appointment");
    },
  });

  // Filter appointments by date if in list view
  const filteredAppointments = useMemo(() => {
    if (!appointmentsQuery.data) return [];
    
    if (viewMode === "list") {
      return appointmentsQuery.data.filter((apt: any) => 
        isSameDay(parseISO(apt.appointmentDate), selectedDate)
      );
    }
    
    return appointmentsQuery.data;
  }, [appointmentsQuery.data, selectedDate, viewMode]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(selectedDate));
    const end = endOfWeek(endOfMonth(selectedDate));
    return eachDayOfInterval({ start, end });
  }, [selectedDate]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any }> = {
      "Scheduled": { color: "bg-blue-100 text-blue-800", icon: Clock },
      "Completed": { color: "bg-green-100 text-green-800", icon: CheckCircle },
      "Cancelled": { color: "bg-gray-100 text-gray-800", icon: XCircle },
      "No-show": { color: "bg-red-100 text-red-800", icon: AlertCircle },
      "Rescheduled": { color: "bg-yellow-100 text-yellow-800", icon: Clock },
    };

    const config = statusConfig[status] || statusConfig["Scheduled"];
    const Icon = config.icon;

    return (
      <Badge className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  const handleBookAppointment = async () => {
    if (!bookingData.patientId || !bookingData.appointmentDate || !bookingData.appointmentTime) {
      toast.error("Please fill in all required fields");
      return;
    }

    await createMutation.mutateAsync({
      patientId: bookingData.patientId,
      consultantId: bookingData.consultantId,
      appointmentDate: bookingData.appointmentDate,
      appointmentTime: bookingData.appointmentTime,
      notes: bookingData.notes,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-teal-950">Appointments</h1>
          <p className="text-teal-700 mt-1">Schedule, view, and manage patient appointments</p>
        </div>
        <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white shadow-md hover:shadow-lg transition-all rounded-lg">
              <Plus className="w-4 h-4 mr-2" />
              Book Appointment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Book New Appointment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="patientId">Patient ID</Label>
                <Input
                  id="patientId"
                  placeholder="Enter patient ID"
                  value={bookingData.patientId}
                  onChange={(e) => setBookingData({ ...bookingData, patientId: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="consultantId">Consultant</Label>
                <Select value={String(bookingData.consultantId)} onValueChange={(v) => setBookingData({ ...bookingData, consultantId: parseInt(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Consultant 1</SelectItem>
                    <SelectItem value="2">Consultant 2</SelectItem>
                    <SelectItem value="3">Consultant 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="appointmentDate">Date</Label>
                <Input
                  id="appointmentDate"
                  type="date"
                  value={bookingData.appointmentDate}
                  onChange={(e) => setBookingData({ ...bookingData, appointmentDate: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="appointmentTime">Time</Label>
                {availableSlotsQuery.isLoading ? (
                  <div className="text-sm text-slate-500">Loading available slots...</div>
                ) : availableSlotsQuery.data && availableSlotsQuery.data.length > 0 ? (
                  <Select value={bookingData.appointmentTime} onValueChange={(v) => setBookingData({ ...bookingData, appointmentTime: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSlotsQuery.data.map((slot: string) => (
                        <SelectItem key={slot} value={slot}>
                          {slot}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-red-600">No available slots for this date</div>
                )}
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any notes or special requests"
                  value={bookingData.notes}
                  onChange={(e) => setBookingData({ ...bookingData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleBookAppointment}
                disabled={createMutation.isPending}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                {createMutation.isPending ? "Booking..." : "Book Appointment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            onClick={() => setViewMode("list")}
            className={viewMode === "list" ? "bg-teal-600 hover:bg-teal-700" : ""}
          >
            List View
          </Button>
          <Button
            variant={viewMode === "calendar" ? "default" : "outline"}
            onClick={() => setViewMode("calendar")}
            className={viewMode === "calendar" ? "bg-teal-600 hover:bg-teal-700" : ""}
          >
            Calendar View
          </Button>
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="No-show">No-show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {viewMode === "list" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4" />
            <span>{format(selectedDate, "EEEE, MMMM d, yyyy")}</span>
          </div>

          {appointmentsQuery.isLoading ? (
            <div className="text-center py-8 text-slate-500">Loading appointments...</div>
          ) : filteredAppointments.length === 0 ? (
            <Card className="bg-slate-50">
              <CardContent className="pt-6 text-center text-slate-500">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No appointments scheduled for this date</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredAppointments.map((apt: any) => (
                <Card key={apt.appointmentId} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Clock className="w-4 h-4 text-teal-600" />
                          <span className="font-semibold text-slate-900">{apt.appointmentTime}</span>
                          <span className="text-slate-500">({apt.duration} min)</span>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-700">Patient: {apt.patientId}</span>
                        </div>
                        {apt.notes && (
                          <p className="text-sm text-slate-600 mt-2">{apt.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {getStatusBadge(apt.status)}
                        {apt.status === "Scheduled" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => completeMutation.mutate({ appointmentId: apt.appointmentId })}
                              disabled={completeMutation.isPending}
                            >
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
                              onClick={() => cancelMutation.mutate({ appointmentId: apt.appointmentId })}
                              disabled={cancelMutation.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{format(selectedDate, "MMMM yyyy")}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                >
                  ←
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date())}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                >
                  →
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-center font-semibold text-slate-600 py-2">
                  {day}
                </div>
              ))}
              {calendarDays.map((day) => {
                const dayAppointments = appointmentsQuery.data?.filter((apt: any) =>
                  isSameDay(parseISO(apt.appointmentDate), day)
                ) || [];
                const isCurrentMonth = day.getMonth() === selectedDate.getMonth();

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`p-2 rounded border cursor-pointer transition-colors ${
                      isSameDay(day, selectedDate)
                        ? "bg-teal-100 border-teal-600"
                        : isCurrentMonth
                        ? "bg-white border-slate-200 hover:bg-slate-50"
                        : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}
                  >
                    <div className="text-sm font-semibold">{day.getDate()}</div>
                    {dayAppointments.length > 0 && (
                      <div className="text-xs text-teal-600 mt-1">
                        {dayAppointments.length} apt{dayAppointments.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
