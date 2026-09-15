import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileSearch, Loader2, PackageCheck, Upload, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  qualitativeConfidenceLabel,
  type ReviewField,
  updateReviewField,
} from "@shared/poReviewPrefill";
import {
  createGoodsReceiptReviewPrefill,
  type GoodsReceiptReviewPrefill,
} from "@shared/goodsReceiptReview";
import type { CatalogMatchLevel, CatalogMatchSource } from "@shared/catalogResolution";

type CatalogDecision = { lineIndex: number; decision: "ACCEPTED" | "UNMATCHED"; catalogItemId?: string };
type CatalogSuggestion = {
  catalogItemId: string;
  canonicalName: string;
  matchLevel: CatalogMatchLevel;
  source: CatalogMatchSource;
  reasons: string[];
  conflicts: string[];
};

const supportedMimes = new Set(["image/jpeg", "image/png", "application/pdf"]);

function ReviewInput({ label, field, onChange, type = "text" }: {
  label: string;
  field: ReviewField;
  onChange: (value: string) => void;
  type?: string;
}) {
  const confidence = qualitativeConfidenceLabel(field.confidence);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-slate-700">{label}</Label>
        <Badge variant="outline" className="text-[10px]">{confidence}</Badge>
      </div>
      <Input type={type} value={field.value} onChange={(event) => onChange(event.target.value)} className={field.confidence === "low" ? "border-amber-400 bg-amber-50" : ""} />
      {field.edited && <p className="text-[11px] font-medium text-teal-700">Reviewed correction</p>}
      {field.warnings.map((warning) => <p key={warning} className="text-[11px] text-amber-700">{warning}</p>)}
    </div>
  );
}

function CatalogCategoryControl({ lineIndex, description, hsnCode, decision, onDecision }: {
  lineIndex: number;
  description: string;
  hsnCode: string;
  decision?: CatalogDecision;
  onDecision: (decision: CatalogDecision) => void;
}) {
  const input = useMemo(() => ({ lineDescription: description, ...(hsnCode.trim() ? { hsnCode: hsnCode.trim() } : {}) }), [description, hsnCode]);
  const { data: suggestions, isFetching } = trpc.catalogMatching.suggestMatches.useQuery(input, { enabled: description.trim().length > 0 });
  const selected = decision?.decision === "ACCEPTED" ? decision.catalogItemId : undefined;

  return (
    <section className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-indigo-950">Inventory category / governed medicine</p>
          <p className="mt-0.5 text-[11px] text-indigo-800">Select one curated catalog item before this line can update stock.</p>
        </div>
        {selected ? <Badge className="bg-teal-700">Mapped</Badge> : <Badge variant="outline">Required</Badge>}
      </div>
      {isFetching && <p className="mt-2 flex items-center gap-1 text-xs text-indigo-800"><Loader2 className="h-3 w-3 animate-spin" /> Finding catalog matches…</p>}
      {!isFetching && suggestions?.map((suggestion: CatalogSuggestion) => {
        const conflicted = suggestion.conflicts.length > 0;
        const active = selected === suggestion.catalogItemId;
        return (
          <div key={suggestion.catalogItemId} className="mt-2 rounded border border-indigo-100 bg-white p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-900">{suggestion.canonicalName}</p>
                <p className="text-[10px] text-slate-500">{suggestion.matchLevel} · {suggestion.source.replaceAll("_", " ")}</p>
              </div>
              <Button type="button" size="sm" variant={active ? "default" : "outline"} disabled={conflicted} onClick={() => onDecision({ lineIndex, decision: "ACCEPTED", catalogItemId: suggestion.catalogItemId })}>
                {active ? "Selected" : "Use"}
              </Button>
            </div>
            {conflicted && <p className="mt-1 text-[10px] text-rose-700">Conflict: {suggestion.conflicts.join("; ")}</p>}
          </div>
        );
      })}
      {!isFetching && description.trim() && (!suggestions || suggestions.length === 0) && <p className="mt-2 text-xs text-amber-700">No safe catalog category was found. Correct the description or add a curated catalog item before posting.</p>}
    </section>
  );
}

export default function GoodsReceiptScan() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const [review, setReview] = useState<GoodsReceiptReviewPrefill | null>(null);
  const [catalogDecisions, setCatalogDecisions] = useState<Record<number, CatalogDecision>>({});
  const [reviewSubmissionId, setReviewSubmissionId] = useState("");
  const [scanMeta, setScanMeta] = useState<{ provider: string; pageCount: number } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ receiptId: string; idempotent: boolean; lineCount: number } | null>(null);

  const extractDocument = trpc.ocr.extractDocument.useMutation();
  const parseOcrText = trpc.poParsing.parseOcrText.useMutation();
  const postReceipt = trpc.goodsReceiptScan.postReviewedReceipt.useMutation({
    onSuccess: async (result) => {
      setSuccess({ receiptId: result.receiptId, idempotent: result.idempotent, lineCount: result.lines.length });
      await utils.inventory.getAll.invalidate();
    },
    onError: (mutationError) => setError(mutationError.message || "Goods receipt could not be posted."),
  });

  const allLinesMapped = review ? review.items.length > 0 && review.items.every((_, index) => catalogDecisions[index]?.decision === "ACCEPTED" && Boolean(catalogDecisions[index]?.catalogItemId)) : false;
  const canPost = Boolean(review && review.header.vendorName.value.trim() && review.header.invoiceNumber.value.trim() && review.header.invoiceDate.value.trim() && allLinesMapped && !postReceipt.isPending);

  const updateHeader = (field: keyof GoodsReceiptReviewPrefill["header"], value: string) => {
    setReview((current) => current ? ({ ...current, header: { ...current.header, [field]: updateReviewField(current.header[field], value) } }) : current);
  };

  const updateLine = (index: number, field: keyof GoodsReceiptReviewPrefill["items"][number], value: string) => {
    setReview((current) => {
      if (!current) return current;
      const items = current.items.map((line, lineIndex) => lineIndex === index ? ({ ...line, [field]: updateReviewField(line[field], value) }) : line);
      return { ...current, items };
    });
    if (field === "description" || field === "hsnCode") {
      setCatalogDecisions((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
    }
  };

  const scanFile = async (file: File) => {
    if (!supportedMimes.has(file.type)) {
      setError("Choose a JPEG, PNG, or PDF supplier receipt document.");
      return;
    }
    setError("");
    setSuccess(null);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Unable to read the selected document."));
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(file);
      });
      const ocr = await extractDocument.mutateAsync({ data, mimeType: file.type });
      const parsed = await parseOcrText.mutateAsync({ fullText: ocr.fullText });
      setReview(createGoodsReceiptReviewPrefill(parsed));
      setCatalogDecisions({});
      setReviewSubmissionId(crypto.randomUUID());
      setScanMeta({ provider: ocr.provider, pageCount: ocr.pageCount });
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : "";
      setError(/Unsupported MIME type|empty file|maximum allowed limit|Malformed data URI|Malformed PDF|maximum supported page count|maximum supported size/i.test(message) ? message : "OCR extraction failed. Review the document format and try again.");
    }
  };

  const postReviewedReceipt = () => {
    if (!review || !canPost) return;
    const confirmed = window.confirm("Post this reviewed goods receipt and update inventory? This cannot be undone from the scan screen.");
    if (!confirmed) return;
    setError("");
    postReceipt.mutate({
      reviewSubmissionId,
      review,
      catalogDecisions: review.items.map((_, lineIndex) => catalogDecisions[lineIndex]),
    });
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2"><Badge className="bg-teal-700">Inventory intake</Badge><Badge variant="outline">No PO required</Badge></div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Goods Receipt Scan</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Scan a supplier invoice or receipt, review the extracted details in categories, map each line to a governed medicine, then explicitly post the receipt to update batch-aware inventory.</p>
        </div>
        <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={extractDocument.isPending || parseOcrText.isPending} className="bg-teal-700 hover:bg-teal-800">
          {extractDocument.isPending || parseOcrText.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Scan supplier receipt
        </Button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(event) => event.target.files?.[0] && scanFile(event.target.files[0])} />
      </section>

      {error && <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">{success.idempotent ? "Receipt already posted" : "Goods receipt posted"}</p><p className="mt-1">Receipt {success.receiptId} {success.idempotent ? "was returned without another inventory update." : `updated ${success.lineCount} reviewed inventory line(s).`}</p></div></div>}

      {!review && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <FileSearch className="h-10 w-10 text-teal-700" />
            <div><p className="font-semibold text-slate-900">Start with a supplier receipt</p><p className="mt-1 max-w-md text-sm text-slate-600">JPEG, PNG, and PDF files are read through the existing protected OCR workflow. Scanning alone never creates a receipt, a catalog item, or stock.</p></div>
          </CardContent>
        </Card>
      )}

      {review && (
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-lg">1. Receipt and supplier details</CardTitle><CardDescription>Review the extracted document header. These fields form the duplicate-protection receipt identity.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <ReviewInput label="Supplier name" field={review.header.vendorName} onChange={(value) => updateHeader("vendorName", value)} />
              <ReviewInput label="Invoice / receipt number" field={review.header.invoiceNumber} onChange={(value) => updateHeader("invoiceNumber", value)} />
              <ReviewInput label="Receipt date" field={review.header.invoiceDate} onChange={(value) => updateHeader("invoiceDate", value)} type="date" />
              <ReviewInput label="Supplier GSTIN" field={review.header.vendorGstin} onChange={(value) => updateHeader("vendorGstin", value)} />
              {scanMeta && <p className="text-xs text-slate-500 md:col-span-2">OCR provider: {scanMeta.provider} · {scanMeta.pageCount} page(s) reviewed</p>}
            </CardContent>
          </Card>

          {review.warnings.length > 0 && <Card className="border-amber-200 bg-amber-50"><CardContent className="py-4"><p className="text-sm font-semibold text-amber-950">Review warnings</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">{review.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></CardContent></Card>}

          <Card>
            <CardHeader><CardTitle className="text-lg">2. Categorize and verify received items</CardTitle><CardDescription>Each item must be matched to a curated catalog medicine. Batch, expiry, quantity, and price remain editable until posting.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              {review.items.map((line, index) => (
                <section key={index} className="rounded-lg border bg-slate-50/60 p-4">
                  <div className="mb-3 flex items-center justify-between"><p className="font-semibold text-slate-900">Receipt line {index + 1}</p><Badge variant="outline">Batch-specific intake</Badge></div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <ReviewInput label="Description" field={line.description} onChange={(value) => updateLine(index, "description", value)} />
                    <ReviewInput label="HSN code" field={line.hsnCode} onChange={(value) => updateLine(index, "hsnCode", value)} />
                    <ReviewInput label="Batch number" field={line.batchNumber} onChange={(value) => updateLine(index, "batchNumber", value)} />
                    <ReviewInput label="Expiry date" field={line.expiryDate} onChange={(value) => updateLine(index, "expiryDate", value)} type="date" />
                    <ReviewInput label="Quantity received" field={line.quantity} onChange={(value) => updateLine(index, "quantity", value)} type="number" />
                    <ReviewInput label="Unit cost" field={line.unitPrice} onChange={(value) => updateLine(index, "unitPrice", value)} type="number" />
                  </div>
                  <div className="mt-4"><CatalogCategoryControl lineIndex={index} description={line.description.value} hsnCode={line.hsnCode.value} decision={catalogDecisions[index]} onDecision={(decision) => setCatalogDecisions((current) => ({ ...current, [index]: decision }))} /></div>
                </section>
              ))}
            </CardContent>
          </Card>

          <Card className="border-teal-200">
            <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
              <div><p className="font-semibold text-slate-950">3. Confirm receipt and update inventory</p><p className="mt-1 text-sm text-slate-600">Posting records a receipt, inventory movement, and immutable audit evidence. Scanning, parsing, and categorizing never change stock.</p></div>
              <Button type="button" size="lg" disabled={!canPost} onClick={postReviewedReceipt} className="bg-teal-700 hover:bg-teal-800"><PackageCheck className="mr-2 h-4 w-4" />{postReceipt.isPending ? "Posting receipt…" : "Confirm & update inventory"}</Button>
            </CardContent>
          </Card>
          {!allLinesMapped && <p className="text-center text-xs text-amber-800">Map every receipt line to a governed catalog medicine before inventory can be updated.</p>}
          <Separator />
        </div>
      )}
    </div>
  );
}
