import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Plus, Trash2, Eye, Save, RotateCcw, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface FormField {
  id: string;
  label: string;
  fieldType: "text" | "date" | "dropdown" | "checkbox" | "textarea";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface FormTemplate {
  clinicName: string;
  clinicSubtitle?: string;
  headerFields: FormField[];
  blankAreaHeight: number;
  footerText?: string;
  showQRCode: boolean;
  showBarcode: boolean;
}

const DEFAULT_TEMPLATE: FormTemplate = {
  clinicName: "Clinic OP Form",
  clinicSubtitle: "",
  headerFields: [
    { id: "name", label: "Name", fieldType: "text", required: true },
    { id: "dob", label: "Age/DOB", fieldType: "date", required: true },
    { id: "contact", label: "Contact", fieldType: "text", required: true },
    { id: "gender", label: "Gender", fieldType: "dropdown", required: true, options: ["Male", "Female", "Other"] },
    { id: "consultant", label: "Consultant", fieldType: "text", required: false },
    { id: "datetime", label: "Date/Time", fieldType: "text", required: false },
  ],
  blankAreaHeight: 200,
  footerText: "",
  showQRCode: true,
  showBarcode: true,
};

export default function OPFormCustomization() {
  const [template, setTemplate] = useState<FormTemplate>(DEFAULT_TEMPLATE);
  const [newField, setNewField] = useState<Partial<FormField>>({ fieldType: "text" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const getFormTemplateQuery = trpc.opForm.getTemplate.useQuery();
  const updateFormTemplateMutation = trpc.opForm.updateTemplate.useMutation();
  const resetFormTemplateMutation = trpc.opForm.resetTemplate.useMutation();

  // Load template on mount
  if (getFormTemplateQuery.data && template === DEFAULT_TEMPLATE) {
    setTemplate(getFormTemplateQuery.data);
  }

  const handleAddField = () => {
    if (!newField.label) {
      toast.error("Field label is required");
      return;
    }
    const field: FormField = {
      id: `field-${Date.now()}`,
      label: newField.label || "",
      fieldType: (newField.fieldType as any) || "text",
      required: newField.required || false,
      placeholder: newField.placeholder,
      options: newField.options,
    };
    setTemplate({
      ...template,
      headerFields: [...template.headerFields, field],
    });
    setNewField({ fieldType: "text" });
    toast.success("Field added");
  };

  const handleRemoveField = (fieldId: string) => {
    setTemplate({
      ...template,
      headerFields: template.headerFields.filter((f) => f.id !== fieldId),
    });
    toast.success("Field removed");
  };

  const handleUpdateField = (fieldId: string, updates: Partial<FormField>) => {
    setTemplate({
      ...template,
      headerFields: template.headerFields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
    });
  };

  const handleSaveTemplate = async () => {
    setIsSaving(true);
    try {
      await updateFormTemplateMutation.mutateAsync(template);
      toast.success("Form template saved successfully");
    } catch (error) {
      toast.error("Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetTemplate = async () => {
    if (!confirm("Are you sure you want to reset to default template?")) return;
    try {
      await resetFormTemplateMutation.mutateAsync();
      setTemplate(DEFAULT_TEMPLATE);
      toast.success("Template reset to default");
    } catch (error) {
      toast.error("Failed to reset template");
    }
  };

  return (
    <div className="friendly-page space-y-8">
      <div className="friendly-hero">
        <span className="friendly-chip mb-3 inline-flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" /> Customization
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-teal-950">OP Form Customization</h1>
        <p className="mt-2 max-w-2xl leading-6 text-muted-foreground">
          Design your clinic's printable OP registration form. Customize fields, layout, and styling to match your requirements.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Form Builder */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Settings */}
          <Card className="friendly-card">
            <CardHeader>
              <CardTitle>Header Settings</CardTitle>
              <CardDescription>Configure clinic name and form title</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="clinicName">Clinic Name</Label>
                <Input
                  id="clinicName"
                  value={template.clinicName}
                  onChange={(e) => setTemplate({ ...template, clinicName: e.target.value })}
                  placeholder="Your Clinic Name"
                  className="transition-colors focus-visible:ring-teal-200"
                />
              </div>
              <div>
                <Label htmlFor="clinicSubtitle">Subtitle (Optional)</Label>
                <Input
                  id="clinicSubtitle"
                  value={template.clinicSubtitle || ""}
                  onChange={(e) => setTemplate({ ...template, clinicSubtitle: e.target.value })}
                  placeholder="e.g., Orthopaedic Clinic"
                  className="transition-colors focus-visible:ring-teal-200"
                />
              </div>
            </CardContent>
          </Card>

          {/* Form Fields */}
          <Card className="friendly-card">
            <CardHeader>
              <CardTitle>Form Fields</CardTitle>
              <CardDescription>Add, edit, or remove fields from your form</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {template.headerFields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-3 p-3 rounded-lg border border-teal-100 bg-teal-50/50">
                  <GripVertical className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Select value={field.fieldType} onValueChange={(v: any) => handleUpdateField(field.id, { fieldType: v })}>
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="dropdown">Dropdown</SelectItem>
                            <SelectItem value="checkbox">Checkbox</SelectItem>
                            <SelectItem value="textarea">Textarea</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Placeholder</Label>
                        <Input
                          value={field.placeholder || ""}
                          onChange={(e) => handleUpdateField(field.id, { placeholder: e.target.value })}
                          className="text-sm"
                          placeholder="Optional"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => handleUpdateField(field.id, { required: e.target.checked })}
                          />
                          <span className="text-sm">Required</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveField(field.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {/* Add New Field */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Add New Field</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={newField.label || ""}
                        onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                        placeholder="Field name"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={newField.fieldType as string} onValueChange={(v) => setNewField({ ...newField, fieldType: v as any })}>
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="dropdown">Dropdown</SelectItem>
                          <SelectItem value="checkbox">Checkbox</SelectItem>
                          <SelectItem value="textarea">Textarea</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleAddField} className="w-full bg-teal-600 hover:bg-teal-700">
                    <Plus className="h-4 w-4 mr-2" /> Add Field
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Layout Settings */}
          <Card className="friendly-card">
            <CardHeader>
              <CardTitle>Layout Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="blankHeight">Blank Area Height (mm)</Label>
                <Input
                  id="blankHeight"
                  type="number"
                  value={template.blankAreaHeight}
                  onChange={(e) => setTemplate({ ...template, blankAreaHeight: parseInt(e.target.value) || 200 })}
                  min="50"
                  max="300"
                  className="transition-colors focus-visible:ring-teal-200"
                />
                <p className="text-xs text-muted-foreground mt-1">Space for handwritten notes</p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={template.showQRCode}
                    onChange={(e) => setTemplate({ ...template, showQRCode: e.target.checked })}
                  />
                  <span>Show QR Code</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={template.showBarcode}
                    onChange={(e) => setTemplate({ ...template, showBarcode: e.target.checked })}
                  />
                  <span>Show Barcode</span>
                </label>
              </div>
              <div>
                <Label htmlFor="footerText">Footer Text (Optional)</Label>
                <Textarea
                  id="footerText"
                  value={template.footerText || ""}
                  onChange={(e) => setTemplate({ ...template, footerText: e.target.value })}
                  placeholder="e.g., Please keep this form for your records"
                  className="text-sm transition-colors focus-visible:ring-teal-200"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview & Actions */}
        <div className="space-y-4">
          <Card className="friendly-card sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={() => setPreviewOpen(true)} variant="outline" className="w-full border-teal-200">
                <Eye className="h-4 w-4 mr-2" /> Preview Form
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={isSaving || updateFormTemplateMutation.isPending}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                <Save className="h-4 w-4 mr-2" /> Save Template
              </Button>
              <Button onClick={handleResetTemplate} variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive/10">
                <RotateCcw className="h-4 w-4 mr-2" /> Reset to Default
              </Button>
            </CardContent>
          </Card>

          <Card className="friendly-card bg-teal-50/50 border-teal-200">
            <CardHeader>
              <CardTitle className="text-sm">Form Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Total Fields:</span> {template.headerFields.length}
              </div>
              <div>
                <span className="font-medium">Required Fields:</span> {template.headerFields.filter((f) => f.required).length}
              </div>
              <div>
                <span className="font-medium">Blank Area:</span> {template.blankAreaHeight}mm
              </div>
              <div className="flex gap-2 mt-3">
                {template.showQRCode && <Badge variant="outline" className="text-xs">QR Code</Badge>}
                {template.showBarcode && <Badge variant="outline" className="text-xs">Barcode</Badge>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Form Preview</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>
                ✕
              </Button>
            </CardHeader>
            <CardContent>
              <div className="bg-white border border-gray-200 p-6 rounded-lg" style={{ width: "190mm", minHeight: "277mm" }}>
                <div className="border-b-2 border-gray-900 pb-4 mb-4">
                  <h1 className="text-lg font-bold">{template.clinicName}</h1>
                  {template.clinicSubtitle && <p className="text-sm text-gray-600">{template.clinicSubtitle}</p>}
                </div>
                <div className="space-y-2 mb-6">
                  {template.headerFields.map((field) => (
                    <div key={field.id} className="text-sm">
                      <span className="font-semibold">{field.label}:</span> {field.required && <span className="text-red-500">*</span>}
                      <div className="border-b border-gray-300 mt-1"></div>
                    </div>
                  ))}
                </div>
                <div
                  className="border border-gray-300 bg-gray-50 mb-4"
                  style={{ minHeight: `${template.blankAreaHeight / 10}mm` }}
                ></div>
                {template.footerText && <p className="text-xs text-gray-600 mt-4">{template.footerText}</p>}
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => window.print()} className="flex-1 bg-teal-600 hover:bg-teal-700">
                  Print Preview
                </Button>
                <Button onClick={() => setPreviewOpen(false)} variant="outline" className="flex-1">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
