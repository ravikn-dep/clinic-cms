import { FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCredentialAuth } from "@/_core/hooks/useCredentialAuth";
import { getRoleLabel } from "@/lib/featureAccess";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Copy,
  Edit2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  UserCheck,
  UserX,
} from "lucide-react";

type StaffRole = "consultant" | "staff";

type StaffUser = {
  id: number;
  userId: string | null;
  username: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: string;
  isActive: boolean | null;
  stateCounsilSection: string | null;
  registrationNumber: string | null;
  createdAt: Date;
  lastSignedIn: Date;
};

type UserFormState = {
  name: string;
  email: string;
  phone: string;
  department: string;
  role: StaffRole;
  stateCounsilSection: string;
  registrationNumber: string;
};

const emptyForm: UserFormState = {
  name: "",
  email: "",
  phone: "",
  department: "",
  role: "consultant",
  stateCounsilSection: "",
  registrationNumber: "",
};

export default function UserManagement() {
  const { user } = useCredentialAuth();
  const utils = trpc.useUtils();
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [credentials, setCredentials] = useState<{
    userId: string;
    username: string;
    tempPassword: string;
  } | null>(null);
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [customPassword, setCustomPassword] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<StaffUser | null>(null);

  const staffUsersQuery = trpc.rbac.listStaffUsers.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const createUser = trpc.rbac.createStaffUser.useMutation({
    onSuccess: (result) => {
      toast.success(`User ${result.userId} created.`);
      setCredentials({
        userId: result.userId,
        username: result.username,
        tempPassword: result.tempPassword,
      });
      setForm(emptyForm);
      setFormOpen(false);
      setEditingUser(null);
      utils.rbac.listStaffUsers.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to create user."),
  });

  const updateUser = trpc.rbac.updateStaffUser.useMutation({
    onSuccess: () => {
      toast.success("User updated.");
      setForm(emptyForm);
      setFormOpen(false);
      setEditingUser(null);
      utils.rbac.listStaffUsers.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to update user."),
  });

  const resetPassword = trpc.rbac.resetStaffPassword.useMutation({
    onSuccess: (result) => {
      if (result.tempPassword) {
        setCredentials({
          userId: resetTarget?.userId ?? "",
          username: result.username ?? resetTarget?.username ?? "",
          tempPassword: result.tempPassword,
        });
        toast.success("Temporary password generated.");
      } else {
        toast.success("Password reset successfully.");
      }
      setResetTarget(null);
      setCustomPassword("");
    },
    onError: (error) => toast.error(error.message || "Failed to reset password."),
  });

  const setStaffActive = trpc.rbac.setStaffActive.useMutation({
    onSuccess: (result) => {
      toast.success(result.isActive ? "User reactivated." : "User deactivated.");
      setDeactivateTarget(null);
      utils.rbac.listStaffUsers.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to update account status."),
  });

  if (user?.role !== "admin") {
    return (
      <div className="friendly-page">
        <Card className="border-red-200 bg-red-50 max-w-lg">
          <CardHeader>
            <CardTitle className="text-red-900">Admin access required</CardTitle>
            <CardDescription className="text-red-800">
              Only clinic administrators can manage users. Doctors and staff cannot access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const staffUsers = (staffUsersQuery.data ?? []) as StaffUser[];

  const openCreateForm = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEditForm = (staffUser: StaffUser) => {
    setEditingUser(staffUser);
    setForm({
      name: staffUser.name ?? "",
      email: staffUser.email ?? "",
      phone: staffUser.phone ?? "",
      department: staffUser.department ?? "",
      role: (staffUser.role === "staff" ? "staff" : "consultant") as StaffRole,
      stateCounsilSection: staffUser.stateCounsilSection ?? "",
      registrationNumber: staffUser.registrationNumber ?? "",
    });
    setFormOpen(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      department: form.department.trim() || undefined,
      role: form.role,
      stateCounsilSection:
        form.role === "consultant" ? form.stateCounsilSection.trim() || undefined : undefined,
      registrationNumber:
        form.role === "consultant" ? form.registrationNumber.trim() || undefined : undefined,
    };

    if (editingUser?.userId) {
      updateUser.mutate({
        userId: editingUser.userId,
        ...payload,
      });
    } else {
      createUser.mutate(payload);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleResetPassword = (generateTemp: boolean) => {
    if (!resetTarget?.userId) return;
    if (!generateTemp) {
      if (customPassword.length < 6) {
        toast.error("Password must be at least 6 characters.");
        return;
      }
      resetPassword.mutate({ userId: resetTarget.userId, password: customPassword });
      return;
    }
    resetPassword.mutate({ userId: resetTarget.userId });
  };

  return (
    <div className="friendly-page space-y-8">
      <div className="friendly-hero flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-teal-950">User Management</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Admin only — create doctor and staff accounts, assign roles, reset passwords, and deactivate users.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={openCreateForm}
            className="friendly-action bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create user
          </Button>
          <Button
            variant="outline"
            onClick={() => staffUsersQuery.refetch()}
            disabled={staffUsersQuery.isFetching}
            className="friendly-action"
          >
            <RefreshCcw
              className={`mr-2 h-4 w-4 ${staffUsersQuery.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="friendly-card">
        <CardHeader>
          <CardTitle>Clinic users</CardTitle>
          <CardDescription>
            {staffUsersQuery.isLoading
              ? "Loading..."
              : `${staffUsers.length} doctor and staff account(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staffUsersQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading users...
            </div>
          ) : staffUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
              No users yet. Create a doctor or staff account to get started.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffUsers.map((staffUser) => (
                    <TableRow key={staffUser.id}>
                      <TableCell className="font-mono text-xs">{staffUser.userId}</TableCell>
                      <TableCell>
                        <p className="font-medium">{staffUser.name}</p>
                        {staffUser.department && (
                          <p className="text-xs text-muted-foreground">{staffUser.department}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getRoleLabel(staffUser.role)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {staffUser.username ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <p>{staffUser.email || "—"}</p>
                        <p className="text-xs text-muted-foreground">{staffUser.phone || ""}</p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            staffUser.isActive !== false
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-slate-100 text-slate-600"
                          }
                        >
                          {staffUser.isActive !== false ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditForm(staffUser)}
                          >
                            <Edit2 className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setResetTarget(staffUser);
                              setCustomPassword("");
                            }}
                          >
                            <KeyRound className="mr-1 h-3 w-3" />
                            Reset password
                          </Button>
                          {staffUser.isActive !== false ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-amber-700 border-amber-200 hover:bg-amber-50"
                              onClick={() => setDeactivateTarget(staffUser)}
                            >
                              <UserX className="mr-1 h-3 w-3" />
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-700 border-green-200 hover:bg-green-50"
                              onClick={() => {
                                if (staffUser.userId) {
                                  setStaffActive.mutate({
                                    userId: staffUser.userId,
                                    isActive: true,
                                  });
                                }
                              }}
                              disabled={setStaffActive.isPending}
                            >
                              <UserCheck className="mr-1 h-3 w-3" />
                              Reactivate
                            </Button>
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit user" : "Create user"}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Update profile details or change role between Doctor and Staff."
                : "A temporary password will be generated. Share login credentials with the user securely."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Full name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={form.role}
                  onValueChange={(value: StaffRole) => setForm({ ...form, role: value })}
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultant">Doctor</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              {form.role === "consultant" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="council">State council section</Label>
                    <Input
                      id="council"
                      value={form.stateCounsilSection}
                      onChange={(e) =>
                        setForm({ ...form, stateCounsilSection: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="registration">Registration number</Label>
                    <Input
                      id="registration"
                      value={form.registrationNumber}
                      onChange={(e) =>
                        setForm({ ...form, registrationNumber: e.target.value })
                      }
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700"
                disabled={createUser.isPending || updateUser.isPending}
              >
                {(createUser.isPending || updateUser.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingUser ? "Save changes" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(credentials)} onOpenChange={(open) => !open && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login credentials</DialogTitle>
            <DialogDescription>
              Share these details securely. The user should change their password after first login.
            </DialogDescription>
          </DialogHeader>
          {credentials && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">User ID</span>
                <span className="font-mono font-medium">{credentials.userId}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Username</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{credentials.username}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => copyText(credentials.username, "Username")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Password</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{credentials.tempPassword}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => copyText(credentials.tempPassword, "Password")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(resetTarget)} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password</AlertDialogTitle>
            <AlertDialogDescription>
              Reset password for {resetTarget?.name} ({resetTarget?.userId}). Generate a temporary
              password or set a custom one (min. 6 characters).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="customPassword">Custom password (optional)</Label>
            <Input
              id="customPassword"
              type="password"
              value={customPassword}
              onChange={(e) => setCustomPassword(e.target.value)}
              placeholder="Leave empty to generate temporary password"
              minLength={6}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleResetPassword(false);
              }}
              disabled={resetPassword.isPending || customPassword.length < 6}
            >
              Set custom password
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleResetPassword(true);
              }}
              disabled={resetPassword.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {resetPassword.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Generate temporary
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.name} will no longer be able to sign in. You can reactivate the
              account later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                if (deactivateTarget?.userId) {
                  setStaffActive.mutate({
                    userId: deactivateTarget.userId,
                    isActive: false,
                  });
                }
              }}
              disabled={setStaffActive.isPending}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
