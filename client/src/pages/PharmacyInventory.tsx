import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Edit2, Plus } from "lucide-react";

const inventorySchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  batchNumber: z.string().min(1, "Batch number is required"),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  quantityAvailable: z.coerce.number().min(0),
  reorderLevel: z.coerce.number().min(1),
  unitPrice: z.string().regex(/^\d+(\.\d{2})?$/, "Invalid price format"),
});

type InventoryFormData = z.infer<typeof inventorySchema>;

export default function PharmacyInventory() {
  const [showForm, setShowForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(inventorySchema),
    defaultValues: {
      itemName: "",
      batchNumber: "",
      expiryDate: "",
      quantityAvailable: 0,
      reorderLevel: 10,
      unitPrice: "",
    },
  });

  const inventoryQuery = trpc.inventory.getAll.useQuery();
  const lowStockQuery = trpc.inventory.getLowStock.useQuery();
  const addMutation = trpc.inventory.add.useMutation();
  const updateMutation = trpc.inventory.update.useMutation();

  const items = inventoryQuery.data || [];
  const lowStockItems = lowStockQuery.data || [];

  const startAddItem = () => {
    setEditingItemId(null);
    reset({ itemName: "", batchNumber: "", expiryDate: "", quantityAvailable: 0, reorderLevel: 10, unitPrice: "" });
    setShowForm(true);
  };

  const startEditItem = (item: (typeof items)[number]) => {
    setEditingItemId(item.itemId);
    reset({
      itemName: item.itemName,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      quantityAvailable: item.quantityAvailable ?? 0,
      reorderLevel: item.reorderLevel ?? 10,
      unitPrice: String(item.unitPrice ?? "0.00"),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingItemId(null);
    reset();
  };

  const onSubmit = async (data: any) => {
    try {
      const payload = {
        itemName: data.itemName,
        batchNumber: data.batchNumber,
        expiryDate: data.expiryDate,
        quantityAvailable: data.quantityAvailable,
        reorderLevel: data.reorderLevel,
        unitPrice: data.unitPrice,
      };

      if (editingItemId) {
        await updateMutation.mutateAsync({ itemId: editingItemId, ...payload });
        toast.success("Inventory item updated");
      } else {
        await addMutation.mutateAsync(payload);
        toast.success("Item added to inventory");
      }

      closeForm();
      await Promise.all([inventoryQuery.refetch(), lowStockQuery.refetch()]);
    } catch (error: any) {
      toast.error(error.message || (editingItemId ? "Failed to update item" : "Failed to add item"));
    }
  };

  return (
    <div className="friendly-page space-y-8">
      <div className="friendly-hero flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="friendly-chip mb-3 inline-flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Stock visibility</span>
          <h1 className="text-3xl font-bold tracking-tight text-teal-950">Pharmacy Inventory</h1>
          <p className="mt-2 max-w-2xl leading-6 text-muted-foreground">Manage medicines, batches, reorder levels, and pharmacy readiness with a calmer stock overview.</p>
        </div>
        <Button onClick={showForm ? closeForm : startAddItem} className="friendly-action bg-teal-600 text-white hover:bg-teal-700">
          <Plus className="mr-2 h-4 w-4" />
          {showForm ? "Close Form" : "Add Item"}
        </Button>
      </div>

      {/* Add/Edit Item Form */}
      {showForm && (
        <Card className="friendly-card">
          <CardHeader>
            <CardTitle>{editingItemId ? "Edit Inventory Item" : "Add New Item"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="itemName">Item Name *</Label>
                  <Input
                    id="itemName"
                    placeholder="e.g., Paracetamol 500mg"
                    {...register("itemName")}
                    className={errors.itemName ? "border-red-500" : ""}
                  />
                  {errors.itemName && <p className="text-sm text-red-500">{errors.itemName.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batchNumber">Batch Number *</Label>
                  <Input
                    id="batchNumber"
                    placeholder="e.g., BATCH-2026-001"
                    {...register("batchNumber")}
                    className={errors.batchNumber ? "border-red-500" : ""}
                  />
                  {errors.batchNumber && <p className="text-sm text-red-500">{errors.batchNumber.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date *</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    {...register("expiryDate")}
                    className={errors.expiryDate ? "border-red-500" : ""}
                  />
                  {errors.expiryDate && <p className="text-sm text-red-500">{errors.expiryDate.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    placeholder="100"
                    {...register("quantityAvailable")}
                    className={errors.quantityAvailable ? "border-red-500" : ""}
                  />
                  {errors.quantityAvailable && <p className="text-sm text-red-500">{errors.quantityAvailable.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reorderLevel">Reorder Level *</Label>
                  <Input
                    id="reorderLevel"
                    type="number"
                    placeholder="20"
                    {...register("reorderLevel")}
                    className={errors.reorderLevel ? "border-red-500" : ""}
                  />
                  {errors.reorderLevel && <p className="text-sm text-red-500">{errors.reorderLevel.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unitPrice">Unit Price *</Label>
                <Input
                  id="unitPrice"
                  placeholder="10.50"
                  {...register("unitPrice")}
                  className={errors.unitPrice ? "border-red-500" : ""}
                />
                {errors.unitPrice && <p className="text-sm text-red-500">{errors.unitPrice.message}</p>}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={addMutation.isPending || updateMutation.isPending} className="friendly-action flex-1 bg-teal-600 text-white hover:bg-teal-700">{editingItemId ? "Save Changes" : "Add Item"}</Button>
                <Button type="button" variant="outline" className="friendly-action flex-1 border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50" onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="friendly-card border-amber-200 bg-amber-50/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900"><AlertTriangle className="h-5 w-5" /> Low Stock Alerts</CardTitle>
            <CardDescription className="text-amber-800">{lowStockItems.length} item(s) below reorder level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.itemId} className="flex flex-col gap-3 rounded-3xl border border-amber-200 bg-white/85 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-amber-900">{item.itemName}</p>
                    <p className="text-sm text-amber-700">Qty: {item.quantityAvailable} / {item.reorderLevel}</p>
                  </div>
                  <Button variant="outline" size="sm" className="friendly-action border-amber-300 bg-white text-amber-700">Reorder</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory List */}
      <Card className="friendly-card">
        <CardHeader>
          <CardTitle>Current Inventory</CardTitle>
          <CardDescription>{items.length} item(s) in stock</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-teal-200 bg-teal-50/45 px-6 py-12 text-center">
              <p className="font-semibold text-teal-950">No medicines have been added yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">Use Add Item to start building a clear pharmacy stock view.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Item Name</th>
                    <th className="text-left py-3 px-4 font-semibold">Batch</th>
                    <th className="text-left py-3 px-4 font-semibold">Expiry</th>
                    <th className="text-left py-3 px-4 font-semibold">Quantity</th>
                    <th className="text-left py-3 px-4 font-semibold">Unit Price</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isLowStock = (item.quantityAvailable ?? 0) <= (item.reorderLevel ?? 10);
                    return (
                      <tr key={item.itemId} className="border-b transition-colors hover:bg-teal-50/70">
                        <td className="py-3 px-4 font-medium">{item.itemName}</td>
                        <td className="py-3 px-4 text-xs">{item.batchNumber}</td>
                        <td className="py-3 px-4 text-xs">{item.expiryDate}</td>
                        <td className="py-3 px-4">
                          <span className={isLowStock ? "text-red-600 font-semibold" : ""}>
                            {item.quantityAvailable}
                          </span>
                        </td>
                        <td className="py-3 px-4">₹{item.unitPrice}</td>
                        <td className="py-3 px-4">
                          {isLowStock ? (
                            <Badge variant="destructive" className="flex w-fit gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Low Stock
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              In Stock
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Button type="button" variant="outline" size="sm" className="friendly-action border-teal-200 bg-white text-teal-800 hover:bg-teal-50" onClick={() => startEditItem(item)}>
                            <Edit2 className="mr-2 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
