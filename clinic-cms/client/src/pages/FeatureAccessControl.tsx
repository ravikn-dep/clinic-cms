import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle, UserCog, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { FEATURES, getRoleLabel } from "@/lib/featureAccess";
import { Badge } from "@/components/ui/badge";

export default function FeatureAccessControl() {
  const [mode, setMode] = useState<"role" | "user">("role");
  const [activeRole, setActiveRole] = useState<"consultant" | "staff">("consultant");
  const [consultantPerms, setConsultantPerms] = useState<Record<string, boolean>>({});
  const [staffPerms, setStaffPerms] = useState<Record<string, boolean>>({});
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userPerms, setUserPerms] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: consultantData,
    isLoading: consultantLoading,
    isError: consultantError,
  } = trpc.featureAccess.getPermissions.useQuery({ role: "consultant" });

  const {
    data: staffData,
    isLoading: staffLoading,
    isError: staffError,
  } = trpc.featureAccess.getPermissions.useQuery({ role: "staff" });

  const { data: assignableUsers, isLoading: usersLoading } =
    trpc.featureAccess.listAssignableUsers.useQuery();

  const selectedUserNumericId = selectedUserId ? Number(selectedUserId) : null;

  const {
    data: userPermissionData,
    isLoading: userPermsLoading,
    refetch: refetchUserPerms,
  } = trpc.featureAccess.getUserPermissions.useQuery(
    { userId: selectedUserNumericId! },
    { enabled: selectedUserNumericId !== null && !Number.isNaN(selectedUserNumericId) }
  );

  useEffect(() => {
    if (!consultantLoading && !staffLoading) {
      if (consultantData) setConsultantPerms(consultantData);
      if (staffData) setStaffPerms(staffData);
      setIsLoading(false);
    }
  }, [consultantData, staffData, consultantLoading, staffLoading]);

  useEffect(() => {
    if (userPermissionData?.effective) {
      setUserPerms(userPermissionData.effective);
    }
  }, [userPermissionData]);

  const currentRolePerms = activeRole === "consultant" ? consultantPerms : staffPerms;
  const setCurrentRolePerms =
    activeRole === "consultant" ? setConsultantPerms : setStaffPerms;

  const handleRoleToggle = (featureKey: string) => {
    setCurrentRolePerms((prev) => ({
      ...prev,
      [featureKey]: !prev[featureKey],
    }));
  };

  const handleUserToggle = (featureKey: string) => {
    setUserPerms((prev) => ({
      ...prev,
      [featureKey]: !prev[featureKey],
    }));
  };

  const updateRoleMutation = trpc.featureAccess.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success("Role permissions saved");
      setIsSaving(false);
      setError(null);
    },
    onError: (err: { message?: string }) => {
      const errorMsg = err?.message || "Failed to update permissions";
      toast.error(errorMsg);
      setError(errorMsg);
      setIsSaving(false);
    },
  });

  const updateUserMutation = trpc.featureAccess.updateUserPermissions.useMutation({
    onSuccess: async () => {
      toast.success("User permissions saved");
      setIsSaving(false);
      setError(null);
      await refetchUserPerms();
    },
    onError: (err: { message?: string }) => {
      const errorMsg = err?.message || "Failed to update user permissions";
      toast.error(errorMsg);
      setError(errorMsg);
      setIsSaving(false);
    },
  });

  const clearUserMutation = trpc.featureAccess.clearUserPermissions.useMutation({
    onSuccess: async () => {
      toast.success("User now inherits role permissions");
      setIsSaving(false);
      setError(null);
      await refetchUserPerms();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to clear user overrides");
      setIsSaving(false);
    },
  });

  const utils = trpc.useUtils();

  const applyTemplateMutation = trpc.featureAccess.applyTemplate.useMutation({
    onSuccess: async (_, variables) => {
      toast.success("Template applied");
      setIsSaving(false);
      setError(null);
      await utils.featureAccess.getPermissions.invalidate({ role: variables.role });
      const updated = await utils.featureAccess.getPermissions.fetch({ role: variables.role });
      if (variables.role === "consultant") {
        setConsultantPerms(updated);
      } else {
        setStaffPerms(updated);
      }
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to apply template");
      setIsSaving(false);
    },
  });

  const handleSaveRole = async () => {
    setError(null);
    setIsSaving(true);
    const permsToSave = activeRole === "consultant" ? consultantPerms : staffPerms;
    await updateRoleMutation.mutateAsync({
      role: activeRole,
      permissions: permsToSave,
    });
  };

  const handleSaveUser = async () => {
    if (!selectedUserNumericId) return;
    setError(null);
    setIsSaving(true);
    await updateUserMutation.mutateAsync({
      userId: selectedUserNumericId,
      permissions: userPerms,
    });
  };

  const handleClearUserOverrides = async () => {
    if (!selectedUserNumericId) return;
    setError(null);
    setIsSaving(true);
    await clearUserMutation.mutateAsync({ userId: selectedUserNumericId });
  };

  const handleResetRole = () => {
    if (activeRole === "consultant" && consultantData) {
      setConsultantPerms(consultantData);
    } else if (activeRole === "staff" && staffData) {
      setStaffPerms(staffData);
    }
    setError(null);
  };

  const handleResetUser = () => {
    if (userPermissionData?.effective) {
      setUserPerms(userPermissionData.effective);
    }
    setError(null);
  };

  const handleApplyTemplate = async (template: "consultant" | "staff") => {
    setError(null);
    setIsSaving(true);
    await applyTemplateMutation.mutateAsync({ role: activeRole, template });
  };

  const renderFeatureList = (
    perms: Record<string, boolean>,
    onToggle: (key: string) => void,
    idPrefix: string
  ) => (
    <div className="grid gap-4">
      {FEATURES.map((feature) => (
        <div
          key={feature.key}
          className="flex items-start space-x-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        >
          <input
            type="checkbox"
            id={`${idPrefix}-${feature.key}`}
            checked={perms[feature.key] ?? false}
            onChange={() => onToggle(feature.key)}
            disabled={isSaving}
            className="mt-1 h-4 w-4 cursor-pointer"
          />
          <div className="flex-1">
            <label
              htmlFor={`${idPrefix}-${feature.key}`}
              className="cursor-pointer text-sm font-medium text-slate-900"
            >
              {feature.label}
            </label>
            <p className="text-sm text-slate-600">{feature.description}</p>
          </div>
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (consultantError || staffError) {
    return (
      <div className="space-y-6 p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Could not load feature permissions. Ensure you are signed in as an administrator and the database is available.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedUser = assignableUsers?.find((u) => String(u.id) === selectedUserId);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Feature Access Control</h1>
        <p className="mt-2 text-slate-600">
          Assign dashboard features by role (Doctor / Staff) or override access for individual users.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={mode} onValueChange={(v) => setMode(v as "role" | "user")}>
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="role" className="gap-2">
            <Users className="h-4 w-4" />
            By role
          </TabsTrigger>
          <TabsTrigger value="user" className="gap-2">
            <UserCog className="h-4 w-4" />
            By user
          </TabsTrigger>
        </TabsList>

        <TabsContent value="role" className="space-y-4">
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-blue-900">Role templates</CardTitle>
              <CardDescription className="text-blue-800">
                Defaults for all doctors or all staff. Individual users inherit these unless customized.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                onClick={() => handleApplyTemplate("consultant")}
                variant="outline"
                disabled={isSaving}
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                Apply doctor template
              </Button>
              <Button
                onClick={() => handleApplyTemplate("staff")}
                variant="outline"
                disabled={isSaving}
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                Apply staff template
              </Button>
            </CardContent>
          </Card>

          <Tabs
            value={activeRole}
            onValueChange={(value) => setActiveRole(value as "consultant" | "staff")}
          >
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="consultant">Doctor (consultant)</TabsTrigger>
              <TabsTrigger value="staff">Staff</TabsTrigger>
            </TabsList>

            <TabsContent value="consultant">
              <Card>
                <CardHeader>
                  <CardTitle>Doctor role permissions</CardTitle>
                  <CardDescription>Applies to every user with the doctor role unless overridden per user.</CardDescription>
                </CardHeader>
                <CardContent>{renderFeatureList(consultantPerms, handleRoleToggle, "consultant")}</CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="staff">
              <Card>
                <CardHeader>
                  <CardTitle>Staff role permissions</CardTitle>
                  <CardDescription>Applies to every user with the staff role unless overridden per user.</CardDescription>
                </CardHeader>
                <CardContent>{renderFeatureList(staffPerms, handleRoleToggle, "staff")}</CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex gap-3">
            <Button onClick={handleSaveRole} disabled={isSaving} className="bg-teal-600 hover:bg-teal-700">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save role changes
            </Button>
            <Button onClick={handleResetRole} variant="outline" disabled={isSaving}>
              Reset
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="user" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assign features to a user</CardTitle>
              <CardDescription>
                Pick a doctor or staff member and enable or disable features for them. Overrides apply on top of their role defaults.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-md space-y-2">
                <label className="text-sm font-medium text-slate-700">User</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder={usersLoading ? "Loading users..." : "Select a user"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(assignableUsers ?? []).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name ?? u.userId} — {getRoleLabel(u.role)}
                        {u.userId ? ` (${u.userId})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUser && userPermissionData && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span>
                    Role baseline: <strong>{getRoleLabel(selectedUser.role)}</strong>
                  </span>
                  {userPermissionData.hasCustomOverrides ? (
                    <Badge variant="secondary">Custom overrides active</Badge>
                  ) : (
                    <Badge variant="outline">Using role defaults only</Badge>
                  )}
                </div>
              )}

              {!selectedUserId && (
                <p className="text-sm text-muted-foreground">Select a user to configure their feature access.</p>
              )}

              {selectedUserId && userPermsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading permissions...
                </div>
              )}

              {selectedUserId && !userPermsLoading && userPermissionData && (
                <>
                  {renderFeatureList(userPerms, handleUserToggle, `user-${selectedUserId}`)}
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      onClick={handleSaveUser}
                      disabled={isSaving}
                      className="bg-teal-600 hover:bg-teal-700"
                    >
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save user access
                    </Button>
                    <Button onClick={handleResetUser} variant="outline" disabled={isSaving}>
                      Reset
                    </Button>
                    {userPermissionData.hasCustomOverrides && (
                      <Button
                        onClick={handleClearUserOverrides}
                        variant="outline"
                        disabled={isSaving}
                        className="text-amber-700 border-amber-300 hover:bg-amber-50"
                      >
                        Clear overrides (use role only)
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
