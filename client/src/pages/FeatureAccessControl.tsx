import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

const FEATURES = [
  { key: "patient_records", label: "Patient Records", description: "View and manage patient information" },
  { key: "ambient_scribe", label: "Ambient Scribe", description: "Record and transcribe consultations" },
  { key: "pharmacy", label: "Pharmacy", description: "Manage inventory and stock" },
  { key: "billing", label: "Billing", description: "Create and manage bills" },
  { key: "purchase_orders", label: "Purchase Orders", description: "Create and manage purchase orders" },
  { key: "appointments", label: "Appointments", description: "Schedule and manage appointments" },
  { key: "notifications", label: "Notifications", description: "View notifications" },
  { key: "audit_trail", label: "Audit Trail", description: "View system audit logs" },
  { key: "daily_export", label: "Daily Export", description: "Export daily reports" },
  { key: "user_management", label: "User Management", description: "Manage staff and consultants" },
];

export default function FeatureAccessControl() {
  const [activeRole, setActiveRole] = useState<"consultant" | "staff">("consultant");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch permissions for the active role
  const { data: fetchedPermissions } = trpc.rbac.getPermissions.useQuery(
    { role: activeRole },
  );

  // Update permissions when fetched
  useEffect(() => {
    if (fetchedPermissions) {
      setPermissions(fetchedPermissions);
      setIsLoading(false);
    }
  }, [fetchedPermissions]);

  // Update permissions mutation
  const updateMutation = trpc.rbac.updatePermissions.useMutation({
    onSuccess: () => {
      // Success - permissions updated
      setIsSaving(false);
    },
    onError: (error) => {
      console.error("Failed to update permissions:", error);
      setIsSaving(false);
    },
  });

  // Handle permission toggle
  const handleToggle = (featureKey: string) => {
    setPermissions((prev) => ({
      ...prev,
      [featureKey]: !prev[featureKey],
    }));
  };

  // Save permissions
  const handleSave = async () => {
    setIsSaving(true);
    await updateMutation.mutateAsync({
      role: activeRole,
      permissions,
    });
  };

  // Reset to defaults
  const handleReset = () => {
    if (fetchedPermissions) {
      setPermissions(fetchedPermissions);
    }
  };

  // Apply template mutation
  const applyTemplateMutation = trpc.featureAccess.applyTemplate.useMutation({
    onSuccess: () => {
      setIsSaving(false);
      window.location.reload();
    },
    onError: (error) => {
      console.error("Failed to apply template:", error);
      setIsSaving(false);
    },
  });

  // Apply a permission template
  const handleApplyTemplate = async (template: "consultant" | "staff") => {
    setIsSaving(true);
    try {
      await applyTemplateMutation.mutateAsync({
        role: activeRole,
        template,
      });
    } catch (error) {
      console.error("Error applying template:", error);
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Feature Access Control</h1>
        <p className="text-slate-600 mt-2">
          Configure which dashboard features are accessible to consultants and staff
        </p>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Permission Templates</CardTitle>
          <CardDescription className="text-blue-800">
            Quickly apply pre-configured permission templates to roles
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button
            onClick={() => handleApplyTemplate("consultant")}
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            Apply Consultant Template
          </Button>
          <Button
            onClick={() => handleApplyTemplate("staff")}
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            Apply Staff Template
          </Button>
        </CardContent>
      </Card>

      <Tabs value={activeRole} onValueChange={(value) => setActiveRole(value as "consultant" | "staff")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="consultant">Consultant Access</TabsTrigger>
          <TabsTrigger value="staff">Staff Access</TabsTrigger>
        </TabsList>

        <TabsContent value="consultant" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Consultant Feature Permissions</CardTitle>
              <CardDescription>
                Select which features consultants can access in the dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {FEATURES.map((feature) => (
                  <div key={feature.key} className="flex items-start space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
                    <Checkbox
                      id={`consultant-${feature.key}`}
                      checked={permissions[feature.key] ?? false}
                      onCheckedChange={() => handleToggle(feature.key)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`consultant-${feature.key}`}
                        className="text-sm font-medium text-slate-900 cursor-pointer"
                      >
                        {feature.label}
                      </label>
                      <p className="text-sm text-slate-600">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Staff Feature Permissions</CardTitle>
              <CardDescription>
                Select which features staff members can access in the dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {FEATURES.map((feature) => (
                  <div key={feature.key} className="flex items-start space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
                    <Checkbox
                      id={`staff-${feature.key}`}
                      checked={permissions[feature.key] ?? false}
                      onCheckedChange={() => handleToggle(feature.key)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`staff-${feature.key}`}
                        className="text-sm font-medium text-slate-900 cursor-pointer"
                      >
                        {feature.label}
                      </label>
                      <p className="text-sm text-slate-600">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-teal-600 hover:bg-teal-700"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
        <Button
          onClick={handleReset}
          variant="outline"
          disabled={isSaving}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
