import { useState, useRef } from "react";
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
import { Plus, Trash2, CheckCircle, XCircle, Loader2, Upload, Zap } from "lucide-react";

export default function PurchaseOrders() {
  const { user } = useAuth();
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
  const uploadPOImage = trpc.purchaseOrders.uploadPoImage.useMutation();
  const extractPO = trpc.purchaseOrders.extractFromImage.useMutation();
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
  const [rejectionReason, setRejectionReason] = useState<{[key: string]: string}>({});
  const [showOCRDialog, setShowOCRDialog] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrImageFile, setOcrImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageRotation, setImageRotation] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (file: File | null) => {
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
      po.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.purchaseOrderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.vendorContactNumber.includes(searchTerm);
    const matchesStatus = !filterStatus || po.paymentStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

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

  const handleOCRImageUpload = async (file: File) => {
    if (!file) return;
    setOcrLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Data = e.target?.result as string;
          const uploadResponse = await uploadPOImage.mutateAsync({ 
            imageData: base64Data,
            fileName: file.name 
          });
          
          const extractedData = await extractPO.mutateAsync({ imageUrl: uploadResponse.url });
          setFormData({
            vendorName: extractedData.vendorName || "",
            vendorContactNumber: extractedData.vendorContactNumber || "",
            vendorEmail: "",
            vendorGSTNumber: extractedData.vendorGstNumber || "",
            vendorBankDetails: "",
            vendorAddress: extractedData.vendorAddress || "",
            expectedDeliveryDate: "",
            notes: "",
            items: extractedData.items?.map((item: any) => ({
              itemName: item.name || "",
              quantity: parseInt(item.quantity) || 1,
              unitPrice: item.valuePerItem || "",
            })) || [{ itemName: "", quantity: 1, unitPrice: "" }],
          });
          showAlert("Success", "PO data extracted successfully");
          setShowOCRDialog(false);
          setOcrImageFile(null);
        } catch (error) {
          console.error("[PO Extraction] Error:", error);
          const errorMsg = error instanceof Error ? error.message : "Failed to extract PO data from image";
          showAlert("Error", errorMsg);
        } finally {
          setOcrLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      showAlert("Error", "Failed to process PO image");
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
        <Dialog open={showOCRDialog} onOpenChange={setShowOCRDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Scan Purchase Order</DialogTitle>
              <DialogDescription>Upload a PO image to auto-extract details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div 
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">Click to upload PO image or drag and drop</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageSelect(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {ocrImageFile && <p className="text-sm text-green-600 mt-2">✓ {ocrImageFile.name}</p>}
              </div>
              {imagePreview && (
                <div className="space-y-3">
                  <div className="border rounded-lg overflow-hidden bg-gray-50">
                    <img
                      src={imagePreview}
                      alt="PO Preview"
                      className="w-full h-auto max-h-64 object-contain"
                      style={{ transform: `rotate(${imageRotation}deg)` }}
                    />
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setImageRotation((prev) => (prev + 90) % 360)}
                      className="text-xs"
                    >
                      ↻ Rotate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleImageSelect(null)}
                      className="text-xs"
                    >
                      ✕ Clear
                    </Button>
                  </div>
                </div>
              )}
              <Button
                onClick={() => ocrImageFile && handleOCRImageUpload(ocrImageFile)}
                disabled={!ocrImageFile || ocrLoading}
                className="w-full"
              >
                {ocrLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                {ocrLoading ? "Extracting..." : "Extract PO Data"}
              </Button>
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
          <div className="mt-4 flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by vendor name, PO ID, or contact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterStatus || "all"} onValueChange={(value) => setFilterStatus(value === "all" ? null : value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Partial">Partial</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
              </SelectContent>
            </Select>
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
    </div>
  );
}
