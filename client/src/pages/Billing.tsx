import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";

export default function Billing() {
  const [showNewBill, setShowNewBill] = useState(false);
  const [bills] = useState([
    {
      billId: "BIL-1704067200000-ABC123",
      patientId: "PAT-ABC12345",
      patientName: "John Doe",
      totalAmount: 1500,
      discountAmount: 0,
      taxAmount: 150,
      finalAmount: 1650,
      paymentStatus: "Paid",
      createdAt: new Date("2026-04-25"),
    },
    {
      billId: "BIL-1704153600000-DEF456",
      patientId: "PAT-DEF67890",
      patientName: "Jane Smith",
      totalAmount: 2000,
      discountAmount: 100,
      taxAmount: 190,
      finalAmount: 2090,
      paymentStatus: "Pending",
      createdAt: new Date("2026-04-26"),
    },
    {
      billId: "BIL-1704240000000-GHI789",
      patientId: "PAT-GHI11111",
      patientName: "Robert Johnson",
      totalAmount: 1200,
      discountAmount: 0,
      taxAmount: 120,
      finalAmount: 1320,
      paymentStatus: "Partial",
      createdAt: new Date("2026-04-27"),
    },
  ]);

  const handleCreateBill = () => {
    toast.success("Bill created successfully");
    setShowNewBill(false);
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
        return "";
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-2">Generate invoices and track payments</p>
        </div>
        <Button onClick={() => setShowNewBill(!showNewBill)}>
          <Plus className="mr-2 h-4 w-4" />
          New Bill
        </Button>
      </div>

      {/* Create New Bill Form */}
      {showNewBill && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Invoice</CardTitle>
            <CardDescription>Generate a bill for consultation and medicines</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientId">Patient ID *</Label>
                <Input id="patientId" placeholder="PAT-ABC12345" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consultationId">Consultation ID</Label>
                <Input id="consultationId" placeholder="CON-1704067200000-ABC123" />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="font-semibold">Bill Items</Label>
              <div className="border rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-4 gap-2 text-sm font-medium">
                  <div>Item Type</div>
                  <div>Description</div>
                  <div>Qty</div>
                  <div>Unit Price</div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Select defaultValue="Consultation">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Consultation">Consultation</SelectItem>
                      <SelectItem value="Medicine">Medicine</SelectItem>
                      <SelectItem value="Procedure">Procedure</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Consultation fee" />
                  <Input type="number" placeholder="1" defaultValue="1" />
                  <Input placeholder="500" />
                </div>
              </div>
              <Button variant="outline" size="sm">+ Add Item</Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount">Discount Amount</Label>
                <Input id="discount" type="number" placeholder="0" defaultValue="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">Tax Amount</Label>
                <Input id="tax" type="number" placeholder="0" defaultValue="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">Final Amount</Label>
                <Input id="total" type="number" placeholder="0" defaultValue="500" disabled className="bg-muted" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreateBill} className="flex-1">Create Invoice</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowNewBill(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bills List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
          <CardDescription>{bills.length} invoice(s) total</CardDescription>
        </CardHeader>
        <CardContent>
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
                        <p className="font-semibold">₹{bill.finalAmount}</p>
                        <p className="text-xs text-muted-foreground">Total: ₹{bill.totalAmount}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={getStatusColor(bill.paymentStatus)}>
                        {bill.paymentStatus}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {bill.createdAt.toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">View</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{bills.reduce((sum, b) => sum + b.finalAmount, 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">
              ₹{bills.filter(b => b.paymentStatus === "Pending").reduce((sum, b) => sum + b.finalAmount, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Partial Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              ₹{bills.filter(b => b.paymentStatus === "Partial").reduce((sum, b) => sum + b.finalAmount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
