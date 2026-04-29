import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, Download, FileText, Loader2, Plus, RefreshCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { downloadCsvFile } from "@/lib/downloadCsv";
import { useAuth } from "@/_core/hooks/useAuth";

type PaymentStatus = "Pending" | "Paid" | "Partial";

type BillFormState = {
  patientId: string;
  consultationId: string;
  itemType: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
};

const initialBillForm: BillFormState = {
  patientId: "",
  consultationId: "",
  itemType: "Consultation",
  description: "Consultation fee",
  quantity: "1",
  unitPrice: "500",
  discountAmount: "0",
  taxAmount: "0",
};

const parseCurrency = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;

export default function Billing() {
  const [showNewBill, setShowNewBill] = useState(false);
  const [form, setForm] = useState<BillFormState>(initialBillForm);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const billsQuery = trpc.bills.getAll.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const createBill = trpc.bills.create.useMutation({
    onSuccess: (bill) => {
      toast.success(`Invoice ${bill.billId} created.`);
      setForm(initialBillForm);
      setShowNewBill(false);
      utils.bills.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Unable to create invoice.");
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

  const totalAmount = parseCurrency(form.quantity) * parseCurrency(form.unitPrice);
  const finalAmount = Math.max(0, totalAmount - parseCurrency(form.discountAmount) + parseCurrency(form.taxAmount));

  const handleCreateBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.patientId.trim()) {
      toast.error("Patient ID is required.");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Item description is required.");
      return;
    }
    if (parseCurrency(form.quantity) <= 0 || parseCurrency(form.unitPrice) <= 0) {
      toast.error("Quantity and unit price must be greater than zero.");
      return;
    }

    createBill.mutate({
      patientId: form.patientId.trim(),
      consultationId: form.consultationId.trim() || undefined,
      items: [
        {
          itemType: form.itemType,
          description: form.description.trim(),
          quantity: Number.parseInt(form.quantity, 10),
          unitPrice: parseCurrency(form.unitPrice).toString(),
        },
      ],
      discountAmount: parseCurrency(form.discountAmount).toString(),
      taxAmount: parseCurrency(form.taxAmount).toString(),
    });
  };

  const setField = (field: keyof BillFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-2">Generate invoices, track payments, and export billing history.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => billsQuery.refetch()} disabled={billsQuery.isFetching} className="shadow-sm">
            <RefreshCcw className={`mr-2 h-4 w-4 ${billsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {isAdmin ? (
            <Button
              variant="outline"
              onClick={() => exportBillingCsv.mutate()}
              disabled={exportBillingCsv.isPending || bills.length === 0}
              className="shadow-sm"
            >
              {exportBillingCsv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export Billing CSV
            </Button>
          ) : null}
          <Button onClick={() => setShowNewBill((value) => !value)}>
            <Plus className="mr-2 h-4 w-4" />
            New Bill
          </Button>
        </div>
      </div>

      {showNewBill && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Invoice</CardTitle>
            <CardDescription>Generate a bill for consultation, procedure, or medicine charges.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleCreateBill}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="patientId">Patient ID *</Label>
                  <Input id="patientId" value={form.patientId} onChange={(event) => setField("patientId", event.target.value)} placeholder="PAT-ABC12345" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="consultationId">Consultation ID</Label>
                  <Input id="consultationId" value={form.consultationId} onChange={(event) => setField("consultationId", event.target.value)} placeholder="CON-1704067200000-ABC123" />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="font-semibold">Bill Item</Label>
                <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-[180px_1fr_120px_160px]">
                  <div className="space-y-2">
                    <Label>Item Type</Label>
                    <Select value={form.itemType} onValueChange={(value) => setField("itemType", value)}>
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
                    <Label htmlFor="description">Description *</Label>
                    <Input id="description" value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Consultation fee" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Qty *</Label>
                    <Input id="quantity" type="number" min="1" value={form.quantity} onChange={(event) => setField("quantity", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unitPrice">Unit Price *</Label>
                    <Input id="unitPrice" type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => setField("unitPrice", event.target.value)} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="discount">Discount Amount</Label>
                  <Input id="discount" type="number" min="0" step="0.01" value={form.discountAmount} onChange={(event) => setField("discountAmount", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax">Tax Amount</Label>
                  <Input id="tax" type="number" min="0" step="0.01" value={form.taxAmount} onChange={(event) => setField("taxAmount", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total">Final Amount</Label>
                  <Input id="total" value={`₹${finalAmount.toFixed(2)}`} disabled className="bg-muted" />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" className="flex-1" disabled={createBill.isPending}>
                  {createBill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  Create Invoice
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowNewBill(false)} disabled={createBill.isPending}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
          <CardDescription>
            {billsQuery.isLoading ? "Loading billing history..." : `${bills.length} invoice(s) total`}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
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
                    <tr key={bill.billId} className="border-b hover:bg-accent">
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
                            <Button variant="ghost" size="sm" onClick={() => exportBillingCsv.mutate()} disabled={exportBillingCsv.isPending} aria-label="Export billing CSV">
                              {exportBillingCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => openInvoicePdf(bill)} disabled={getInvoiceLink.isPending}>
                            View PDF
                          </Button>
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{summary.totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">₹{summary.pendingAmount.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
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
