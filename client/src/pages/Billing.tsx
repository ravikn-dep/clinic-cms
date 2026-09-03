import { FormEvent, useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, Download, FileText, Loader2, Mail, Plus, RefreshCcw, Printer, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { downloadCsvFile } from "@/lib/downloadCsv";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { createBillingItemId, getBillingCandidateKey } from "@/lib/billingRowIdentity";
import { getBillingContextDate, getBillingContextParams } from "@/lib/billingContext";

type PaymentStatus = "Pending" | "Paid" | "Partial";

type BillItem = {
  id: string;
  itemType: string;
  description: string;
  quantity: string;
  unitPrice: string;
  inventoryItemId?: string;
  catalogItemId?: string | null;
  batchNumber?: string;
  expiryDate?: string;
};

type BillFormState = {
  patientId: string;
  consultationId: string;
  encounterId: string;
  selectedTemplateId?: string;
  items: BillItem[];
  discountAmount: string;
  taxAmount: string;
};

const initialBillForm: BillFormState = {
  patientId: "",
  consultationId: "",
  encounterId: "",
  items: [
    {
      id: "item-1",
      itemType: "Consultation",
      description: "Consultation fee",
      quantity: "1",
      unitPrice: "500",
    },
  ],
  discountAmount: "0",
  taxAmount: "0",
};

const parseCurrency = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;
const clinicToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

type PatientDetails = {
  patientId: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  email?: string;
  address?: string;
  dateOfBirth?: string | null;
  lastConsultationDate: string | null;
};

type ConsultationNotes = {
  consultationId: string;
  patientId: string;
  appointmentId: string | null;
  consultantId: number | null;
  isFinalized: number | null;
  consultationDate: string;
  clinicalHistory: string | null;
  presentComplaints: string | null;
  advisedInvestigations: string | null;
  treatmentPlan: string | null;
};

export default function Billing() {
  const [showNewBill, setShowNewBill] = useState(false);
  const [form, setForm] = useState<BillFormState>(initialBillForm);
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null);
  const [consultationNotes, setConsultationNotes] = useState<ConsultationNotes | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const [location] = useLocation();
  const [selectedBillingDate, setSelectedBillingDate] = useState(() => clinicToday());
  const [highlightedBillId, setHighlightedBillId] = useState<string | null>(null);
  const locationSearch = typeof window === "undefined" ? "" : window.location.search;
  const [inventorySearch, setInventorySearch] = useState("");

  // Handle query parameters from Patient Records "Generate Bill" button
  useEffect(() => {
    const { consultationId, encounterId, patientId, billId } = getBillingContextParams(locationSearch);

    if (billId) {
      setHighlightedBillId(billId);
    }

    if (consultationId || patientId) {
      setForm((current) => ({
        ...current,
        consultationId: consultationId || current.consultationId,
        encounterId: encounterId || current.encounterId,
        patientId: patientId || current.patientId,
      }));
      setShowNewBill(true);
    }
  }, [location, locationSearch]);

  // Fetch available templates
  const templatesQuery = trpc.billTemplates.getAll.useQuery();

  // Auto-fetch patient details when patient ID changes
  const patientDetailsQuery = trpc.patients.getDetailsForBilling.useQuery(
    { patientId: form.patientId },
    { enabled: form.patientId.trim().length > 0 }
  );

  // Auto-fetch consultation notes when consultation ID changes
  const consultationNotesQuery = trpc.bills.getConsultationNotes.useQuery(
    { consultationId: form.consultationId },
    { enabled: form.consultationId.trim().length > 0 }
  );

  useEffect(() => {
    if (patientDetailsQuery.data) {
      setPatientDetails(patientDetailsQuery.data);
    } else if (patientDetailsQuery.isError) {
      setPatientDetails(null);
    }
  }, [patientDetailsQuery.data, patientDetailsQuery.isError]);

  useEffect(() => {
    const consultationData = consultationNotesQuery.data;
    if (consultationData) {
      setConsultationNotes(consultationData);
      setForm((current) => ({ ...current, patientId: consultationData.patientId }));
      setSelectedBillingDate((currentDate) => getBillingContextDate(consultationData.consultationDate, currentDate));
    } else if (consultationNotesQuery.isError) {
      setConsultationNotes(null);
    }
  }, [consultationNotesQuery.data, consultationNotesQuery.isError]);

  const billsQuery = trpc.bills.getAll.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const billingCandidatesQuery = trpc.bills.getEncounterCandidatesByDate.useQuery(
    { date: selectedBillingDate },
    { enabled: showNewBill, refetchOnWindowFocus: false },
  );
  const inventorySearchQuery = trpc.inventory.searchForBilling.useQuery(
    { query: inventorySearch },
    { enabled: showNewBill, refetchOnWindowFocus: false },
  );

  const focusGeneratedBill = (billId: string) => {
    setHighlightedBillId(billId);
    window.requestAnimationFrame(() => {
      document.getElementById(`bill-${billId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const createBill = trpc.bills.create.useMutation({
    onSuccess: (bill) => {
      toast.success(`Invoice ${bill.billId} created.`);
      setForm(initialBillForm);
      setShowNewBill(false);
      focusGeneratedBill(bill.billId);
      void utils.bills.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Unable to create invoice.");
    },
  });

  const createDispensedBill = trpc.bills.createDispensed.useMutation({
    onSuccess: (result) => {
      toast.success(result.created === false ? "This dispensing request was already processed." : `Pharmacy bill ${result.billId} created and stock dispensed.`);
      setForm(initialBillForm);
      setShowNewBill(false);
      setInventorySearch("");
      setHighlightedBillId(result.billId);
      void utils.bills.getAll.invalidate();
      void utils.inventory.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message || "Unable to dispense pharmacy items."),
  });

  const createEncounterBill = trpc.bills.createEncounter.useMutation({
    onSuccess: (result) => {
      toast.success(`Encounter bill ${result.bill.billId} created and visit closed.`);
      setForm(initialBillForm);
      setShowNewBill(false);
      focusGeneratedBill(result.bill.billId);
      void utils.bills.getAll.invalidate();
      void utils.consultations.getByPatientId.invalidate();
    },
    onError: (error) => toast.error(error.message || "Unable to create encounter bill."),
  });

  const generateReceipt = trpc.bills.generateReceipt.useMutation({
    onSuccess: () => {
      toast.success("Receipt generated successfully.");
      utils.bills.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Unable to generate receipt.");
    },
  });

  const sendReceipt = trpc.bills.sendReceipt.useMutation({
    onSuccess: (result) => {
      toast.success(result.message || "Receipt sent successfully.");
      utils.bills.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Unable to send receipt.");
    },
  });

  const updatePaymentStatus = trpc.bills.updatePaymentStatus.useMutation({
    onSuccess: () => {
      toast.success("Payment status updated.");
      utils.bills.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Unable to update payment status.");
    },
  });

  const exportBillingCsv = trpc.bills.exportCsv.useMutation({
    onSuccess: (payload) => {
      downloadCsvFile(payload);
      toast.success(`Exported ${payload.rowCount} billing record(s) to CSV.`);
    },
    onError: (error) => {
      toast.error(error.message || "Unable to export billing history.");
    },
  });

  const getInvoiceLink = trpc.files.getArtifactLink.useMutation({
    onSuccess: (artifact) => {
      window.open(artifact.url, "_blank", "noopener,noreferrer");
    },
    onError: (error) => {
      toast.error(error.message || "Unable to open invoice PDF.");
    },
  });

  const bills = billsQuery.data ?? [];

  useEffect(() => {
    if (!highlightedBillId || billsQuery.isFetching) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`bill-${highlightedBillId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bills, billsQuery.isFetching, highlightedBillId]);

  const highlightedBill = highlightedBillId ? bills.find((bill) => bill.billId === highlightedBillId) : undefined;

  const summary = useMemo(() => {
    return bills.reduce(
      (acc, bill) => {
        const amount = parseCurrency(bill.finalAmount);
        acc.totalRevenue += amount;
        if (bill.paymentStatus === "Pending") acc.pendingAmount += amount;
        if (bill.paymentStatus === "Partial") acc.partialAmount += amount;
        return acc;
      },
      { totalRevenue: 0, pendingAmount: 0, partialAmount: 0 }
    );
  }, [bills]);

  const totalAmount = form.items.reduce((sum, item) => {
    return sum + parseCurrency(item.quantity) * parseCurrency(item.unitPrice);
  }, 0);
  const finalAmount = Math.max(0, totalAmount - parseCurrency(form.discountAmount) + parseCurrency(form.taxAmount));

  const handleCreateBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (form.consultationId.trim() && (!consultationNotes || (!consultationNotes.appointmentId && !form.encounterId.trim()))) {
      toast.error("This consultation is not linked to a valid encounter.");
      return;
    }
    if (form.consultationId.trim() && consultationNotes && consultationNotes.isFinalized !== 1) {
      toast.error("Mark the consultation ready for billing before generating an encounter bill.");
      return;
    }
    if (!form.patientId.trim() && !form.consultationId.trim()) {
      toast.error("Patient ID is required.");
      return;
    }
    if (form.items.length === 0) {
      toast.error("At least one item is required.");
      return;
    }
    
    for (const item of form.items) {
      if (!item.description.trim()) {
        toast.error("Item description is required for all items.");
        return;
      }
      if (parseCurrency(item.quantity) <= 0 || parseCurrency(item.unitPrice) <= 0) {
        toast.error("Quantity and unit price must be greater than zero for all items.");
        return;
      }
    }

    const items = form.items.map(item => ({
      itemType: item.itemType,
      description: item.description.trim(),
      quantity: Number.parseInt(item.quantity, 10),
      unitPrice: parseCurrency(item.unitPrice).toString(),
    }));
    const pharmacyItems = form.items.filter((item) => item.itemType === "Medicine");
    if (pharmacyItems.length > 0) {
      if (pharmacyItems.length !== form.items.length) {
        toast.error("Create pharmacy items in a separate invoice from consultation or procedure lines.");
        return;
      }
      if (pharmacyItems.some((item) => !item.inventoryItemId || !item.batchNumber || !item.expiryDate)) {
        toast.error("Select a valid, unexpired inventory batch for every medicine item.");
        return;
      }
      createDispensedBill.mutate({
        patientId: form.patientId.trim(),
        consultationId: form.consultationId.trim() || undefined,
        appointmentId: consultationNotes?.appointmentId || undefined,
        encounterId: form.encounterId.trim() || undefined,
        items: pharmacyItems.map((item) => ({
          itemType: "Medicine" as const,
          description: item.description.trim(),
          quantity: Number.parseInt(item.quantity, 10),
          unitPrice: parseCurrency(item.unitPrice).toString(),
          inventoryItemId: item.inventoryItemId!,
          catalogItemId: item.catalogItemId ?? null,
          batchNumber: item.batchNumber!,
          expiryDate: item.expiryDate!,
        })),
        discountAmount: parseCurrency(form.discountAmount).toString(),
        taxAmount: parseCurrency(form.taxAmount).toString(),
        idempotencyKey: `${form.patientId.trim()}-${Date.now()}-${crypto.randomUUID()}`,
      });
      return;
    }
    if (form.consultationId.trim() && (consultationNotes?.appointmentId || form.encounterId.trim())) {
      createEncounterBill.mutate({
        consultationId: consultationNotes!.consultationId,
        appointmentId: consultationNotes!.appointmentId || undefined,
        encounterId: form.encounterId.trim() || undefined,
        items,
        discountAmount: parseCurrency(form.discountAmount).toString(),
        taxAmount: parseCurrency(form.taxAmount).toString(),
      });
      return;
    }
    createBill.mutate({
      patientId: form.patientId.trim(),
      consultationId: undefined,
      items,
      discountAmount: parseCurrency(form.discountAmount).toString(),
      taxAmount: parseCurrency(form.taxAmount).toString(),
    });
  };

  const selectEncounter = (candidate: NonNullable<typeof billingCandidatesQuery.data>[number]) => {
    const consultationId = candidate.consultationId;
    if (!candidate.canRaiseBill || !consultationId) return;
    setForm((current) => ({ ...current, patientId: candidate.patientId, consultationId, encounterId: candidate.encounterId || "" }));
    setPatientDetails(null);
    setConsultationNotes(null);
  };

  const setField = (field: keyof BillFormState, value: string | BillItem[]) => {
    setForm((current) => ({ ...current, [field]: value }));
    // Clear patient details when patient ID changes
    if (field === "patientId") {
      setPatientDetails(null);
    }
    // Clear consultation notes when consultation ID changes
    if (field === "consultationId") {
      setConsultationNotes(null);
    }
  };

  const updateItem = (itemId: string, field: keyof BillItem, value: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      ),
    }));
  };

  const selectInventoryItem = (itemId: string, selected: NonNullable<typeof inventorySearchQuery.data>[number]) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? {
        ...item,
        itemType: "Medicine",
        description: selected.canonicalName || selected.itemName,
        unitPrice: String(selected.unitPrice ?? "0"),
        inventoryItemId: selected.itemId,
        catalogItemId: selected.catalogItemId,
        batchNumber: selected.batchNumber,
        expiryDate: selected.expiryDate,
      } : item),
    }));
    setInventorySearch("");
  };

  const addItem = () => {
    const newItem: BillItem = {
      id: createBillingItemId(),
      itemType: "Medicine",
      description: "",
      quantity: "1",
      unitPrice: "0",
    };
    setForm((current) => ({
      ...current,
      items: [...current.items, newItem],
    }));
  };

  const removeItem = (itemId: string) => {
    if (form.items.length === 1) {
      toast.error("At least one item is required.");
      return;
    }
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
    }));
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = templatesQuery.data?.find(t => t.templateId === templateId);
    if (!template) return;

    // Convert template items to bill items
    const templateItems = (template.itemsJson as any[]).map((item, idx) => ({
      id: `${createBillingItemId()}-${idx}`,
      itemType: item.itemType,
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice,
    }));

    setForm((current) => ({
      ...current,
      selectedTemplateId: templateId,
      items: templateItems,
    }));
    toast.success(`Template "${template.name}" applied successfully`);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "N/A";
    try {
      return new Date(date).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-50 text-green-700 border-green-200";
      case "Pending":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Partial":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const openInvoicePdf = (bill: (typeof bills)[number]) => {
    if (!bill.invoicePdfKey && !bill.invoicePdfUrl) {
      toast.error("No invoice PDF is available for this bill yet.");
      return;
    }

    getInvoiceLink.mutate({
      key: bill.invoicePdfKey ?? undefined,
      url: bill.invoicePdfUrl ?? undefined,
      patientId: bill.patientId,
      recordId: bill.billId,
      artifactType: "invoice_pdf",
    });
  };

  const handleSendReceipt = (bill: (typeof bills)[number]) => {
    if (bill.paymentStatus !== "Paid") {
      toast.error("Receipt can only be sent for paid bills.");
      return;
    }
    if (!bill.receiptPdfUrl && !bill.receiptPdfKey) {
      toast.error("Receipt PDF not available. Generate receipt first.");
      return;
    }
    sendReceipt.mutate({ billId: bill.billId, method: "Email" });
  };

  const downloadBillPdf = (bill: (typeof bills)[number]) => {
    if (!bill.invoicePdfUrl) {
      toast.error("Invoice PDF is not available for this bill.");
      return;
    }
    const link = document.createElement("a");
    link.href = bill.invoicePdfUrl;
    link.download = `Bill_${bill.billId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Bill PDF downloaded successfully.");
  };

  const printReceipt = async (bill: (typeof bills)[number]) => {
    if (bill.paymentStatus !== "Paid") {
      toast.error("Receipt can only be printed for paid bills.");
      return;
    }
    if (!bill.receiptPdfKey && !bill.receiptPdfUrl) {
      // Generate receipt on first print attempt if not already generated
      try {
        await generateReceipt.mutateAsync({ billId: bill.billId });
        // After generation, the bill data will be refreshed via invalidate
        // User can click Print again to view the generated receipt
        toast.info("Receipt generated. Click Print again to view.");
      } catch (error) {
        // Error is already handled by the mutation's onError
      }
      return;
    }

    getInvoiceLink.mutate({
      key: bill.receiptPdfKey ?? undefined,
      url: bill.receiptPdfUrl ?? undefined,
      patientId: bill.patientId,
      recordId: bill.billId,
      artifactType: "invoice_pdf",
    });
  };

  return (
    <div className="friendly-page space-y-8">
      <div className="friendly-hero flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-teal-950">Billing</h1>
          <p className="mt-2 max-w-2xl leading-6 text-teal-700">Generate invoices, track payments, and export billing history.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button 
            onClick={() => setShowNewBill((value) => !value)} 
            className="friendly-action bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-semibold shadow-md hover:shadow-lg transition-all rounded-lg"
            size="lg"
          >
            <Plus className="mr-2 h-5 w-5" />
            Raise New Bill
          </Button>
          <Button variant="outline" onClick={() => billsQuery.refetch()} disabled={billsQuery.isFetching} className="friendly-action border-teal-200 hover:bg-teal-50 rounded-lg transition-all">
            <RefreshCcw className={`mr-2 h-4 w-4 ${billsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {isAdmin ? (
            <Button
              variant="outline"
              onClick={() => exportBillingCsv.mutate()}
              disabled={exportBillingCsv.isPending || bills.length === 0}
              className="friendly-action border-teal-200 hover:bg-teal-50 rounded-lg transition-all"
            >
              {exportBillingCsv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export Billing CSV
            </Button>
          ) : null}
        </div>
      </div>

      {showNewBill && (
        <Card className="friendly-card border-0 shadow-md overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-teal-100 pb-4">
            <CardTitle className="text-teal-950">Create New Invoice</CardTitle>
            <CardDescription className="text-teal-700 mt-1">Generate a bill for consultation, procedure, or medicine charges.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-semibold text-teal-950">Select a visit to bill</p>
                  <p className="text-sm text-teal-700">Choose the clinic visit date, then raise a bill only for a finalized encounter.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={selectedBillingDate === clinicToday() ? "default" : "outline"} onClick={() => setSelectedBillingDate(clinicToday())}>Today</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { const date = new Date(); date.setDate(date.getDate() - 1); setSelectedBillingDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date)); }}>Yesterday</Button>
                  <Input aria-label="Billing visit date" type="date" value={selectedBillingDate} onChange={(event) => setSelectedBillingDate(event.target.value)} className="w-[150px] bg-white" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {billingCandidatesQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading visits...</div>
                ) : billingCandidatesQuery.isError ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> Unable to load visits for this date.</div>
                ) : billingCandidatesQuery.data?.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">No visits recorded for this date.</p>
                ) : (
                  billingCandidatesQuery.data?.map((candidate) => (
                    <div key={getBillingCandidateKey(candidate)} className="flex flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-teal-950">{candidate.patientName} <span className="font-mono text-xs font-normal text-muted-foreground">{candidate.patientId}</span></p>
                        <p className="text-xs text-muted-foreground">{candidate.appointmentTime} · {candidate.consultantName} · {candidate.age ?? "Age not recorded"}{candidate.gender ? ` · ${candidate.gender}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={candidate.canRaiseBill ? "default" : "outline"}>{candidate.displayStatus}</Badge>
                        {candidate.canRaiseBill ? (
                          <Button type="button" size="sm" className="gap-1 bg-teal-600 text-white hover:bg-teal-700" onClick={() => selectEncounter(candidate)}><Plus className="h-3.5 w-3.5" /> Raise Bill</Button>
                        ) : candidate.billId ? (
                          <span className="text-xs text-muted-foreground">View in billing history</span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <form className="space-y-6" onSubmit={handleCreateBill}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="patientId">Patient ID *</Label>
                  <Input id="patientId" value={form.patientId} onChange={(event) => setField("patientId", event.target.value)} placeholder="PAT-ABC12345" className="transition-colors focus-visible:ring-teal-200" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="consultationId">Consultation ID</Label>
                  <Input id="consultationId" value={form.consultationId} onChange={(event) => setField("consultationId", event.target.value)} placeholder="CON-1704067200000-ABC123" className="transition-colors focus-visible:ring-teal-200" />
                </div>
              </div>

              {form.patientId.trim().length > 0 && (
                <div className="rounded-lg border bg-teal-50/50 p-4">
                  {patientDetailsQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading patient details...
                    </div>
                  ) : patientDetailsQuery.isError || !patientDetails ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      Patient not found
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-teal-950">{patientDetails.firstName} {patientDetails.lastName}</p>
                          <p className="text-xs text-muted-foreground">DOB: {formatDate(patientDetails.dateOfBirth)}</p>
                        </div>
                        <Badge variant="outline" className="bg-white text-teal-700 border-teal-200">
                          {patientDetails.patientId}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Contact</p>
                          <p className="text-teal-900">{patientDetails.contactNumber}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Last Consultation</p>
                          <p className="text-teal-900">{formatDate(patientDetails.lastConsultationDate)}</p>
                        </div>
                      </div>
                      {patientDetails.address && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Address</p>
                          <p className="text-sm text-teal-900 line-clamp-2">{patientDetails.address}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {form.consultationId.trim().length > 0 && (
                <div className="rounded-lg border bg-emerald-50/50 p-4">
                  {consultationNotesQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading consultation notes...
                    </div>
                  ) : consultationNotesQuery.isError || !consultationNotes ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      Consultation not found
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="font-semibold text-emerald-950">Consultation Details</p>
                      {consultationNotes.presentComplaints && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Present Complaints</p>
                          <p className="text-sm text-emerald-900">{consultationNotes.presentComplaints}</p>
                        </div>
                      )}
                      {consultationNotes.clinicalHistory && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Clinical History</p>
                          <p className="text-sm text-emerald-900 line-clamp-2">{consultationNotes.clinicalHistory}</p>
                        </div>
                      )}
                      {consultationNotes.treatmentPlan && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Treatment Plan</p>
                          <p className="text-sm text-emerald-900 line-clamp-2">{consultationNotes.treatmentPlan}</p>
                        </div>
                      )}
                      {consultationNotes.advisedInvestigations && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Advised Investigations</p>
                          <p className="text-sm text-emerald-900 line-clamp-2">{consultationNotes.advisedInvestigations}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {isAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="template">Quick Templates</Label>
                    <Select value={form.selectedTemplateId || ""} onValueChange={handleApplyTemplate}>
                      <SelectTrigger id="template">
                        <SelectValue placeholder="Select a template to auto-populate items" />
                      </SelectTrigger>
                      <SelectContent>
                        {templatesQuery.data?.map((template) => (
                          <SelectItem key={template.templateId} value={template.templateId}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Bill Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
                    <Plus className="h-4 w-4" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-3">
                  {form.items.map((item) => (
                    <div key={item.id} className="grid gap-3 rounded-xl border bg-slate-50/70 p-4 shadow-inner md:grid-cols-[140px_1fr_100px_140px_50px]">
                      <div className="space-y-2">
                        <Label className="text-xs">Item Type</Label>
                        <Select value={item.itemType} onValueChange={(value) => updateItem(item.id, "itemType", value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Consultation">Consultation</SelectItem>
                            <SelectItem value="Medicine">Medicine</SelectItem>
                            <SelectItem value="Procedure">Procedure</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Description *</Label>
                        {item.itemType === "Medicine" ? (
                          <>
                            <Input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Search valid stock" className="transition-colors focus-visible:ring-teal-200" />
                            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border bg-white p-1">
                              {(inventorySearchQuery.data ?? []).map((stock) => (
                                <button key={stock.itemId} type="button" className="w-full rounded px-2 py-1 text-left text-xs hover:bg-teal-50" onClick={() => selectInventoryItem(item.id, stock)}>
                                  <span className="font-medium">{stock.canonicalName || stock.itemName}</span>
                                  <span className="block text-muted-foreground">Batch {stock.batchNumber} · Exp {stock.expiryDate} · {stock.quantityAvailable} available · ₹{stock.unitPrice}</span>
                                </button>
                              ))}
                              {inventorySearchQuery.isLoading ? <p className="px-2 py-1 text-xs text-muted-foreground">Searching valid stock...</p> : null}
                              {!inventorySearchQuery.isLoading && inventorySearchQuery.data?.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">No unexpired stock found.</p> : null}
                            </div>
                          </>
                        ) : null}
                        <Input value={item.description} onChange={(event) => updateItem(item.id, "description", event.target.value)} placeholder="Item description" className="transition-colors focus-visible:ring-teal-200" />
                        {item.itemType === "Medicine" && item.inventoryItemId ? <p className="text-xs text-teal-700">Batch {item.batchNumber} · expires {item.expiryDate} · available stock checked at dispense</p> : null}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Qty *</Label>
                        <Input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} className="transition-colors focus-visible:ring-teal-200" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Unit Price *</Label>
                        <Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(item.id, "unitPrice", event.target.value)} className="transition-colors focus-visible:ring-teal-200" />
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="discount">Discount Amount</Label>
                  <Input id="discount" type="number" min="0" step="0.01" value={form.discountAmount} onChange={(event) => setField("discountAmount", event.target.value)} className="transition-colors focus-visible:ring-teal-200" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax">Tax Amount</Label>
                  <Input id="tax" type="number" min="0" step="0.01" value={form.taxAmount} onChange={(event) => setField("taxAmount", event.target.value)} className="transition-colors focus-visible:ring-teal-200" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total">Final Amount</Label>
                  <Input id="total" value={`₹${finalAmount.toFixed(2)}`} disabled className="bg-muted" />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" className="friendly-action flex-1" disabled={createBill.isPending}>
                  {createBill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  Create Invoice
                </Button>
                <Button type="button" variant="outline" className="friendly-action flex-1 border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50" onClick={() => setShowNewBill(false)} disabled={createBill.isPending}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="friendly-card border-0 shadow-md overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-teal-100 pb-4">
          <CardTitle className="text-teal-950">Recent Invoices</CardTitle>
          <CardDescription className="text-teal-700 mt-1">
            {billsQuery.isLoading ? "Loading billing history..." : `${bills.length} invoice(s) total`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {highlightedBill ? (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
              <div>
                <p className="font-semibold text-teal-950">Invoice {highlightedBill.billId} is ready</p>
                <p className="text-sm text-teal-800">The generated invoice is highlighted below. Open its protected PDF from this context.</p>
              </div>
              <Button type="button" size="sm" className="gap-1 bg-teal-600 text-white hover:bg-teal-700" onClick={() => openInvoicePdf(highlightedBill)} disabled={getInvoiceLink.isPending || !highlightedBill.invoicePdfKey && !highlightedBill.invoicePdfUrl}>
                {getInvoiceLink.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                View invoice PDF
              </Button>
            </div>
          ) : null}
          {billsQuery.isLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading invoices...
            </div>
          ) : billsQuery.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="font-medium">Unable to load billing history.</p>
                <p className="text-sm text-muted-foreground">{billsQuery.error.message}</p>
              </div>
              <Button variant="outline" onClick={() => billsQuery.refetch()}>Try again</Button>
            </div>
          ) : bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No invoices yet.</p>
                <p className="text-sm text-muted-foreground">Create the first invoice after registering a patient.</p>
              </div>
              <Button onClick={() => setShowNewBill(true)}>Create invoice</Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/70 text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Bill ID</th>
                    <th className="text-left py-3 px-4 font-semibold">Patient</th>
                    <th className="text-left py-3 px-4 font-semibold">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Date</th>
                    <th className="text-left py-3 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr id={`bill-${bill.billId}`} key={bill.billId} className={`border-b transition-colors hover:bg-accent/70 ${highlightedBillId === bill.billId ? "bg-teal-50 ring-2 ring-inset ring-teal-200" : ""}`}>
                      <td className="py-3 px-4 font-mono text-xs">{bill.billId}</td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{bill.patientName}</p>
                          <p className="text-xs text-muted-foreground">{bill.patientId}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-semibold">₹{parseCurrency(bill.finalAmount).toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">Total: ₹{parseCurrency(bill.totalAmount).toFixed(2)}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Select
                          value={(bill.paymentStatus || "Pending") as PaymentStatus}
                          onValueChange={(value: PaymentStatus) => updatePaymentStatus.mutate({ billId: bill.billId, paymentStatus: value })}
                          disabled={updatePaymentStatus.isPending}
                        >
                          <SelectTrigger className="h-8 w-[130px] border-0 bg-transparent p-0 shadow-none focus:ring-0">
                            <Badge variant="outline" className={getStatusColor(bill.paymentStatus || "Pending")}>{bill.paymentStatus || "Pending"}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Partial">Partial</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 px-4 text-xs">{bill.createdAt ? new Date(bill.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          {isAdmin ? (
                            <Button variant="ghost" size="sm" onClick={() => exportBillingCsv.mutate()} disabled={exportBillingCsv.isPending} aria-label="Export billing CSV" className="transition-all hover:-translate-y-0.5 hover:text-teal-700">
                              {exportBillingCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => openInvoicePdf(bill)} disabled={getInvoiceLink.isPending} className="friendly-action border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50">
                            {getInvoiceLink.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            View PDF
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => downloadBillPdf(bill)} disabled={exportBillingCsv.isPending} className="friendly-action border-emerald-200 bg-white/85 text-emerald-800 hover:bg-emerald-50" title="Download bill as PDF">
                            {exportBillingCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Download
                          </Button>
                          {bill.paymentStatus === "Paid" && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => printReceipt(bill)} disabled={getInvoiceLink.isPending || generateReceipt.isPending} className="friendly-action border-green-200 bg-white/85 text-green-800 hover:bg-green-50 transition-all hover:-translate-y-0.5" title="Print payment receipt">
                                {generateReceipt.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleSendReceipt(bill)} disabled={sendReceipt.isPending} className="friendly-action border-blue-200 bg-white/85 text-blue-800 hover:bg-blue-50 transition-all hover:-translate-y-0.5" title="Send receipt via email">
                                {sendReceipt.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="friendly-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{summary.totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="friendly-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">₹{summary.pendingAmount.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="friendly-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Partial Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">₹{summary.partialAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
