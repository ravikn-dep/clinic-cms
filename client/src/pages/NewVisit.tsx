import { useMemo, useState } from "react";
import { formatIndianMobileInput, normalizeIndianMobile } from "@shared/indianMobile";
import { CalendarPlus, CheckCircle2, Printer, Search, UserPlus } from "lucide-react";
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
import { generateConsultationOPHTML } from "@/lib/opFormGenerator";
import { closePrintWindow, openPrintWindow, renderAndPrintWindow } from "@/lib/printWindow";

const today = () => new Date().toISOString().slice(0, 10);

type Patient = { patientId: string; firstName: string; lastName: string; age?: number | null; gender?: string | null; contactNumber: string };
type Encounter = { encounterId: string; patientId: string; consultantId: number; status: string; source: string };

export default function NewVisit() {
  const { user } = useAuth();
  const [consultantId, setConsultantId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [registration, setRegistration] = useState({ firstName: "", lastName: "", age: "", gender: "", contactNumber: "", email: "", address: "" });
  const [booking, setBooking] = useState({ appointmentDate: today(), appointmentTime: "10:00", appointmentSource: "MANUAL" as "MANUAL" | "WALK_IN" | "PHONE", notes: "" });
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [consultationId, setConsultationId] = useState("");

  const utils = trpc.useUtils();
  const consultants = trpc.visits.activeConsultants.useQuery();
  const candidates = trpc.visits.patientCandidates.useQuery({ query }, { enabled: query.trim().length >= 2 });
  const effectiveConsultantId = user?.role === "consultant" ? String(user.id) : consultantId;
  const selectedPatient = useMemo<Patient | undefined>(() => registeredPatient?.patientId === selectedPatientId ? registeredPatient : candidates.data?.find((candidate) => candidate.patientId === selectedPatientId), [candidates.data, registeredPatient, selectedPatientId]);

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
      toast.success(`Patient confirmed: ${result.patient.patientId}`);
    },
    onError: (error) => toast.error(error.message || "Patient registration failed"),
  });

  const encounterMutation = trpc.visits.createEncounter.useMutation({
    onSuccess: (result) => {
      setEncounter(result.encounter as Encounter);
      toast.success(result.created ? "Patient visit created." : "Today's open patient visit resumed.");
    },
    onError: (error) => toast.error(error.message || "Unable to create patient visit"),
  });
  const appointmentMutation = trpc.visits.createAppointment.useMutation({
    onSuccess: (result) => {
      toast.success(`Appointment ${result.appointmentId} created. Check in when the patient arrives.`);
      setShowAppointment(false);
      utils.appointments.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Appointment booking failed"),
  });
  const checkInMutation = trpc.visits.checkInEncounter.useMutation({
    onSuccess: (result) => { setEncounter((current) => current ? { ...current, status: result.status } : current); toast.success("Patient checked in."); },
    onError: (error) => toast.error(error.message || "Check-in failed"),
  });
  const generateOpMutation = trpc.visits.generateEncounterOp.useMutation({
    onSuccess: (result) => { setConsultationId(result.consultation.consultationId); setEncounter((current) => current ? { ...current, status: "OP Generated" } : current); toast.success("Paper OP generated. Print it for the consultant."); },
    onError: (error) => toast.error(error.message || "OP generation failed"),
  });
  const brandedPrint = trpc.consultations.getBrandedPrintData.useMutation({
    onError: (error) => toast.error(error.message || "Unable to prepare OP print preview"),
  });
  const printConsultationOP = async () => {
    if (!consultationId) return;
    const printWindow = openPrintWindow();
    if (!printWindow) {
      toast.error("Allow pop-ups to print the OP.");
      return;
    }
    try {
      const printData = await brandedPrint.mutateAsync({ consultationId });
      renderAndPrintWindow(printWindow, generateConsultationOPHTML(printData));
      toast.success("OP print preview opened.");
    } catch (error) {
      closePrintWindow(printWindow);
      toast.error(error instanceof Error ? error.message : "Unable to prepare OP print preview");
    }
  };

  const registerPatient = async () => {
    if (!registration.firstName || !registration.lastName || !registration.contactNumber) { toast.error("First name, last name, and mobile number are required."); return; }
    const normalizedContactNumber = normalizeIndianMobile(registration.contactNumber);
    if (!normalizedContactNumber) { toast.error("Enter a valid 10-digit Indian mobile number, optionally with +91."); return; }
    await registerMutation.mutateAsync({ firstName: registration.firstName, lastName: registration.lastName, age: registration.age ? Number(registration.age) : undefined, gender: registration.gender as "Male" | "Female" | "Other" | undefined, contactNumber: normalizedContactNumber, email: registration.email || undefined, address: registration.address || undefined });
  };
  const startVisit = async () => {
    if (!effectiveConsultantId || !selectedPatientId) { toast.error("Select an active consultant and a confirmed patient."); return; }
    await encounterMutation.mutateAsync({ patientId: selectedPatientId, consultantId: Number(effectiveConsultantId), source: booking.appointmentSource === "PHONE" ? "PHONE" : booking.appointmentSource === "MANUAL" ? "MANUAL" : "WALK_IN" });
  };
  const createAppointment = async () => {
    if (!effectiveConsultantId || !selectedPatientId) { toast.error("Select an active consultant and a confirmed patient before booking."); return; }
    await appointmentMutation.mutateAsync({ consultantId: Number(effectiveConsultantId), patientId: selectedPatientId, appointmentDate: booking.appointmentDate, appointmentTime: booking.appointmentTime, appointmentSource: booking.appointmentSource, notes: booking.notes || undefined });
  };
  const reset = () => { setEncounter(null); setConsultationId(""); setSelectedPatientId(""); setRegisteredPatient(null); setQuery(""); setShowAppointment(false); };

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><p className="text-sm font-semibold text-teal-700">Front desk workflow</p><h1 className="text-3xl font-bold text-teal-950">Patient Visit</h1><p className="mt-1 text-muted-foreground">Find or register a patient, create today’s encounter, check in, and generate the paper OP from one workspace. Appointment scheduling remains optional.</p></div>
    <div className="grid gap-6 lg:grid-cols-3">
      <Card><CardHeader><CardTitle>1. Consultant</CardTitle><CardDescription>Only active consultants are available.</CardDescription></CardHeader><CardContent><Label>Consultant</Label>{user?.role === "consultant" ? <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">Your active consultant account is assigned server-side.</div> : <Select value={consultantId} onValueChange={setConsultantId}><SelectTrigger className="mt-2"><SelectValue placeholder="Select consultant" /></SelectTrigger><SelectContent>{consultants.data?.map((consultant) => <SelectItem key={consultant.id} value={String(consultant.id)}>{consultant.name || consultant.userId}{consultant.qualifications ? ` — ${consultant.qualifications}` : ""}</SelectItem>)}</SelectContent></Select>}</CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader><CardTitle>2. Find or register patient</CardTitle><CardDescription>Search by Patient ID, mobile number, or name, then select the patient explicitly.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedPatientId(""); setRegisteredPatient(null); setEncounter(null); }} placeholder="Patient ID, mobile, or name" /><Button variant="outline" disabled><Search className="mr-2 h-4 w-4" />Search</Button></div>{candidates.isFetching && <p className="text-sm text-muted-foreground">Searching existing patients…</p>}{candidates.data?.map((candidate) => <button type="button" key={candidate.patientId} onClick={() => { setSelectedPatientId(candidate.patientId); setRegisteredPatient(null); }} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedPatientId === candidate.patientId ? "border-teal-600 bg-teal-50" : "hover:bg-muted"}`}><div className="flex items-center justify-between"><span className="font-semibold">{candidate.firstName} {candidate.lastName}</span><Badge variant="outline">{candidate.matchStrength.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{candidate.patientId} · {candidate.age ?? "Age not recorded"} · {candidate.gender ?? "Gender not recorded"} · {candidate.contactNumber}</p></button>)}<div className="border-t pt-4"><Button variant="outline" onClick={() => setShowRegistration((value) => !value)}><UserPlus className="mr-2 h-4 w-4" />{showRegistration ? "Cancel registration" : "Register new patient"}</Button>{showRegistration && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input placeholder="First name" value={registration.firstName} onChange={(e) => setRegistration({ ...registration, firstName: e.target.value })} /><Input placeholder="Last name" value={registration.lastName} onChange={(e) => setRegistration({ ...registration, lastName: e.target.value })} /><Input placeholder="Age" type="number" value={registration.age} onChange={(e) => setRegistration({ ...registration, age: e.target.value })} /><Select value={registration.gender} onValueChange={(gender) => setRegistration({ ...registration, gender })}><SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger><SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><Input placeholder="Indian mobile number" inputMode="tel" autoComplete="tel" value={registration.contactNumber} onChange={(e) => setRegistration({ ...registration, contactNumber: formatIndianMobileInput(e.target.value) })} /><Input placeholder="Email (optional)" value={registration.email} onChange={(e) => setRegistration({ ...registration, email: e.target.value })} /><Textarea className="sm:col-span-2" placeholder="Address (optional)" value={registration.address} onChange={(e) => setRegistration({ ...registration, address: e.target.value })} /><Button className="sm:col-span-2" onClick={registerPatient} disabled={registerMutation.isPending}>{registerMutation.isPending ? "Registering…" : "Register and select patient"}</Button></div>}</div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>3. Confirm patient and create encounter</CardTitle><CardDescription>The encounter is the actual clinic attendance. It does not require an appointment.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-md bg-muted p-3 text-sm">{selectedPatient ? <><strong>{selectedPatient.firstName} {selectedPatient.lastName}</strong> · {selectedPatient.patientId} · {selectedPatient.contactNumber}</> : "No patient confirmed yet."}</div><div className="flex flex-wrap gap-3"><Button onClick={startVisit} disabled={!selectedPatientId || encounterMutation.isPending}>{encounterMutation.isPending ? "Creating visit…" : "Create / Resume Patient Visit"}</Button><Button variant="outline" onClick={() => setShowAppointment((value) => !value)} disabled={!selectedPatientId}><CalendarPlus className="mr-2 h-4 w-4" />{showAppointment ? "Hide appointment" : "Schedule optional appointment"}</Button></div>{showAppointment && <div className="grid gap-4 rounded-md border p-4 md:grid-cols-2"><div><Label>Date</Label><Input className="mt-2" type="date" value={booking.appointmentDate} onChange={(e) => setBooking({ ...booking, appointmentDate: e.target.value })} /></div><div><Label>Time</Label><Input className="mt-2" type="time" value={booking.appointmentTime} onChange={(e) => setBooking({ ...booking, appointmentTime: e.target.value })} /></div><div><Label>Source</Label><Select value={booking.appointmentSource} onValueChange={(appointmentSource) => setBooking({ ...booking, appointmentSource: appointmentSource as typeof booking.appointmentSource })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MANUAL">Manual</SelectItem><SelectItem value="WALK_IN">Walk-in</SelectItem><SelectItem value="PHONE">Phone</SelectItem></SelectContent></Select></div><div><Label>Notes</Label><Textarea className="mt-2" value={booking.notes} onChange={(e) => setBooking({ ...booking, notes: e.target.value })} placeholder="Front-desk notes (optional)" /></div><Button className="md:col-span-2" onClick={createAppointment} disabled={appointmentMutation.isPending}>{appointmentMutation.isPending ? "Booking…" : "Book appointment"}</Button></div>}</CardContent></Card>
    {encounter && <Card className="border-teal-200"><CardHeader><div className="flex items-center gap-3"><CheckCircle2 className="h-7 w-7 text-teal-600" /><div><CardTitle>4. Patient Visit: {encounter.status}</CardTitle><CardDescription>Encounter {encounter.encounterId} · {encounter.source}</CardDescription></div></div></CardHeader><CardContent className="flex flex-wrap gap-3"><Button onClick={() => checkInMutation.mutate({ encounterId: encounter.encounterId })} disabled={encounter.status !== "Present" || checkInMutation.isPending}>{checkInMutation.isPending ? "Checking in…" : "Check In"}</Button><Button onClick={() => generateOpMutation.mutate({ encounterId: encounter.encounterId })} disabled={encounter.status !== "Checked-in" || generateOpMutation.isPending}>{generateOpMutation.isPending ? "Generating…" : "Generate OP"}</Button><Button variant="outline" onClick={() => void printConsultationOP()} disabled={!consultationId || brandedPrint.isPending}><Printer className="mr-2 h-4 w-4" />{brandedPrint.isPending ? "Preparing…" : "Print OP"}</Button><Button variant="ghost" onClick={reset}>Start another patient</Button></CardContent></Card>}
  </div>;
}
