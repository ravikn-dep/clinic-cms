import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, Edit2 } from "lucide-react";

interface TemplateItem {
  itemType: string;
  description: string;
  quantity: number;
  unitPrice: string;
}

interface TemplateFormState {
  name: string;
  description: string;
  items: TemplateItem[];
}

const initialFormState: TemplateFormState = {
  name: "",
  description: "",
  items: [
    {
      itemType: "Consultation",
      description: "",
      quantity: 1,
      unitPrice: "0",
    },
  ],
};

export default function BillTemplateManagement() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TemplateFormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);

  const templates = trpc.billTemplates.getAll.useQuery();
  const createTemplate = trpc.billTemplates.create.useMutation();
  const updateTemplate = trpc.billTemplates.update.useMutation();
  const deleteTemplate = trpc.billTemplates.delete.useMutation();

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          itemType: "Medicine",
          description: "",
          quantity: 1,
          unitPrice: "0",
        },
      ],
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (form.items.length === 1) {
      toast("Template must have at least one item");
      return;
    }
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof TemplateItem,
    value: string | number
  ) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast("Template name is required");
      return;
    }

    if (form.items.some((item) => !item.description.trim())) {
      toast("All items must have a description");
      return;
    }

    try {
      if (editingId) {
        await updateTemplate.mutateAsync({
          templateId: editingId,
          name: form.name,
          description: form.description,
          items: form.items,
        });
        toast("Template updated successfully");
      } else {
        await createTemplate.mutateAsync({
          name: form.name,
          description: form.description,
          items: form.items,
        });
        toast("Template created successfully");
      }

      setForm(initialFormState);
      setEditingId(null);
      setShowForm(false);
      templates.refetch();
    } catch (error) {
      toast("Failed to save template");
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      await deleteTemplate.mutateAsync({ templateId });
      toast("Template deleted successfully");
      templates.refetch();
    } catch (error) {
      toast("Failed to delete template");
    }
  };

  const handleEdit = (template: any) => {
    setForm({
      name: template.name,
      description: template.description || "",
      items: template.itemsJson || [],
    });
    setEditingId(template.templateId);
    setShowForm(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Bill Templates</h1>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Consultation + Imaging"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Optional description"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {form.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-[120px_1fr_80px_120px_40px]"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <select
                        value={item.itemType}
                        onChange={(e) =>
                          handleItemChange(idx, "itemType", e.target.value)
                        }
                        className="w-full rounded border px-2 py-1 text-sm"
                      >
                        <option>Consultation</option>
                        <option>Medicine</option>
                        <option>Procedure</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Description *</Label>
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          handleItemChange(idx, "description", e.target.value)
                        }
                        placeholder="Item description"
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemChange(
                            idx,
                            "quantity",
                            parseInt(e.target.value) || 1
                          )
                        }
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Unit Price *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleItemChange(idx, "unitPrice", e.target.value)
                        }
                        className="text-sm"
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending}>
                {editingId ? "Update Template" : "Create Template"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setForm(initialFormState);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.data?.map((template) => (
          <Card key={template.templateId} className="p-4">
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold">{template.name}</h3>
                {template.description && (
                  <p className="text-sm text-muted-foreground">
                    {template.description}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Items ({(template.itemsJson as any[])?.length || 0})
                </p>
                <ul className="space-y-1 text-sm">
                  {(template.itemsJson as any[])?.map((item, idx) => (
                    <li key={idx} className="text-muted-foreground">
                      • {item.description} (₹{item.unitPrice})
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEdit(template)}
                  className="gap-1"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(template.templateId)}
                  className="gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {templates.data?.length === 0 && !showForm && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No templates yet</p>
          <Button onClick={() => setShowForm(true)} className="mt-4">
            Create First Template
          </Button>
        </Card>
      )}
    </div>
  );
}
