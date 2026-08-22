import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, CheckCircle, XCircle, Loader2, Upload, Zap, History, PackageCheck, Download, FileText, ClipboardList, Clock3 } from "lucide-react";
import { jsPDF } from "jspdf";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import {
  createPurchaseOrderReviewPrefill,
  qualitativeConfidenceLabel,
  type PurchaseOrderReviewLine,
  type PurchaseOrderReviewPrefill,
  type ReviewField,
  updateReviewField,
} from "@shared/poReviewPrefill";

export default function PurchaseOrders() {
  const { user } = useAuth();
  const { hasAccess } = useFeatureAccess();
  const canReceiveStock = hasAccess("purchase_orders");
  const showAlert = (title: string, message: string) => {
    console.log(`${title}: ${message}`);
  };
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    vendorName: "",
    vendorContactNumber: "",
    vendorEmail: "",
    vendorGSTNumber: "",
    vendorBankDetails: "",
    vendorAddress: "",
    expectedDeliveryDate: "",
    notes: "",
    items: [{ itemName: "", quantity: 1, unitPrice: "" }],
  });
  const [reviewPrefill, setReviewPrefill] = useState<PurchaseOrderReviewPrefill | null>(null);
  const [ocrError, setOcrError] = useState("");
  const [historyPurchaseOrder, setHistoryPurchaseOrder] = useState<{ id: string; vendorName: string } | null>(null);
  const [receivePurchaseOrderId, setReceivePurchaseOrderId] = useState<string | null>(null);
  const [receiveForm, setReceiveForm] = useState<{ goodsReceiptId: string; lines: Record<string, { receivedQuantity: string; batchNumber: string; expiryDate: string; unitCost: string }> }>({ goodsReceiptId: "", lines: {} });
  const [receiveErrors, setReceiveErrors] = useState<Record<string, { batch?: string; expiry?: string }>>({});
  const [receiveFormError, setReceiveFormError] = useState("");

  const { data: purchaseOrders, isLoading, refetch } = trpc.purchaseOrders.getAll.useQuery();
  const { data: purchaseOrderMetrics, isLoading: isMetricsLoading } = trpc.purchaseOrders.getMetrics.useQuery();
  const createPO = trpc.purchaseOrders.create.useMutation();
  const updatePaymentStatus = trpc.purchaseOrders.updatePaymentStatus.useMutation();
  const extractDocument = trpc.ocr.extractDocument.useMutation();
  const parseOcrText = trpc.poParsing.parseOcrText.useMutation();
  const recordCorrectionReview = trpc.purchaseOrders.recordCorrectionReview.useMutation();
  const { data: receiptSummary, isLoading: isReceiptSummaryLoading } = trpc.purchaseOrders.getReceiptSummary.useQuery(
    { purchaseOrderId: receivePurchaseOrderId ?? "" },
    { enabled: Boolean(receivePurchaseOrderId) },
  );
  const [lastPostedReceipt, setLastPostedReceipt] = useState<{ goodsReceiptId: string; purchaseOrderId: string; lines: any[] } | null>(null);

  const receiveStock = trpc.purchaseOrders.receiveStock.useMutation({
    onSuccess: (data) => {
      setLastPostedReceipt(data);
      setReceivePurchaseOrderId(null);
      setReceiveForm({ goodsReceiptId: "", lines: {} });
      setReceiveErrors({});
      setReceiveFormError("");
      showAlert("Success", "Goods receipt posted and pharmacy inventory updated successfully.");
      refetch();
    },
    onError: (error) => {
      setReceiveFormError(error.message || "Unable to post the goods receipt. Check the receipt ID and try again.");
      showAlert("Error", error.message || "Failed to post goods receipt");
    },
  });
  const { data: purchaseOrderHistory, isLoading: isHistoryLoading } = trpc.purchaseOrders.getHistory.useQuery(
    { purchaseOrderId: historyPurchaseOrder?.id ?? "" },
    { enabled: Boolean(historyPurchaseOrder) },
  );
  const { data: purchaseOrderReceipts, isLoading: isReceiptsLoading } = trpc.purchaseOrders.getGoodsReceipts.useQuery(
    { purchaseOrderId: historyPurchaseOrder?.id ?? "" },
    { enabled: Boolean(historyPurchaseOrder) },
  );
  const approvePO = trpc.purchaseOrders.approve.useMutation({
    onSuccess: () => {
      showAlert("Success", "Purchase Order approved");
      refetch();
    },
    onError: (error) => {
      showAlert("Error", error.message || "Failed to approve PO");
    },
  });
  const rejectPO = trpc.purchaseOrders.reject.useMutation({
    onSuccess: () => {
      showAlert("Success", "Purchase Order rejected");
      refetch();
    },
    onError: (error) => {
      showAlert("Error", error.message || "Failed to reject PO");
    },
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterApprovalStatus, setFilterApprovalStatus] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<{[key: string]: string}>({});
  const [showOCRDialog, setShowOCRDialog] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrImageFile, setOcrImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageRotation, setImageRotation] = useState(0);
  const [authorizationNotes, setAuthorizationNotes] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!receiptSummary) return;
    setReceiveForm((current) => ({
      goodsReceiptId: current.goodsReceiptId || `GR-${Date.now()}`,
      lines: Object.fromEntries(receiptSummary.items.map((item: any) => [item.poItemId, {
        receivedQuantity: item.remainingQuantity > 0 ? String(item.remainingQuantity) : "0",
        batchNumber: "",
        expiryDate: "",
        unitCost: String(item.unitPrice ?? ""),
      }])),
    }));
  }, [receiptSummary]);

  const handleImageSelect = (file: File | null) => {
    setOcrError("");
    setReviewPrefill(null);
    setOcrImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
        setImageRotation(0);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
      setImageRotation(0);
    }
  };

  const filteredPOs = (purchaseOrders || []).filter((po: any) => {
    const matchesSearch =
      !searchTerm.trim() ||
      po.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.purchaseOrderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.vendorContactNumber.includes(searchTerm);
    const matchesStatus = !filterStatus || filterStatus === "all" || po.paymentStatus === filterStatus;
    const matchesApproval = !filterApprovalStatus || filterApprovalStatus === "all" || po.approvalStatus === filterApprovalStatus;
    return matchesSearch && matchesStatus && matchesApproval;
  });

  const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const handleExportCsv = () => {
    if (filteredPOs.length === 0) {
      showAlert("Export", "There are no purchase orders matching the current filters.");
      return;
    }
    const headers = ["PO ID", "Vendor Name", "Contact", "Total Amount", "Payment Status", "Order Date", "Approval Status"];
    const rows = filteredPOs.map((po: any) => [
      po.purchaseOrderId,
      po.vendorName,
      po.vendorContactNumber,
      po.totalAmount,
      po.paymentStatus,
      po.orderDate,
      po.approvalStatus,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showAlert("Success", `${filteredPOs.length} filtered purchase order(s) exported as CSV.`);
  };

  const handleExportPdf = () => {
    if (filteredPOs.length === 0) {
      showAlert("Export", "There are no purchase orders matching the current filters.");
      return;
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Purchase Orders Export", 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()} · ${filteredPOs.length} filtered order(s)`, 14, 23);
    const columns = ["PO ID", "Vendor", "Contact", "Total", "Payment", "Order Date", "Approval"];
    const xPositions = [14, 48, 105, 145, 178, 214, 250];
    doc.setFont("helvetica", "bold");
    columns.forEach((column, index) => doc.text(column, xPositions[index], 33));
    doc.setFont("helvetica", "normal");
    let y = 40;
    filteredPOs.forEach((po: any) => {
      if (y > 190) {
        doc.addPage();
        y = 18;
      }
      const values = [
        String(po.purchaseOrderId ?? "").substring(0, 16),
        String(po.vendorName ?? "").substring(0, 28),
        String(po.vendorContactNumber ?? "").substring(0, 18),
        String(po.totalAmount ?? ""),
        String(po.paymentStatus ?? ""),
        String(po.orderDate ?? "").substring(0, 10),
        String(po.approvalStatus ?? "").substring(0, 18),
      ];
      values.forEach((value, index) => doc.text(value, xPositions[index], y));
      y += 7;
    });
    doc.save(`purchase-orders-${new Date().toISOString().slice(0, 10)}.pdf`);
    showAlert("Success", `${filteredPOs.length} filtered purchase order(s) exported as PDF.`);
  };

  const getApprovalBadge = (status: string) => {
    switch (status) {
      case "Pending Approval":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending Approval</Badge>;
      case "Approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "Rejected":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default:
        return null;
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { itemName: "", quantity: 1, unitPrice: "" }],
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => {
      const price = parseFloat(item.unitPrice || "0");
      return sum + price * (item.quantity || 1);
    }, 0);
  };

  const updateReviewHeaderField = (field: keyof PurchaseOrderReviewPrefill["header"], value: string) => {
    setReviewPrefill((current) => current ? {
      ...current,
      header: { ...current.header, [field]: updateReviewField(current.header[field], value) },
    } : current);
  };

  const updateReviewTotalField = (field: keyof PurchaseOrderReviewPrefill["totals"], value: string) => {
    setReviewPrefill((current) => current ? {
      ...current,
      totals: { ...current.totals, [field]: updateReviewField(current.totals[field], value) },
    } : current);
  };

  const updateReviewLineField = (lineIndex: number, field: keyof PurchaseOrderReviewLine, value: string) => {
    setReviewPrefill((current) => {
      if (!current) return current;
      const items = current.items.map((line, index) => index === lineIndex
        ? { ...line, [field]: updateReviewField(line[field], value) }
        : line,
      );
      return { ...current, items };
    });
  };

  const getEditedReviewFields = () => {
    if (!reviewPrefill) return [];
    const fields: Array<[string, ReviewField]> = [
      ...Object.entries(reviewPrefill.header).map(([name, field]) => [`header.${name}`, field as ReviewField] as [string, ReviewField]),
      ...Object.entries(reviewPrefill.totals).map(([name, field]) => [`totals.${name}`, field as ReviewField] as [string, ReviewField]),
      ...reviewPrefill.items.flatMap((item, itemIndex) => Object.entries(item).map(([name, field]) => [`items.${itemIndex}.${name}`, field as ReviewField] as [string, ReviewField])),
    ];
    return fields.filter(([, field]) => field.edited).map(([name]) => name);
  };

  const applyReviewedPrefillToForm = () => {
    if (!reviewPrefill) return;
    setFormData({
      vendorName: reviewPrefill.header.vendorName.value,
      vendorContactNumber: "",
      vendorEmail: "",
      vendorGSTNumber: reviewPrefill.header.vendorGstin.value,
      vendorBankDetails: "",
      vendorAddress: "",
      expectedDeliveryDate: "",
      notes: [
        `Source document: ${reviewPrefill.documentType.replaceAll("_", " ")}`,
        reviewPrefill.header.invoiceNumber.value ? `Invoice/PO: ${reviewPrefill.header.invoiceNumber.value}` : "",
        reviewPrefill.header.invoiceDate.value ? `Date: ${reviewPrefill.header.invoiceDate.value}` : "",
        reviewPrefill.warnings.length > 0 ? `Review warnings: ${reviewPrefill.warnings.join(" | ")}` : "",
      ].filter(Boolean).join(" | "),
      items: reviewPrefill.items.length > 0
        ? reviewPrefill.items.map((item) => ({
            itemName: item.description.value,
            quantity: Number(item.quantity.value) || 0,
            unitPrice: item.unitPrice.value,
          }))
        : [{ itemName: "", quantity: 1, unitPrice: "" }],
    });
    setIsAuthorized(false);
    setShowOCRDialog(false);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vendorName || !formData.vendorContactNumber || formData.items.length === 0) {
      showAlert("Error", "Please fill in all required fields");
      return;
    }
    if (formData.items.some((item) => !item.itemName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0)) {
      showAlert("Error", "Each item needs a name, a positive whole-number quantity, and a valid unit price.");
      return;
    }

    try {
      const createdPurchaseOrder = await createPO.mutateAsync({
        vendorName: formData.vendorName,
        vendorContactNumber: formData.vendorContactNumber,
        vendorEmail: formData.vendorEmail || undefined,
        vendorGSTNumber: formData.vendorGSTNumber || undefined,
        vendorBankDetails: formData.vendorBankDetails || undefined,
        vendorAddress: formData.vendorAddress || undefined,
        totalAmount: calculateTotal().toString(),
        expectedDeliveryDate: formData.expectedDeliveryDate || undefined,
        notes: formData.notes || undefined,
        items: formData.items.map((item) => ({
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        authorizationNotes: authorizationNotes || undefined,
      });

      const editedReviewFields = getEditedReviewFields();
      if (editedReviewFields.length > 0 && reviewPrefill) {
        await recordCorrectionReview.mutateAsync({
          purchaseOrderId: createdPurchaseOrder.purchaseOrderId,
          verifiedFields: editedReviewFields,
          confidenceSnapshot: {
            workflow: "deterministic-ocr-parser-review",
            documentType: reviewPrefill.documentType,
            reconciliation: reviewPrefill.reconciliation,
          },
        });
      }

      showAlert("Success", "Purchase order created successfully");
      setFormData({
        vendorName: "",
        vendorContactNumber: "",
        vendorEmail: "",
        vendorGSTNumber: "",
        vendorBankDetails: "",
        vendorAddress: "",
        expectedDeliveryDate: "",
        notes: "",
        items: [{ itemName: "", quantity: 1, unitPrice: "" }],
      });
      setReviewPrefill(null);
      setShowForm(false);
      refetch();
    } catch (error) {
      showAlert("Error", "Failed to create purchase order");
    }
  };

  const handlePaymentStatusChange = async (poId: string, status: string) => {
    try {
      await updatePaymentStatus.mutateAsync({
        purchaseOrderId: poId,
        paymentStatus: status as "Pending" | "Paid" | "Partial",
      });
      showAlert("Success", "Payment status updated");
      refetch();
    } catch (error) {
      showAlert("Error", "Failed to update payment status");
    }
  };

  const openReceiveStock = (purchaseOrderId: string) => {
    setReceivePurchaseOrderId(purchaseOrderId);
    setReceiveForm({ goodsReceiptId: `GR-${Date.now()}`, lines: {} });
    setReceiveErrors({});
    setReceiveFormError("");
  };

  const handleReceiveStockSubmit = () => {
    if (!receivePurchaseOrderId || !receiptSummary) return;
    const lines = receiptSummary.items
      .map((item: any) => ({ item, formLine: receiveForm.lines[item.poItemId] }))
      .filter(({ formLine }) => Number(formLine?.receivedQuantity ?? 0) > 0)
      .map(({ item, formLine }) => ({
        poItemId: item.poItemId,
        receivedQuantity: Number(formLine.receivedQuantity),
        batchNumber: formLine.batchNumber.trim(),
        expiryDate: formLine.expiryDate,
        unitCost: formLine.unitCost || undefined,
      }));

    if (!receiveForm.goodsReceiptId.trim()) {
      setReceiveFormError("Enter a goods receipt ID before posting.");
      return;
    }
    if (lines.length === 0) {
      setReceiveFormError("Enter a positive quantity for at least one item.");
      return;
    }

    const nextErrors: Record<string, { batch?: string; expiry?: string }> = {};
    for (const line of lines) {
      const errors: { batch?: string; expiry?: string } = {};
      if (!line.batchNumber) errors.batch = "Batch number is required.";
      if (!line.expiryDate) {
        errors.expiry = "Expiry date is required.";
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(line.expiryDate)) {
        errors.expiry = "Use a valid expiry date in YYYY-MM-DD format.";
      } else {
        const expiry = new Date(`${line.expiryDate}T00:00:00.000Z`);
        if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== line.expiryDate) {
          errors.expiry = "Enter a real calendar date.";
        }
      }
      if (errors.batch || errors.expiry) nextErrors[line.poItemId] = errors;
    }
    setReceiveErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setReceiveFormError("Fix the highlighted batch and expiry fields before posting.");
      return;
    }
    setReceiveFormError("");

    receiveStock.mutate({
      goodsReceiptId: receiveForm.goodsReceiptId.trim(),
      purchaseOrderId: receivePurchaseOrderId,
      lines,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-800";
      case "Partial":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-red-100 text-red-800";
    }
  };

  const confidenceBadgeClass: Record<ReturnType<typeof qualitativeConfidenceLabel>, string> = {
    HIGH: "bg-emerald-100 text-emerald-800 border-emerald-200",
    MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
    LOW: "bg-rose-100 text-rose-800 border-rose-200",
  };

  const renderReviewField = (
    label: string,
    field: ReviewField,
    onChange: (value: string) => void,
    type = "text",
  ) => {
    const confidenceLabel = qualitativeConfidenceLabel(field.confidence);
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium">{label}</Label>
          <Badge variant="outline" className={`text-[10px] ${confidenceBadgeClass[confidenceLabel]}`}>
            {confidenceLabel}
          </Badge>
        </div>
        <Input
          type={type}
          value={field.value}
          onChange={(event) => onChange(event.target.value)}
          className={field.confidence === "low" ? "border-rose-300 bg-rose-50" : ""}
          aria-label={`${label} extracted review value`}
        />
        {field.sourceText && (
          <p className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
            <span className="font-medium">Source text:</span> {field.sourceText}
          </p>
        )}
        {field.edited && <p className="text-[11px] font-medium text-teal-700">User corrected this extracted value.</p>}
        {field.warnings.map((warning) => <p key={warning} className="text-[11px] text-amber-700">{warning}</p>)}
      </div>
    );
  };

  const handleOCRImageUpload = async (file: File) => {
    if (!file) return;
    setOcrLoading(true);
    setOcrError("");
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Unable to read the selected image."));
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(file);
      });
      const ocrResult = await extractDocument.mutateAsync({
        data: imageData,
        mimeType: file.type || "application/octet-stream",
      });
      const parsedDocument = await parseOcrText.mutateAsync({ fullText: ocrResult.fullText });
      setReviewPrefill(createPurchaseOrderReviewPrefill(parsedDocument));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const safeInputError = /PDF OCR is not supported|Unsupported MIME type|empty file|maximum allowed limit|Malformed data URI/i.test(message);
      setOcrError(safeInputError ? message : "OCR extraction failed. Try another JPEG or PNG image, or enter the purchase order manually.");
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Purchase Orders</h1>
          <p className="text-gray-600 mt-1">Manage vendor purchase orders and payments</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowOCRDialog(true)} className="bg-blue-600 hover:bg-blue-700">
            <Zap className="w-4 h-4 mr-2" /> Scan PO
          </Button>
          <Button onClick={() => setShowForm(!showForm)} className="bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4 mr-2" /> New Purchase Order
          </Button>
        </div>
      </div>

      {showOCRDialog && (
        <Dialog open={showOCRDialog} onOpenChange={(open) => {
          setShowOCRDialog(open);
          if (!open) {
            setOcrError("");
            setReviewPrefill(null);
          }
        }}>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Scan Purchase Order for Review</DialogTitle>
              <DialogDescription>
                JPEG and PNG documents are extracted with OCR, then parsed deterministically. Nothing is created until you explicitly submit the reviewed PO form.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {!reviewPrefill && (
                <>
                  <div
                    className="cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition hover:border-teal-400 hover:bg-teal-50"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                    <p className="text-sm text-slate-700">Select a JPEG or PNG purchase order or invoice image.</p>
                    <p className="mt-1 text-xs text-slate-500">PDF OCR is deferred and will be rejected safely.</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={(event) => handleImageSelect(event.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {ocrImageFile && <p className="mt-2 text-sm text-teal-700">Selected: {ocrImageFile.name}</p>}
                  </div>
                  {imagePreview && (
                    <div className="space-y-3">
                      <div className="overflow-hidden rounded-lg border bg-slate-50">
                        <img
                          src={imagePreview}
                          alt="Selected purchase order preview"
                          className="max-h-64 w-full object-contain"
                          style={{ transform: `rotate(${imageRotation}deg)` }}
                        />
                      </div>
                      <div className="flex justify-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setImageRotation((previous) => (previous + 90) % 360)}>
                          Rotate
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleImageSelect(null)}>
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}
                  {ocrError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{ocrError}</div>}
                  <Button
                    type="button"
                    onClick={() => ocrImageFile && handleOCRImageUpload(ocrImageFile)}
                    disabled={!ocrImageFile || ocrLoading}
                    className="w-full bg-teal-600 hover:bg-teal-700"
                  >
                    {ocrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    {ocrLoading ? "Extracting and parsing…" : "Extract for human review"}
                  </Button>
                </>
              )}

              {reviewPrefill && (
                <div className="space-y-5">
                  <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
                    <p className="font-semibold">Human review required</p>
                    <p className="mt-1">This deterministic prefill is editable. Continuing only opens the PO form; it does not create, approve, receive, or stock any record.</p>
                  </div>

                  {reviewPrefill.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <h3 className="font-semibold text-amber-900">Review warnings</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                        {reviewPrefill.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </div>
                  )}

                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Document header</h3>
                      <Badge variant="outline">{reviewPrefill.documentType.replaceAll("_", " ")}</Badge>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {renderReviewField("Invoice / PO number", reviewPrefill.header.invoiceNumber, (value) => updateReviewHeaderField("invoiceNumber", value))}
                      {renderReviewField("Invoice date", reviewPrefill.header.invoiceDate, (value) => updateReviewHeaderField("invoiceDate", value))}
                      {renderReviewField("Vendor name", reviewPrefill.header.vendorName, (value) => updateReviewHeaderField("vendorName", value))}
                      {renderReviewField("GSTIN", reviewPrefill.header.vendorGstin, (value) => updateReviewHeaderField("vendorGstin", value))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="font-semibold">Extracted line items</h3>
                    {reviewPrefill.items.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-4 text-sm text-slate-600">No line items were extracted. You can add them manually in the PO form.</p>
                    ) : reviewPrefill.items.map((item, index) => (
                      <div key={index} className="space-y-3 rounded-lg border p-4">
                        <p className="text-sm font-medium">Line {index + 1}</p>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                          {renderReviewField("Description", item.description, (value) => updateReviewLineField(index, "description", value))}
                          {renderReviewField("HSN / SAC", item.hsnCode, (value) => updateReviewLineField(index, "hsnCode", value))}
                          {renderReviewField("Batch", item.batchNumber, (value) => updateReviewLineField(index, "batchNumber", value))}
                          {renderReviewField("Expiry", item.expiryDate, (value) => updateReviewLineField(index, "expiryDate", value))}
                          {renderReviewField("Quantity", item.quantity, (value) => updateReviewLineField(index, "quantity", value), "number")}
                          {renderReviewField("Unit price", item.unitPrice, (value) => updateReviewLineField(index, "unitPrice", value), "number")}
                          {renderReviewField("Discount", item.discount, (value) => updateReviewLineField(index, "discount", value), "number")}
                          {renderReviewField("GST %", item.gstRate, (value) => updateReviewLineField(index, "gstRate", value), "number")}
                          {renderReviewField("Taxable amount", item.taxableAmount, (value) => updateReviewLineField(index, "taxableAmount", value), "number")}
                          {renderReviewField("Line total", item.lineTotal, (value) => updateReviewLineField(index, "lineTotal", value), "number")}
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="space-y-3">
                    <h3 className="font-semibold">Extracted totals</h3>
                    <div className="grid gap-3 md:grid-cols-3">
                      {renderReviewField("Subtotal / taxable value", reviewPrefill.totals.subtotal, (value) => updateReviewTotalField("subtotal", value), "number")}
                      {renderReviewField("CGST", reviewPrefill.totals.cgst, (value) => updateReviewTotalField("cgst", value), "number")}
                      {renderReviewField("SGST", reviewPrefill.totals.sgst, (value) => updateReviewTotalField("sgst", value), "number")}
                      {renderReviewField("IGST", reviewPrefill.totals.igst, (value) => updateReviewTotalField("igst", value), "number")}
                      {renderReviewField("Total tax", reviewPrefill.totals.totalTax, (value) => updateReviewTotalField("totalTax", value), "number")}
                      {renderReviewField("Grand total", reviewPrefill.totals.grandTotal, (value) => updateReviewTotalField("grandTotal", value), "number")}
                    </div>
                  </section>

                  <section className="rounded-lg border bg-slate-50 p-4">
                    <h3 className="font-semibold">Arithmetic reconciliation</h3>
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      {[
                        ["Line totals", reviewPrefill.reconciliation.lineTotalsMatch],
                        ["Subtotal", reviewPrefill.reconciliation.subtotalMatches],
                        ["Tax", reviewPrefill.reconciliation.taxMatches],
                        ["Grand total", reviewPrefill.reconciliation.grandTotalMatches],
                      ].map(([label, status]) => (
                        <div key={String(label)} className="flex items-center justify-between rounded border bg-white px-3 py-2">
                          <span>{label}</span>
                          <Badge className={status === true ? "bg-emerald-600" : status === false ? "bg-rose-600" : "bg-slate-500"}>
                            {status === true ? "MATCH" : status === false ? "REVIEW" : "NOT AVAILABLE"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    {reviewPrefill.reconciliation.delta !== undefined && <p className="mt-3 text-sm text-slate-700">Reported reconciliation difference: ₹{reviewPrefill.reconciliation.delta.toFixed(2)}</p>}
                  </section>

                  <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                    <Button type="button" variant="outline" onClick={() => handleImageSelect(null)}>Re-scan / upload another image</Button>
                    <Button type="button" variant="outline" onClick={() => setShowOCRDialog(false)}>Cancel</Button>
                    <Button type="button" className="bg-teal-600 hover:bg-teal-700" onClick={applyReviewedPrefillToForm}>Review &amp; continue to PO form</Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Purchase Order</CardTitle>
            <CardDescription>Enter vendor details and items</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {reviewPrefill && (
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
                  <p className="font-semibold">Deterministic scan prefill is under review</p>
                  <p className="mt-1">The final submission will create only a Pending Approval purchase order. OCR and parsing did not create, approve, receive, or stock anything.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Vendor Name *</Label>
                  <Input
                    value={formData.vendorName}
                    onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
                    placeholder="Enter vendor name"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Contact Number *</Label>
                  <Input
                    value={formData.vendorContactNumber}
                    onChange={(e) => setFormData({ ...formData, vendorContactNumber: e.target.value })}
                    placeholder="Enter contact number"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Email</Label>
                  </div>
                  <Input
                    type="email"
                    value={formData.vendorEmail}
                    onChange={(e) => setFormData({ ...formData, vendorEmail: e.target.value })}
                    placeholder="Enter email"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">GST Number</Label>
                  <Input
                    value={formData.vendorGSTNumber}
                    onChange={(e) => setFormData({ ...formData, vendorGSTNumber: e.target.value })}
                    placeholder="Enter GST number"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="mb-2 block">Address</Label>
                  <Textarea
                    value={formData.vendorAddress}
                    onChange={(e) => setFormData({ ...formData, vendorAddress: e.target.value })}
                    placeholder="Enter vendor address"
                  />
                </div>
                <div>
                  <Label>Bank Details</Label>
                  <Textarea
                    value={formData.vendorBankDetails}
                    onChange={(e) => setFormData({ ...formData, vendorBankDetails: e.target.value })}
                    placeholder="Enter bank details"
                    className="h-20"
                  />
                </div>
                <div>
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={formData.expectedDeliveryDate}
                    onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Enter any additional notes"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Items *</h3>
                  <Button type="button" onClick={handleAddItem} variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" /> Add Item
                  </Button>
                </div>

                {formData.items.map((item, index) => {
                  return (
                  <div key={index} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="mb-1 block text-xs">Item Name</Label>
                      <Input
                        value={item.itemName}
                        onChange={(e) => handleItemChange(index, "itemName", e.target.value)}
                        placeholder="Item name"
                      />
                    </div>
                    <div className="w-24">
                      <Label className="mb-1 block text-xs">Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="w-32">
                      <Label className="mb-1 block text-xs">Unit Price</Label>
                      <Input
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, "unitPrice", e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 mb-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
                })}

                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm font-semibold">Total Amount: ₹{calculateTotal().toFixed(2)}</p>
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-3">Authorization & Approval</h3>
                  <div className="space-y-3">
                    <div>
                      <Label>Authorization Notes</Label>
                      <Textarea
                        value={authorizationNotes}
                        onChange={(e) => setAuthorizationNotes(e.target.value)}
                        placeholder="Add any notes or conditions for this PO approval..."
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="authorize"
                        checked={isAuthorized}
                        onChange={(e) => setIsAuthorized(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <label htmlFor="authorize" className="text-sm font-medium text-gray-700">
                        I authorize this Purchase Order and confirm all details are correct
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  className="bg-teal-600 hover:bg-teal-700"
                  disabled={!isAuthorized}
                >
                  {isAuthorized ? "Create & Submit PO" : "Authorize to Submit"}
                </Button>
                <Button type="button" onClick={() => {
                  setShowForm(false);
                  setAuthorizationNotes("");
                  setIsAuthorized(false);
                }} variant="outline">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(historyPurchaseOrder)} onOpenChange={(open) => !open && setHistoryPurchaseOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Purchase Order History</DialogTitle>
            <DialogDescription>
              {historyPurchaseOrder ? `Recorded approval and review events for ${historyPurchaseOrder.vendorName}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {isHistoryLoading || isReceiptsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading status and stock receipt timeline…
              </div>
            ) : (!purchaseOrderHistory || purchaseOrderHistory.length === 0) && (!purchaseOrderReceipts || purchaseOrderReceipts.length === 0) ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No status changes or stock receipts are recorded for this purchase order.</div>
            ) : (
              <div className="relative space-y-4 pl-7 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-teal-200">
                {[
                  ...(purchaseOrderHistory ?? []).map((entry: any) => ({
                    key: `history-${entry.historyId}`,
                    date: entry.createdAt,
                    title: entry.eventSummary,
                    actor: entry.actorName || entry.actorId,
                    type: entry.eventType.replaceAll("_", " "),
                    details: entry.details,
                    tone: "bg-teal-600",
                  })),
                  ...(purchaseOrderReceipts ?? []).flatMap((receipt: any) => [
                    {
                      key: `receipt-${receipt.goodsReceiptId}`,
                      date: receipt.receivedAt || receipt.createdAt,
                      title: `Goods receipt ${receipt.goodsReceiptId} posted`,
                      actor: receipt.receivedBy,
                      type: "STOCK RECEIPT",
                      details: null,
                      tone: "bg-emerald-600",
                    },
                    ...((receipt.lines ?? []).map((line: any) => ({
                      key: `receipt-line-${line.goodsReceiptItemId}`,
                      date: line.createdAt || receipt.receivedAt || receipt.createdAt,
                      title: `${line.receivedQuantity} × ${line.itemName} received`,
                      actor: `Batch ${line.batchNumber} · Expiry ${line.expiryDate}`,
                      type: "RECEIPT LINE",
                      details: null,
                      tone: "bg-emerald-400",
                    }))),
                  ]),
                ].sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()).map((entry) => (
                  <div key={entry.key} className="relative rounded-lg border bg-white p-3 shadow-sm">
                    <span className={`absolute -left-[29px] top-4 h-3 w-3 rounded-full ring-4 ring-white ${entry.tone}`} />
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-900">{entry.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{entry.actor} · {new Date(entry.date).toLocaleString()}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">{entry.type}</Badge>
                    </div>
                    {entry.details && <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">{entry.details}</pre>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {lastPostedReceipt && (
        <Card className="mb-6 border-teal-200 bg-teal-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-teal-600" />
                <CardTitle className="text-base text-teal-900">Goods Receipt Posted Successfully</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLastPostedReceipt(null)}>Dismiss</Button>
            </div>
            <CardDescription className="text-teal-700">
              Receipt ID: <span className="font-mono font-medium">{lastPostedReceipt.goodsReceiptId}</span> recorded against PO <span className="font-mono font-medium">{lastPostedReceipt.purchaseOrderId.substring(0, 8)}</span>. Pharmacy inventory has been updated.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border bg-white overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Received Qty</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>New Stock Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lastPostedReceipt.lines.map((l: any) => (
                    <TableRow key={l.goodsReceiptItemId}>
                      <TableCell className="font-medium text-slate-900">{l.itemName}</TableCell>
                      <TableCell>{l.receivedQuantity}</TableCell>
                      <TableCell className="font-mono">{l.batchNumber}</TableCell>
                      <TableCell>{l.expiryDate}</TableCell>
                      <TableCell className="font-semibold text-teal-800">{l.resultingQuantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3" aria-label="Purchase order metrics">
        <Card className="border-sky-100 bg-sky-50/60">
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm font-medium text-sky-700">Total Orders</p>
              <p className="mt-2 text-3xl font-bold text-sky-950">{isMetricsLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : purchaseOrderMetrics?.totalOrders ?? 0}</p>
              <p className="mt-1 text-xs text-sky-700">All purchase orders in this workspace</p>
            </div>
            <span className="rounded-xl bg-white p-3 text-sky-600 shadow-sm"><ClipboardList className="h-5 w-5" /></span>
          </CardContent>
        </Card>
        <Card className="border-amber-100 bg-amber-50/70">
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm font-medium text-amber-700">Pending Approvals</p>
              <p className="mt-2 text-3xl font-bold text-amber-950">{isMetricsLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : purchaseOrderMetrics?.pendingApprovals ?? 0}</p>
              <p className="mt-1 text-xs text-amber-700">Orders waiting for admin review</p>
            </div>
            <span className="rounded-xl bg-white p-3 text-amber-600 shadow-sm"><Clock3 className="h-5 w-5" /></span>
          </CardContent>
        </Card>
        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700">Received Stock</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{isMetricsLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : `${purchaseOrderMetrics?.receivedUnits ?? 0} / ${purchaseOrderMetrics?.orderedUnits ?? 0}`}</p>
                <p className="mt-1 text-xs text-emerald-700">Units received against ordered quantity</p>
              </div>
              <span className="rounded-xl bg-white p-3 text-emerald-600 shadow-sm"><PackageCheck className="h-5 w-5" /></span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100" aria-label={`${purchaseOrderMetrics?.receiptProgressPercent ?? 0}% received`}>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${purchaseOrderMetrics?.receiptProgressPercent ?? 0}%` }} />
            </div>
            <p className="mt-1 text-right text-xs font-medium text-emerald-700">{purchaseOrderMetrics?.receiptProgressPercent ?? 0}% received</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders List</CardTitle>
          <CardDescription>All vendor purchase orders and their payment status</CardDescription>
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="min-w-[260px] flex-1">
              <Input
                placeholder="Search by vendor name, PO ID, or contact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterStatus || "all"} onValueChange={(value) => setFilterStatus(value === "all" ? null : value)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Partial">Partial</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterApprovalStatus || "all"} onValueChange={(value) => setFilterApprovalStatus(value === "all" ? null : value)}>
              <SelectTrigger className="w-[175px]">
                <SelectValue placeholder="Approval Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Approvals</SelectItem>
                <SelectItem value="Pending Approval">Pending Approval</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            {(searchTerm || (filterStatus && filterStatus !== "all") || (filterApprovalStatus && filterApprovalStatus !== "all")) && (
              <Button variant="outline" size="sm" onClick={() => { setSearchTerm(""); setFilterStatus(null); setFilterApprovalStatus(null); }}>
                Clear Filters
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filteredPOs.length === 0}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={filteredPOs.length === 0}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : !purchaseOrders || purchaseOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No purchase orders found</div>
          ) : filteredPOs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No purchase orders match your search or filter</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO ID</TableHead>
                    <TableHead>Vendor Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPOs.map((po: any) => (
                    <TableRow key={po.purchaseOrderId}>
                      <TableCell className="font-mono text-sm">{po.purchaseOrderId.substring(0, 8)}</TableCell>
                      <TableCell>{po.vendorName}</TableCell>
                      <TableCell>{po.vendorContactNumber}</TableCell>
                      <TableCell>₹{parseFloat(String(po.totalAmount)).toFixed(2)}</TableCell>
                      <TableCell>
                        <Select value={po.paymentStatus} onValueChange={(value) => handlePaymentStatusChange(po.purchaseOrderId, value)}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pending">
                              <Badge className="bg-red-100 text-red-800">Pending</Badge>
                            </SelectItem>
                            <SelectItem value="Partial">
                              <Badge className="bg-yellow-100 text-yellow-800">Partial</Badge>
                            </SelectItem>
                            <SelectItem value="Paid">
                              <Badge className="bg-green-100 text-green-800">Paid</Badge>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{new Date(po.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>{getApprovalBadge(po.approvalStatus)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryPurchaseOrder({ id: po.purchaseOrderId, vendorName: po.vendorName })}
                            title="View purchase order history"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          {po.approvalStatus === "Approved" && canReceiveStock && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReceiveStock(po.purchaseOrderId)}
                              className="border-teal-200 text-teal-800 hover:bg-teal-50"
                              title="Receive delivered stock against this approved purchase order"
                            >
                              <PackageCheck className="w-4 h-4" />
                            </Button>
                          )}
                          {po.approvalStatus === "Pending Approval" && user?.role !== "admin" && (
                            <Badge className="bg-yellow-100 text-yellow-800">Awaiting Approval</Badge>
                          )}
                          {po.approvalStatus === "Pending Approval" && user?.role === "admin" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => approvePO.mutate({ purchaseOrderId: po.purchaseOrderId })}
                                disabled={approvePO.isPending}
                                className="border-green-200 text-green-800 hover:bg-green-50"
                                title="Approve this purchase order"
                              >
                                {approvePO.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const reason = prompt("Enter rejection reason (minimum 5 characters):");
                                  if (reason && reason.length >= 5) {
                                    rejectPO.mutate({ purchaseOrderId: po.purchaseOrderId, rejectionReason: reason });
                                  } else if (reason) {
                                    showAlert("Error", "Rejection reason must be at least 5 characters");
                                  }
                                }}
                                disabled={rejectPO.isPending}
                                className="border-red-200 text-red-800 hover:bg-red-50"
                                title="Reject this purchase order"
                              >
                                {rejectPO.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                              </Button>
                            </>
                          )}
                          {po.approvalStatus === "Approved" && (
                            <Badge className="bg-green-100 text-green-800">Approved</Badge>
                          )}
                          {po.approvalStatus === "Rejected" && (
                            <Badge className="bg-red-100 text-red-800">Rejected</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(receivePurchaseOrderId)} onOpenChange={(open) => {
        if (!open) {
          setReceivePurchaseOrderId(null);
          setReceiveErrors({});
          setReceiveFormError("");
        }
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
            <DialogDescription>
              Receive only goods physically delivered against this approved purchase order. Batch number and expiry date are required.
            </DialogDescription>
          </DialogHeader>
          {isReceiptSummaryLoading || !receiptSummary ? (
            <div className="space-y-3 py-8 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-teal-600" />
              <div className="animate-pulse">Loading ordered quantities and previous receipts…</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="goods-receipt-id">Goods receipt ID</Label>
                <Input
                  id="goods-receipt-id"
                  value={receiveForm.goodsReceiptId}
                  onChange={(event) => setReceiveForm((current) => ({ ...current, goodsReceiptId: event.target.value }))}
                  placeholder="GR-2026-0001"
                />
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Ordered</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Receive now</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiptSummary.items.map((item: any) => {
                      const line = receiveForm.lines[item.poItemId] ?? { receivedQuantity: "0", batchNumber: "", expiryDate: "", unitCost: String(item.unitPrice ?? "") };
                      const disabled = item.remainingQuantity <= 0;
                      return (
                        <TableRow key={item.poItemId}>
                          <TableCell className="font-medium">{item.itemName}</TableCell>
                          <TableCell>{item.orderedQuantity}</TableCell>
                          <TableCell>{item.receivedQuantity}</TableCell>
                          <TableCell>{item.remainingQuantity}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={item.remainingQuantity}
                              value={line.receivedQuantity}
                              disabled={disabled}
                              onChange={(event) => {
                                setReceiveForm((current) => ({
                                  ...current,
                                  lines: { ...current.lines, [item.poItemId]: { ...line, receivedQuantity: event.target.value } },
                                }));
                                setReceiveFormError("");
                              }}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={line.batchNumber}
                              disabled={disabled}
                              aria-invalid={Boolean(receiveErrors[item.poItemId]?.batch)}
                              onChange={(event) => {
                                setReceiveForm((current) => ({
                                  ...current,
                                  lines: { ...current.lines, [item.poItemId]: { ...line, batchNumber: event.target.value } },
                                }));
                                setReceiveErrors((current) => ({ ...current, [item.poItemId]: { ...current[item.poItemId], batch: undefined } }));
                                setReceiveFormError("");
                              }}
                              placeholder="Batch"
                              className={`w-28 ${receiveErrors[item.poItemId]?.batch ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                            />
                            {receiveErrors[item.poItemId]?.batch && <p className="mt-1 text-xs text-red-600" role="alert">{receiveErrors[item.poItemId]?.batch}</p>}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={line.expiryDate}
                              disabled={disabled}
                              aria-invalid={Boolean(receiveErrors[item.poItemId]?.expiry)}
                              onChange={(event) => {
                                setReceiveForm((current) => ({
                                  ...current,
                                  lines: { ...current.lines, [item.poItemId]: { ...line, expiryDate: event.target.value } },
                                }));
                                setReceiveErrors((current) => ({ ...current, [item.poItemId]: { ...current[item.poItemId], expiry: undefined } }));
                                setReceiveFormError("");
                              }}
                              className={`w-36 ${receiveErrors[item.poItemId]?.expiry ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                            />
                            {receiveErrors[item.poItemId]?.expiry && <p className="mt-1 text-xs text-red-600" role="alert">{receiveErrors[item.poItemId]?.expiry}</p>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {receiveFormError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{receiveFormError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReceivePurchaseOrderId(null)} disabled={receiveStock.isPending}>Cancel</Button>
                <Button onClick={handleReceiveStockSubmit} disabled={receiveStock.isPending || !canReceiveStock}>
                  {receiveStock.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
                  {receiveStock.isPending ? "Posting receipt…" : "Post goods receipt"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
