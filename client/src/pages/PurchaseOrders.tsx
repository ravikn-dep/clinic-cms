import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2 } from "lucide-react";

export default function PurchaseOrders() {
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

  const { data: purchaseOrders, isLoading, refetch } = trpc.purchaseOrders.getAll.useQuery();
  const createPO = trpc.purchaseOrders.create.useMutation();
  const updatePaymentStatus = trpc.purchaseOrders.updatePaymentStatus.useMutation();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vendorName || !formData.vendorContactNumber || formData.items.length === 0) {
      showAlert("Error", "Please fill in all required fields");
      return;
    }

    try {
      await createPO.mutateAsync({
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
      });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Purchase Orders</h1>
          <p className="text-gray-600 mt-1">Manage vendor purchase orders and payments</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" /> New Purchase Order
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Purchase Order</CardTitle>
            <CardDescription>Enter vendor details and items</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vendor Name *</Label>
                  <Input
                    value={formData.vendorName}
                    onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
                    placeholder="Enter vendor name"
                  />
                </div>
                <div>
                  <Label>Contact Number *</Label>
                  <Input
                    value={formData.vendorContactNumber}
                    onChange={(e) => setFormData({ ...formData, vendorContactNumber: e.target.value })}
                    placeholder="Enter contact number"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.vendorEmail}
                    onChange={(e) => setFormData({ ...formData, vendorEmail: e.target.value })}
                    placeholder="Enter email"
                  />
                </div>
                <div>
                  <Label>GST Number</Label>
                  <Input
                    value={formData.vendorGSTNumber}
                    onChange={(e) => setFormData({ ...formData, vendorGSTNumber: e.target.value })}
                    placeholder="Enter GST number"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
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

                {formData.items.map((item, index) => (
                  <div key={index} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Item Name</Label>
                      <Input
                        value={item.itemName}
                        onChange={(e) => handleItemChange(index, "itemName", e.target.value)}
                        placeholder="Item name"
                      />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="w-32">
                      <Label className="text-xs">Unit Price</Label>
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
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm font-semibold">Total Amount: ₹{calculateTotal().toFixed(2)}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="bg-teal-600 hover:bg-teal-700">
                  Create Purchase Order
                </Button>
                <Button type="button" onClick={() => setShowForm(false)} variant="outline">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders List</CardTitle>
          <CardDescription>All vendor purchase orders and their payment status</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : !purchaseOrders || purchaseOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No purchase orders found</div>
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
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po: any) => (
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
                      <TableCell>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
