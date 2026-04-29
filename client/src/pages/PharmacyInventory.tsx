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
import { AlertTriangle, Plus } from "lucide-react";

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

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(inventorySchema),
  });

  const inventoryQuery = trpc.inventory.getAll.useQuery();
  const lowStockQuery = trpc.inventory.getLowStock.useQuery();
  const addMutation = trpc.inventory.add.useMutation();

  const items = inventoryQuery.data || [];
  const lowStockItems = lowStockQuery.data || [];

  const onSubmit = async (data: any) => {
    try {
      await addMutation.mutateAsync({
        itemName: data.itemName,
        batchNumber: data.batchNumber,
        expiryDate: data.expiryDate,
        quantityAvailable: data.quantityAvailable,
        reorderLevel: data.reorderLevel,
        unitPrice: data.unitPrice,
      });
      toast.success("Item added to inventory");
      reset();
      setShowForm(false);
      inventoryQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to add item");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pharmacy Inventory</h1>
          <p className="text-muted-foreground mt-2">Manage medicines and stock levels</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Add Item Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Item</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-3 gap-4">
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

              <div className="flex gap-2">
                <Button type="submit" className="flex-1">Add Item</Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">⚠️ Low Stock Alerts</CardTitle>
            <CardDescription className="text-amber-800">{lowStockItems.length} item(s) below reorder level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.itemId} className="flex items-center justify-between p-3 bg-white rounded border border-amber-200">
                  <div>
                    <p className="font-semibold text-amber-900">{item.itemName}</p>
                    <p className="text-sm text-amber-700">Qty: {item.quantityAvailable} / {item.reorderLevel}</p>
                  </div>
                  <Button variant="outline" size="sm" className="text-amber-600">Reorder</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory List */}
      <Card>
        <CardHeader>
          <CardTitle>Current Inventory</CardTitle>
          <CardDescription>{items.length} item(s) in stock</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No items in inventory</p>
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
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isLowStock = (item.quantityAvailable ?? 0) <= (item.reorderLevel ?? 10);
                    return (
                      <tr key={item.itemId} className="border-b hover:bg-accent">
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
