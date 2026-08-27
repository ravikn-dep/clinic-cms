import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useCanAccessFeature } from "@/hooks/useFeatureAccess";
import { downloadCsvFile } from "@/lib/downloadCsv";
import { CalendarDays, Copy, Download, ExternalLink, FileAudio, FileText, Loader2, Printer, Receipt, Search, UserRound, FileCheck, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { generateConsultationOPHTML } from "@/lib/opFormGenerator";
import { useLocation } from "wouter";

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function money(value: unknown) {
  const numeric = Number(value || 0);
  return `₹${numeric.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusVariant(status: string | null | undefined) {
  if (status === "Paid") return "default";
  if (status === "Partial") return "secondary";
  return "outline";
}

export default function PatientRecords() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canAccessBilling = useCanAccessFeature("billing");
  const [, setLocation] = useLocation();

  const patientsQuery = trpc.patients.getAll.useQuery();
  const selectedPatientQuery = trpc.patients.getById.useQuery(
    { patientId: selectedPatientId || "" },
    { enabled: Boolean(selectedPatientId) }
  );
  const consultationsQuery = trpc.consultations.getByPatientId.useQuery(
    { patientId: selectedPatientId || "" },
    { enabled: Boolean(selectedPatientId) }
  );
  const billsQuery = trpc.bills.getByPatientId.useQuery(
    { patientId: selectedPatientId || "" },
    { enabled: Boolean(selectedPatientId) }
  );
  const visitChainQuery = trpc.visits.getVisitChain.useQuery(
    { patientId: selectedPatientId || "" },
    { enabled: Boolean(selectedPatientId) }
  );

  const exportPatientsCsv = trpc.patients.exportCsv.useMutation({
    onSuccess: (payload) => {
      downloadCsvFile(payload);
      toast.success(`Exported ${payload.rowCount} patient record(s) to CSV.`);
    },
    onError: (error) => {
      toast.error(error.message || "Unable to export patient records.");
    },
  });

  const artifactLink = trpc.files.getArtifactLink.useMutation({
    onError: (error) => {
      toast.error(error.message || "Unable to open the protected file link.");
    },
  });

  const patients = patientsQuery.data || [];

  const filteredPatients = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return patients;
    return patients.filter((patient) =>
      patient.firstName.toLowerCase().includes(normalizedQuery) ||
      patient.lastName.toLowerCase().includes(normalizedQuery) ||
      patient.patientId.toLowerCase().includes(normalizedQuery) ||
      patient.contactNumber.toLowerCase().includes(normalizedQuery) ||
      (patient.email || "").toLowerCase().includes(normalizedQuery)
    );
  }, [patients, searchQuery]);

  const selectedPatient = selectedPatientQuery.data || patients.find((patient) => patient.patientId === selectedPatientId);
  const consultations = consultationsQuery.data || [];
  const bills = billsQuery.data || [];
  const visitChains = visitChainQuery.data || [];
  const eligibleBillingVisits = useMemo(
    () => visitChains.filter((chain) => Boolean(chain.consultation?.isFinalized && !chain.bill && chain.consultation?.appointmentId)),
    [visitChains],
  );
  const openEncounterBilling = (consultationId: string, patientId: string) => {
    setLocation(`/billing?consultationId=${encodeURIComponent(consultationId)}&patientId=${encodeURIComponent(patientId)}`);
  };

  const storedFiles = selectedPatient ? [
    { label: "QR Code", url: selectedPatient.qrcodeImageUrl, key: selectedPatient.qrcodeImageKey, artifactType: "qr_code" as const, patientId: selectedPatient.patientId, recordId: selectedPatient.patientId, icon: FileText },
    { label: "Barcode", url: selectedPatient.barcodeImageUrl, key: selectedPatient.barcodeImageKey, artifactType: "barcode" as const, patientId: selectedPatient.patientId, recordId: selectedPatient.patientId, icon: FileText },
    ...consultations.flatMap((consultation) => [
      { label: `Audio Recording ${consultation.consultationId}`, url: consultation.audioFileUrl, key: consultation.audioFileKey, artifactType: "audio" as const, patientId: selectedPatient.patientId, recordId: consultation.consultationId, icon: FileAudio },
    ]),
    ...bills.flatMap((bill) => [
      { label: `Invoice PDF ${bill.billId}`, url: bill.invoicePdfUrl, key: bill.invoicePdfKey, artifactType: "invoice_pdf" as const, patientId: selectedPatient.patientId, recordId: bill.billId, icon: Receipt },
    ]),
  ].filter((file) => Boolean(file.key || file.url)) : [];

  const brandedPrint = trpc.consultations.getBrandedPrintData.useMutation();
  const completeConsultation = trpc.visits.completeConsultation.useMutation({
    onSuccess: () => {
      toast.success("Consultation marked ready for billing.");
      void consultationsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Unable to complete consultation."),
  });

  const printConsultationOP = async (consultationId: string) => {
    try {
      const printData = await brandedPrint.mutateAsync({ consultationId });
      const printWindow = window.open("", "", "width=800,height=600");
      if (!printWindow) {
        toast.error("Unable to open print window. Please check your browser settings.");
        return;
      }
      printWindow.document.write(generateConsultationOPHTML(printData));
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      toast.success("Consultant-branded OP printed successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to prepare the consultation OP.");
    }
  };

  async function openProtectedArtifact(file: { key?: string | null; url?: string | null; artifactType: "barcode" | "qr_code" | "audio" | "invoice_pdf"; patientId?: string; recordId?: string; label: string }) {
    const artifact = await artifactLink.mutateAsync({
      key: file.key || undefined,
      url: file.url || undefined,
      artifactType: file.artifactType,
      patientId: file.patientId,
      recordId: file.recordId,
    });
    window.open(artifact.url, "_blank", "noopener,noreferrer");
    toast.success(`${file.label} opened through a protected, audited link.`);
  }

  return (
    <div className="friendly-page space-y-8">
      <div className="friendly-hero flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-teal-950">Patient Records</h1>
          <p className="mt-2 max-w-2xl leading-6 text-muted-foreground">Search, review, and export patient history for external reporting.</p>
        </div>
        {isAdmin ? (
          <Button
            variant="outline"
            onClick={() => exportPatientsCsv.mutate()}
            disabled={exportPatientsCsv.isPending}
            className="friendly-action"
          >
            {exportPatientsCsv.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Patients CSV
          </Button>
        ) : (
          <Badge variant="outline" className="px-3 py-2 text-muted-foreground">Admin-only export</Badge>
        )}
      </div>

      <Card className="friendly-card border-0 shadow-md overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-teal-100 pb-4">
          <CardTitle className="text-teal-950">Search Patients</CardTitle>
          <CardDescription className="text-teal-700 mt-1">Find patients by name, patient ID, contact number, or email.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, patient ID, contact number, or email..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-10 transition-colors focus-visible:ring-teal-200 rounded-lg border-teal-100 hover:border-teal-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <Card className="friendly-card border-0 shadow-md overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-teal-100 pb-4">
            <CardTitle className="text-teal-950">Patient List</CardTitle>
            <CardDescription className="text-teal-700 mt-1">{filteredPatients.length} patient(s) found</CardDescription>
          </CardHeader>
          <CardContent>
            {patientsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading patient records...
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No patients found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-teal-100/50 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-teal-50 to-cyan-50 text-teal-900">
                    <tr className="border-b border-teal-100">
                      <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Patient ID</th>
                      <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Contact</th>
                      <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Registered</th>
                      <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map((patient) => (
                      <tr key={patient.patientId} className={`border-b border-teal-50 transition-all duration-200 hover:bg-teal-50/50 ${selectedPatientId === patient.patientId ? "border-l-4 border-l-teal-500 bg-teal-50/80" : ""}`}>
                        <td className="py-3 px-4 font-mono text-xs text-teal-700 font-semibold">{patient.patientId}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{patient.firstName} {patient.lastName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{patient.email || "No email recorded"}</div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-700">{patient.contactNumber}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{formatDate(patient.createdAt)}</td>
                        <td className="py-3 px-4">
                          <Button variant="outline" size="sm" onClick={() => setSelectedPatientId(patient.patientId)} className="friendly-action border-teal-200 bg-white hover:bg-teal-50 text-teal-800 rounded-lg transition-all">
                            View Profile
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[520px] border-0 shadow-md overflow-hidden transition-shadow hover:shadow-lg">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-teal-100 pb-4">
            <CardTitle className="flex items-center gap-2 text-teal-950">
              <UserRound className="h-5 w-5 text-teal-600" /> Patient Profile
            </CardTitle>
            <CardDescription className="text-teal-700 mt-1">Visit history, billing records, and stored file references.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedPatientId ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50/70 p-6 text-center">
                <UserRound className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Select a patient to review their profile.</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Opening a profile records a PHI access event in the immutable audit trail.</p>
              </div>
            ) : selectedPatientQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading patient profile...
              </div>
            ) : !selectedPatient ? (
              <div className="py-12 text-center text-muted-foreground">Patient profile not found.</div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">{selectedPatient.firstName} {selectedPatient.lastName}</h2>
                      <p className="font-mono text-xs text-muted-foreground">{selectedPatient.patientId}</p>
                    </div>
                    <Badge variant="outline">Registered {formatDate(selectedPatient.createdAt)}</Badge>
                  </div>
                  {canAccessBilling && (
                    <div className="mt-4 flex flex-col gap-2 rounded-lg border border-teal-100 bg-teal-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-teal-950">Billing actions</p>
                        <p className="text-xs text-teal-700">
                          {eligibleBillingVisits.length === 0
                            ? "No visits ready for billing."
                            : eligibleBillingVisits.length === 1
                              ? "One finalized visit is ready."
                              : `${eligibleBillingVisits.length} finalized visits are ready; choose one.`}
                        </p>
                      </div>
                      {eligibleBillingVisits.length === 1 && eligibleBillingVisits[0]?.consultation?.consultationId && (
                        <Button type="button" size="sm" className="gap-1 bg-teal-600 text-white hover:bg-teal-700" onClick={() => openEncounterBilling(eligibleBillingVisits[0].consultation!.consultationId, selectedPatient.patientId)}>
                          <DollarSign className="h-3.5 w-3.5" /> Raise Bill
                        </Button>
                      )}
                    </div>
                  )}
                  {canAccessBilling && eligibleBillingVisits.length > 1 && (
                    <div className="mt-2 grid gap-2 rounded-lg border border-teal-100 bg-white p-3 sm:grid-cols-2">
                      {eligibleBillingVisits.map((chain) => (
                        <Button key={chain.consultation!.consultationId} type="button" variant="outline" className="justify-between border-teal-200 text-left text-teal-900 hover:bg-teal-50" onClick={() => openEncounterBilling(chain.consultation!.consultationId, selectedPatient.patientId)}>
                          <span>{formatDate(chain.appointment.appointmentDate)} · {chain.appointment.appointmentTime}</span>
                          <span className="text-xs text-muted-foreground">Raise Bill</span>
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div><span className="text-muted-foreground">Phone:</span> {selectedPatient.contactNumber}</div>
                    <div><span className="text-muted-foreground">Email:</span> {selectedPatient.email || "—"}</div>
                    <div><span className="text-muted-foreground">Gender:</span> {selectedPatient.gender || "—"}</div>
                    <div><span className="text-muted-foreground">DOB:</span> {selectedPatient.dateOfBirth || "—"}</div>
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Address:</span> {selectedPatient.address || "—"}</div>
                  </div>
                </div>

                <Tabs defaultValue="consultations" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 rounded-xl bg-muted/70 p-1">
                    <TabsTrigger value="consultations">Consultations</TabsTrigger>
                    <TabsTrigger value="billing">Billing</TabsTrigger>
                    <TabsTrigger value="files">Files</TabsTrigger>
                  </TabsList>

                  <TabsContent value="consultations" className="mt-4 space-y-3">
                    {visitChains.length > 0 && (
                      <div className="rounded-lg border bg-teal-50/50 p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 font-medium"><FileCheck className="h-4 w-4 text-teal-700" /> Visit chain</div>
                        <div className="space-y-2 text-sm">
                          {visitChains.map((chain) => (
                            <div key={chain.appointment.appointmentId} className="grid gap-1 rounded-md border bg-white p-3 sm:grid-cols-4">
                              <span><strong>Appointment:</strong> {chain.appointment.status}</span>
                              <span><strong>Consultation:</strong> {chain.consultation?.consultationId || "—"}</span>
                              <span><strong>Bill:</strong> {chain.bill?.billId || "—"}</span>
                              <span><strong>Closure:</strong> {chain.appointment.status === "Completed" ? "Completed" : "Open"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {consultationsQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground">Loading consultations...</div>
                    ) : consultations.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No consultations recorded yet.</div>
                    ) : consultations.map((consultation) => (
                      <div key={consultation.consultationId} className="rounded-lg border bg-white p-4 shadow-sm transition-colors hover:bg-accent/30">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="font-medium font-mono text-sm">{consultation.consultationId}</div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto p-1"
                              onClick={() => {
                                navigator.clipboard.writeText(consultation.consultationId);
                                toast.success("Consultation ID copied to clipboard");
                              }}
                              title="Copy Consultation ID"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto gap-1 px-2 py-1 text-xs"
                              onClick={() => {
                                const chain = visitChains.find((candidate) => candidate.consultation?.consultationId === consultation.consultationId);
                                if (chain?.bill) {
                                  setLocation(`/billing?consultationId=${encodeURIComponent(consultation.consultationId)}&patientId=${encodeURIComponent(selectedPatientId || "")}`);
                                  return;
                                }
                                openEncounterBilling(consultation.consultationId, selectedPatientId || "");
                              }}
                              disabled={!canAccessBilling || !consultation.isFinalized}
                              title={!canAccessBilling ? "Billing access is not enabled" : consultation.isFinalized ? "Generate Bill for this consultation" : "Mark the consultation ready for billing first"}
                            >
                              <DollarSign className="h-3.5 w-3.5" />
                              {visitChains.find((candidate) => candidate.consultation?.consultationId === consultation.consultationId)?.bill ? "View Bill" : "Raise Bill"}
                            </Button>
                            {!consultation.isFinalized && (user?.role === "consultant" || isAdmin) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-auto gap-1 px-2 py-1 text-xs"
                                disabled={completeConsultation.isPending}
                                onClick={() => completeConsultation.mutate({ consultationId: consultation.consultationId })}
                              >
                                <FileCheck className="h-3.5 w-3.5" /> Ready for Billing
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={brandedPrint.isPending}
                              className="h-auto gap-1 px-2 py-1 text-xs"
                              onClick={() => printConsultationOP(consultation.consultationId)}
                              title="Print this consultation's consultant-branded OP"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Print OP
                            </Button>
                          </div>
                          <Badge variant={consultation.isFinalized ? "default" : "outline"}>{consultation.isFinalized ? "Finalized" : "Draft"}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" /> {formatDate(consultation.consultationDate)}
                        </div>
                        <div className="mt-3 grid gap-3 text-sm">
                          <div><strong>Clinical History:</strong> {consultation.clinicalHistory || "Not documented"}</div>
                          <div><strong>Present Complaints:</strong> {consultation.presentComplaints || "Not documented"}</div>
                          <div><strong>Advised Investigations:</strong> {consultation.advisedInvestigations || "Not documented"}</div>
                          <div><strong>Treatment Plan:</strong> {consultation.treatmentPlan || "Not documented"}</div>
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="billing" className="mt-4 space-y-3">
                    {billsQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground">Loading bills...</div>
                    ) : bills.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No billing records found.</div>
                    ) : bills.map((bill) => (
                      <div key={bill.billId} className="rounded-lg border bg-white p-4 shadow-sm transition-colors hover:bg-accent/30">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{bill.billId}</div>
                          <Badge variant={statusVariant(bill.paymentStatus)}>{bill.paymentStatus}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                          <div><span className="text-muted-foreground">Consultation:</span> {bill.consultationId || "—"}</div>
                          <div><span className="text-muted-foreground">Final Amount:</span> {money(bill.finalAmount)}</div>
                          <div><span className="text-muted-foreground">Created:</span> {formatDate(bill.createdAt)}</div>
                          <div>
                            {bill.invoicePdfUrl || bill.invoicePdfKey ? (
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-primary transition-colors hover:text-primary/80"
                                disabled={artifactLink.isPending}
                                onClick={() => openProtectedArtifact({
                                  key: bill.invoicePdfKey,
                                  url: bill.invoicePdfUrl,
                                  artifactType: "invoice_pdf",
                                  patientId: bill.patientId,
                                  recordId: bill.billId,
                                  label: `Invoice PDF ${bill.billId}`,
                                })}
                              >
                                Invoice PDF <ExternalLink className="ml-1 h-3 w-3" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">No invoice PDF</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="files" className="mt-4 space-y-3">
                    {storedFiles.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No stored patient files are linked yet.</div>
                    ) : storedFiles.map((file) => {
                      const Icon = file.icon;
                      return (
                        <button
                          key={`${file.label}-${file.key || file.url}`}
                          type="button"
                          disabled={artifactLink.isPending}
                          onClick={() => openProtectedArtifact(file)}
                          className="flex w-full items-center justify-between rounded-lg border bg-white p-3 text-left text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent/60 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                        >
                          <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {file.label}</span>
                          {artifactLink.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ExternalLink className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
