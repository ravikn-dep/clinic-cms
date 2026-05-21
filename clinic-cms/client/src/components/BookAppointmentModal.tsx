import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface BookAppointmentModalProps {
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookAppointmentModal({ patientId, open, onOpenChange }: BookAppointmentModalProps) {
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("10:00");
  const [consultantId, setConsultantId] = useState("");

  const bookAppointmentMutation = trpc.appointments.create.useMutation();
  const getConsultants = trpc.consultants.getAll.useQuery();

  const handleBookAppointment = async () => {
    if (!appointmentDate || !appointmentTime || !consultantId) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      await bookAppointmentMutation.mutateAsync({
        patientId: patientId,
        consultantId: parseInt(consultantId),
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime,
        notes: "Booked from patient registration",
      });
      toast.success("Appointment booked successfully!");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to book appointment");
    }
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
            <Input
              id="time"
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="consultant">Consultant *</Label>
            <Select value={consultantId} onValueChange={setConsultantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select consultant" />
              </SelectTrigger>
              <SelectContent>
                {getConsultants.data?.map((consultant: any) => (
                  <SelectItem key={consultant.id} value={String(consultant.id)}>
                    {consultant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleBookAppointment} className="w-full bg-blue-600 hover:bg-blue-700">
            Book Appointment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
