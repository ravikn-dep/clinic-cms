import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTodayDateString } from "@/lib/appointmentDate";
import { useCredentialAuth } from "@/_core/hooks/useCredentialAuth";

interface BookAppointmentModalProps {
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookAppointmentModal({ patientId, open, onOpenChange }: BookAppointmentModalProps) {
  const { user } = useCredentialAuth();
  const utils = trpc.useUtils();
  const [appointmentDate, setAppointmentDate] = useState(getTodayDateString());
  const [appointmentTime, setAppointmentTime] = useState("10:00");
  const [consultantId, setConsultantId] = useState("");

  const getConsultants = trpc.consultants.getAll.useQuery(undefined, { enabled: open });
  const consultantNumericId = consultantId ? Number.parseInt(consultantId, 10) : 0;

  const slotsQuery = trpc.appointments.getAvailableSlots.useQuery(
    { consultantId: consultantNumericId, date: appointmentDate },
    { enabled: open && consultantNumericId > 0 && appointmentDate.length > 0 }
  );

  useEffect(() => {
    if (!open) return;
    if (user?.role === "consultant") {
      setConsultantId(String(user.id));
    } else if (getConsultants.data?.[0]?.id) {
      setConsultantId(String(getConsultants.data[0].id));
    }
  }, [open, user?.role, user?.id, getConsultants.data]);

  const bookAppointmentMutation = trpc.appointments.create.useMutation({
    onSuccess: () => {
      toast.success("Appointment booked successfully!");
      utils.appointments.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to book appointment");
    },
  });

  const handleBookAppointment = () => {
    if (!appointmentDate || !appointmentTime || !consultantId) {
      toast.error("Please fill in all fields");
      return;
    }

    bookAppointmentMutation.mutate({
      patientId,
      consultantId: Number.parseInt(consultantId, 10),
      appointmentDate,
      appointmentTime,
      notes: "Booked from patient registration",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book Appointment</DialogTitle>
          <DialogDescription>Schedule a consultation for the registered patient</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="date">Appointment Date *</Label>
            <Input
              id="date"
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="time">Appointment Time *</Label>
            {(slotsQuery.data?.length ?? 0) > 0 ? (
              <Select value={appointmentTime} onValueChange={setAppointmentTime}>
                <SelectTrigger id="time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {slotsQuery.data!.map((slot: string) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="time"
                type="time"
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
              />
            )}
          </div>
          {user?.role !== "consultant" && (
            <div>
              <Label htmlFor="consultant">Doctor *</Label>
              <Select value={consultantId} onValueChange={setConsultantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select doctor" />
                </SelectTrigger>
                <SelectContent>
                  {getConsultants.data?.map((consultant: { id: number; name?: string | null }) => (
                    <SelectItem key={consultant.id} value={String(consultant.id)}>
                      {consultant.name ?? `Doctor ${consultant.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={handleBookAppointment} className="w-full bg-blue-600 hover:bg-blue-700">
            Book Appointment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
