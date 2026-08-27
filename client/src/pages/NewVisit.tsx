import { useMemo, useState } from "react";
import { formatIndianMobileInput, normalizeIndianMobile } from "@shared/indianMobile";
import { useLocation } from "wouter";
import { CalendarPlus, CheckCircle2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useCredentialAuth as useAuth } from "@/_core/hooks/useCredentialAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const today = () => new Date().toISOString().slice(0, 10);

export default function NewVisit() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [consultantId, setConsultantId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [registeredPatient, setRegisteredPatient] = useState<{ patientId: string; firstName: string; lastName: string; age?: number | null; gender?: string | null; contactNumber: string } | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registration, setRegistration] = useState({ firstName: "", lastName: "", age: "", gender: "", contactNumber: "", email: "", address: "" });
  const [booking, setBooking] = useState({ appointmentDate: today(), appointmentTime: "10:00", appointmentSource: "MANUAL" as "MANUAL" | "WALK_IN" | "PHONE", notes: "" });
  const [confirmed, setConfirmed] = useState<{ appointmentId: string; patientId: string } | null>(null);

  const consultants = trpc.visits.activeConsultants.useQuery();
  const candidates = trpc.visits.patientCandidates.useQuery({ query }, { enabled: query.trim().length >= 2 });
  const effectiveConsultantId = user?.role === "consultant" ? String(user.id) : consultantId;
  const selectedPatient = useMemo(
    () => registeredPatient?.patientId === selectedPatientId ? registeredPatient : candidates.data?.find((candidate) => candidate.patientId === selectedPatientId),
    [candidates.data, registeredPatient, selectedPatientId],
  );

  const registerMutation = trpc.visits.registerPatient.useMutation({
    onSuccess: (result) => {
      if (!result.created) {
        toast.error("An existing patient has the same mobile number. Select the correct record instead.");
        setShowRegistration(false);
        return;
      }
      setSelectedPatientId(result.patient.patientId);
      setRegisteredPatient(result.patient);
      setShowRegistration(false);
      setQuery(`${result.patient.firstName} ${result.patient.lastName}`);
      toast.success("Patient registered and selected for this visit.");
    },
    onError: (error) => toast.error(error.message || "Patient registration failed"),
  });

  const createMutation = trpc.visits.createAppointment.useMutation({
    onSuccess: (result) => {
      setConfirmed({ appointmentId: result.appointmentId, patientId: result.patientId });
      utils.appointments.list.invalidate();
      toast.success("Appointment booked successfully.");
    },
    onError: (error) => toast.error(error.message || "Appointment booking failed"),
  });

  const registerPatient = async () => {
    if (!registration.firstName || !registration.lastName || !registration.contactNumber) {
      toast.error("First name, last name, and mobile number are required.");
      return;
    }
    const normalizedContactNumber = normalizeIndianMobile(registration.contactNumber);
    if (!normalizedContactNumber) {
      toast.error("Enter a valid 10-digit Indian mobile number, optionally with +91.");
      return;
    }
    await registerMutation.mutateAsync({
      firstName: registration.firstName, lastName: registration.lastName,
      age: registration.age ? Number(registration.age) : undefined,
      gender: registration.gender as "Male" | "Female" | "Other" | undefined,
      contactNumber: normalizedContactNumber, email: registration.email || undefined, address: registration.address || undefined,
    });
  };

  const bookVisit = async () => {
    if (!effectiveConsultantId || !selectedPatientId) {
      toast.error("Select an active consultant and explicitly select a patient before booking.");
      return;
    }
    await createMutation.mutateAsync({
      consultantId: Number(effectiveConsultantId), patientId: selectedPatientId,
      appointmentDate: booking.appointmentDate, appointmentTime: booking.appointmentTime,
      appointmentSource: booking.appointmentSource, notes: booking.notes || undefined,
    });
  };

  if (confirmed) {
    return <Card className="max-w-3xl border-emerald-200 bg-emerald-50/50"><CardHeader><div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-emerald-600" /><div><CardTitle>Visit booked</CardTitle><CardDescription>Appointment {confirmed.appointmentId} is linked to patient {confirmed.patientId}. Open appointments, check the patient in, then Generate OP & Print.</CardDescription></div></div></CardHeader><CardContent className="flex flex-wrap gap-3"><Button onClick={() => navigate("/appointments")}>Open appointments</Button><Button variant="outline" onClick={() => { setConfirmed(null); setSelectedPatientId(""); setRegisteredPatient(null); setQuery(""); }}>Create another visit</Button></CardContent></Card>;
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><p className="text-sm font-semibold text-teal-700">Front desk workflow</p><h1 className="text-3xl font-bold text-teal-950">New Visit / Appointment</h1><p className="mt-1 text-muted-foreground">Resolve consultant and patient first. Searching creates nothing; booking is always explicit.</p></div>
    <div className="grid gap-6 lg:grid-cols-3">
      <Card><CardHeader><CardTitle>1. Consultant</CardTitle><CardDescription>Only active consultants are booking choices.</CardDescription></CardHeader><CardContent><Label>Consultant</Label>{user?.role === "consultant" ? <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">Your active consultant account is assigned server-side.</div> : <Select value={consultantId} onValueChange={setConsultantId}><SelectTrigger className="mt-2"><SelectValue placeholder="Select consultant" /></SelectTrigger><SelectContent>{consultants.data?.map((consultant) => <SelectItem key={consultant.id} value={String(consultant.id)}>{consultant.name || consultant.userId}{consultant.qualifications ? ` — ${consultant.qualifications}` : ""}{consultant.specialization ? `, ${consultant.specialization}` : ""}</SelectItem>)}</SelectContent></Select>}</CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader><CardTitle>2. Find or register patient</CardTitle><CardDescription>Search by patient ID, mobile number, or name, then select a record explicitly.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedPatientId(""); setRegisteredPatient(null); }} placeholder="Patient ID, mobile, or name" /><Button variant="outline" disabled><Search className="mr-2 h-4 w-4" />Search</Button></div>{candidates.isFetching && <p className="text-sm text-muted-foreground">Searching existing patients…</p>}{candidates.data?.map((candidate) => <button type="button" key={candidate.patientId} onClick={() => { setSelectedPatientId(candidate.patientId); setRegisteredPatient(null); setShowRegistration(false); }} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedPatientId === candidate.patientId ? "border-teal-600 bg-teal-50" : "hover:bg-muted"}`}><div className="flex items-center justify-between"><span className="font-semibold">{candidate.firstName} {candidate.lastName}</span><Badge variant="outline">{candidate.matchStrength.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{candidate.patientId} · {candidate.age ?? "Age not recorded"} · {candidate.gender ?? "Gender not recorded"} · {candidate.contactNumber}</p></button>)}<div className="border-t pt-4"><Button variant="outline" onClick={() => setShowRegistration((value) => !value)}><UserPlus className="mr-2 h-4 w-4" />{showRegistration ? "Cancel registration" : "Register new patient"}</Button>{showRegistration && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input placeholder="First name" value={registration.firstName} onChange={(e) => setRegistration({ ...registration, firstName: e.target.value })} /><Input placeholder="Last name" value={registration.lastName} onChange={(e) => setRegistration({ ...registration, lastName: e.target.value })} /><Input placeholder="Age" type="number" value={registration.age} onChange={(e) => setRegistration({ ...registration, age: e.target.value })} /><Select value={registration.gender} onValueChange={(gender) => setRegistration({ ...registration, gender })}><SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger><SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><Input placeholder="Indian mobile number" inputMode="tel" autoComplete="tel" value={registration.contactNumber} onChange={(e) => setRegistration({ ...registration, contactNumber: formatIndianMobileInput(e.target.value) })} /><Input placeholder="Email (optional)" value={registration.email} onChange={(e) => setRegistration({ ...registration, email: e.target.value })} /><Textarea className="sm:col-span-2" placeholder="Address (optional)" value={registration.address} onChange={(e) => setRegistration({ ...registration, address: e.target.value })} /><Button className="sm:col-span-2" onClick={registerPatient} disabled={registerMutation.isPending}>{registerMutation.isPending ? "Registering…" : "Register and select patient"}</Button></div>}</div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>3. Appointment</CardTitle><CardDescription>Patient matching and page opening do not book anything.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div><Label>Date</Label><Input className="mt-2" type="date" value={booking.appointmentDate} onChange={(e) => setBooking({ ...booking, appointmentDate: e.target.value })} /></div><div><Label>Time</Label><Input className="mt-2" type="time" value={booking.appointmentTime} onChange={(e) => setBooking({ ...booking, appointmentTime: e.target.value })} /></div><div><Label>Source</Label><Select value={booking.appointmentSource} onValueChange={(appointmentSource) => setBooking({ ...booking, appointmentSource: appointmentSource as typeof booking.appointmentSource })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MANUAL">Manual</SelectItem><SelectItem value="WALK_IN">Walk-in</SelectItem><SelectItem value="PHONE">Phone</SelectItem></SelectContent></Select></div><div><Label>Notes</Label><Textarea className="mt-2" value={booking.notes} onChange={(e) => setBooking({ ...booking, notes: e.target.value })} placeholder="Reason or front-desk notes (optional)" /></div><div className="md:col-span-2 flex items-center justify-between rounded-md bg-muted p-3 text-sm"><span>{selectedPatient ? `Selected patient: ${selectedPatient.firstName} ${selectedPatient.lastName} (${selectedPatient.patientId})` : "No patient selected"}</span><Button onClick={bookVisit} disabled={createMutation.isPending}><CalendarPlus className="mr-2 h-4 w-4" />{createMutation.isPending ? "Booking…" : "Book appointment"}</Button></div></CardContent></Card>
  </div>;
}
