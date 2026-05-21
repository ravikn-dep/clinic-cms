import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/billingUtils";

type BillDetailDialogProps = {
  billId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BillDetailDialog({ billId, open, onOpenChange }: BillDetailDialogProps) {
  const { data, isLoading, isError } = trpc.bills.getById.useQuery(
    { billId: billId! },
    { enabled: open && Boolean(billId) }
  );

  const bill = data?.bill;
  const items = data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice details</DialogTitle>
          <DialogDescription>
            {billId ? `Bill ${billId}` : "Select a bill to view line items"}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading invoice...
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive py-4">Failed to load invoice details.</p>
        )}

        {bill && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{bill.paymentStatus}</Badge>
              <span className="text-sm text-muted-foreground">Patient: {bill.patientId}</span>
              {bill.consultationId && (
                <span className="text-sm text-muted-foreground">
                  Consultation: {bill.consultationId}
                </span>
              )}
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left py-2 px-3">Service</th>
                    <th className="text-right py-2 px-3">Qty</th>
                    <th className="text-right py-2 px-3">Rate</th>
                    <th className="text-right py-2 px-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 px-3 text-center text-muted-foreground">
                        No line items recorded
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.billItemId} className="border-t">
                        <td className="py-2 px-3">
                          <p className="font-medium">{item.itemType}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </td>
                        <td className="py-2 px-3 text-right">{item.quantity}</td>
                        <td className="py-2 px-3 text-right">{formatMoney(item.unitPrice)}</td>
                        <td className="py-2 px-3 text-right font-medium">
                          {formatMoney(item.subtotal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2 border-t pt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatMoney(bill.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatMoney(bill.discountAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>+{formatMoney(bill.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base sm:col-span-2 border-t pt-2">
                <span>Final amount</span>
                <span>{formatMoney(bill.finalAmount)}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
