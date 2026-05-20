import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCredentialAuth as useAuth } from "@/_core/hooks/useCredentialAuth";
import { trpc } from "@/lib/trpc";
import { downloadCsvFile } from "@/lib/downloadCsv";
import { CalendarDays, Copy, Download, ExternalLink, FileAudio, FileText, Loader2, Printer, Receipt, Search, UserRound, FileCheck, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { generateOPFormHTML, type UserInfo } from "@/lib/opFormGenerator";
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
  const [, setLocation] = useLocation();

  const patientsQuery = trpc.patients.getAll.useQuery();
  const getFormTemplate = trpc.opForm.getTemplate.useQuery();
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

  const printOPForm = (patient: any) => {
    if (!patient || !getFormTemplate.data) {
      toast.error("Unable to generate form. Please try again.");
      return;
    }

    const formHtml = generateOPFormHTML(
      getFormTemplate.data,
      {
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        contactNumber: patient.contactNumber,
      },
      {
        patientId: patient.patientId,
        barcodeData: "",
        barcodeImageUrl: patient.barcodeImageUrl,
        qrcodeImageUrl: patient.qrcodeImageUrl,
      },
      user ? { name: user.name || "Unknown", role: user.role || "user" } : undefined
    );

    const printWindow = window.open("", "", "width=800,height=600");
    if (!printWindow) {
      toast.error("Unable to open print window. Please check your browser settings.");
      return;
    }

    printWindow.document.write(formHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    toast.success("OP form printed successfully.");
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

      <Card className="friendly-card">
        <CardHeader>
          <CardTitle>Search Patients</CardTitle>
          <CardDescription>Find patients by name, patient ID, contact number, or email.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, patient ID, contact number, or email..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-10 transition-colors focus-visible:ring-teal-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <Card className="friendly-card">
          <CardHeader>
            <CardTitle>Patient List</CardTitle>
            <CardDescription>{filteredPatients.length} patient(s) found</CardDescription>
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
              <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/70 text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold">Patient ID</th>
                      <th className="text-left py-3 px-4 font-semibold">Name</th>
                      <th className="text-left py-3 px-4 font-semibold">Contact</th>
                      <th className="text-left py-3 px-4 font-semibold">Registered</th>
                      <th className="text-left py-3 px-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map((patient) => (
                      <tr key={patient.patientId} className={`border-b transition-colors hover:bg-accent/70 ${selectedPatientId === patient.patientId ? "border-l-4 border-l-primary bg-primary/10" : ""}`}>
                        <td className="py-3 px-4 font-mono text-xs">{patient.patientId}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                          <div className="text-xs text-muted-foreground">{patient.email || "No email recorded"}</div>
                        </td>
                        <td className="py-3 px-4">{patient.contactNumber}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{formatDate(patient.createdAt)}</td>
                        <td className="py-3 px-4">
                          <Button variant="outline" size="sm" onClick={() => setSelectedPatientId(patient.patientId)} className="friendly-action border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50">
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

        <Card className="min-h-[520px] border-slate-200 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" /> Patient Profile
            </CardTitle>
            <CardDescription>Visit history, billing records, and stored file references.</CardDescription>
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
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => printOPForm(selectedPatient)}
                        className="friendly-action border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50"
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Print OP Form
                      </Button>
                      <Badge variant="outline">Registered {formatDate(selectedPatient.createdAt)}</Badge>
                    </div>
                  </div>
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
                                setLocation(`/billing?consultationId=${consultation.consultationId}&patientId=${selectedPatientId}`);
                              }}
                              title="Generate Bill for this consultation"
                            >
                              <DollarSign className="h-3.5 w-3.5" />
                              Generate Bill
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
