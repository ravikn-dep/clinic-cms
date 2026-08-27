import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Edit2, ImageUp, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getUserManagementErrorMessage } from "@shared/userManagementErrors";

type FormData = {
  name: string;
  password: string;
  email: string;
  phone: string;
  department: string;
  role: "consultant" | "staff";
  stateCounsilSection: string;
  registrationNumber: string;
  qualifications: string;
  specialization: string;
  designation: string;
  prescriptionHeaderText: string;
  isActive: boolean;
};

const emptyForm = (): FormData => ({
  name: "", password: "", email: "", phone: "", department: "", role: "consultant",
  stateCounsilSection: "", registrationNumber: "", qualifications: "", specialization: "",
  designation: "", prescriptionHeaderText: "", isActive: true,
});

async function readImageFile(file: File) {
  if (!(file.type === "image/png" || file.type === "image/jpeg")) throw new Error("Only PNG and JPEG images are supported.");
  if (file.size > 1_500_000) throw new Error("Image must be 1.5 MB or smaller.");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export default function UserManagement() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm());
  const staffUsers = trpc.rbac.listStaffUsers.useQuery(undefined, { enabled: user?.role === "admin" });
  const utils = trpc.useUtils();

  const resetForm = () => {
    setEditingUser(null);
    setFormData(emptyForm());
    setShowForm(false);
  };
  const saveSuccess = () => {
    utils.rbac.listStaffUsers.invalidate();
    toast.success(editingUser ? "User updated." : "User created.");
    resetForm();
  };
  const showMutationError = (error: { message: string }) => toast.error(getUserManagementErrorMessage(error.message));
  const createUser = trpc.rbac.createStaffUser.useMutation({ onSuccess: saveSuccess, onError: showMutationError });
  const updateUser = trpc.rbac.updateStaffUser.useMutation({ onSuccess: saveSuccess, onError: showMutationError });
  const deleteUser = trpc.rbac.deleteStaffUser.useMutation({ onSuccess: () => { utils.rbac.listStaffUsers.invalidate(); toast.success("User removed."); }, onError: showMutationError });
  const uploadAsset = trpc.consultants.uploadAsset.useMutation({
    onSuccess: (result, variables) => {
      const previewField = variables.assetType === "logo" ? "consultantLogoUrl" : "signatureUrl";
      setEditingUser((current: any) => current ? { ...current, [previewField]: result.asset.url } : current);
      utils.rbac.listStaffUsers.invalidate();
      toast.success(`${variables.assetType === "logo" ? "Logo" : "Signature"} stored securely.`);
    },
    onError: showMutationError,
  });
  const resetPassword = trpc.rbac.resetUserPassword.useMutation({ onSuccess: () => toast.success("Password reset successfully."), onError: showMutationError });
  const handleResetPassword = (staffUser: any) => {
    const password = window.prompt("Enter a new password (at least 8 characters). It will not be shown again.");
    if (password === null) return;
    if (password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    resetPassword.mutate({ userId: staffUser.userId, password });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingUser) {
      const { password: _password, ...updateData } = formData;
      updateUser.mutate({ userId: editingUser.userId, ...updateData });
    } else {
      const { isActive, password, ...createData } = formData;
      createUser.mutate({ ...createData, password, email: createData.email || undefined });
    }
  };
  const handleEdit = (staffUser: any) => {
    setEditingUser(staffUser);
    setFormData({
      name: staffUser.name || "", password: "", email: staffUser.email || "", phone: staffUser.phone || "", department: staffUser.department || "",
      role: staffUser.role, stateCounsilSection: staffUser.stateCounsilSection || "", registrationNumber: staffUser.registrationNumber || "",
      qualifications: staffUser.qualifications || "", specialization: staffUser.specialization || "", designation: staffUser.designation || "",
      prescriptionHeaderText: staffUser.prescriptionHeaderText || "", isActive: Boolean(staffUser.isActive),
    });
    setShowForm(true);
  };
  const handleAsset = async (assetType: "logo" | "signature", file?: File) => {
    if (!editingUser?.id || !file) return;
    try {
      await uploadAsset.mutateAsync({ consultantId: editingUser.id, assetType, dataUrl: await readImageFile(file) });
    } catch (error) {
      toast.error(getUserManagementErrorMessage(error instanceof Error ? error.message : "Unable to upload consultant image."));
    }
  };

  if (user?.role !== "admin") return <div className="p-6"><Card className="border-red-200 bg-red-50"><CardHeader><CardTitle className="text-red-900">Access Denied</CardTitle></CardHeader><CardContent className="text-red-800">Only administrators can manage user and consultant credentials.</CardContent></Card></div>;
  const consultant = formData.role === "consultant";

  return <div className="space-y-6 p-6">
    <div className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-900">User Management</h1><p className="text-slate-600">Manage staff accounts and consultant identity under Settings → Users.</p></div><Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2 bg-teal-600 hover:bg-teal-700"><Plus className="h-4 w-4" /> Add User</Button></div>
    {showForm && <Card className="border-teal-200 bg-teal-50"><CardHeader><CardTitle>{editingUser ? "Edit User" : "Create New User"}</CardTitle><CardDescription>Consultant registration and branding data is authoritative and admin-controlled.</CardDescription></CardHeader><CardContent><form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Display Name *"><Input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required /></Field>
        {!editingUser && <Field label="Initial Password *"><Input type="password" minLength={8} value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} required autoComplete="new-password" /></Field>}
        <Field label="Role *"><Select value={formData.role} onValueChange={(role: "consultant" | "staff") => setFormData({ ...formData, role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="consultant">Consultant</SelectItem><SelectItem value="staff">Staff</SelectItem></SelectContent></Select></Field>
        <Field label="Email"><Input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} /></Field>
        <Field label="Phone"><Input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} /></Field>
        <Field label="Department"><Input value={formData.department} onChange={(event) => setFormData({ ...formData, department: event.target.value })} /></Field>
        {editingUser && <div className="flex items-end gap-3 pb-2"><Switch checked={formData.isActive} onCheckedChange={(isActive) => setFormData({ ...formData, isActive })} /><Label>Active account</Label></div>}
      </div>
      {consultant && <section className="space-y-4 rounded-xl border border-teal-200 bg-white/75 p-4"><div><h2 className="font-semibold text-teal-950">Consultant Details</h2><p className="text-sm text-slate-600">This identity appears on the left side of that consultant’s OP document.</p></div><div className="grid gap-4 md:grid-cols-2">
        <Field label="Qualifications"><Input value={formData.qualifications} onChange={(event) => setFormData({ ...formData, qualifications: event.target.value })} /></Field>
        <Field label="Specialization"><Input value={formData.specialization} onChange={(event) => setFormData({ ...formData, specialization: event.target.value })} /></Field>
        <Field label="Designation"><Input value={formData.designation} onChange={(event) => setFormData({ ...formData, designation: event.target.value })} /></Field>
        <Field label="Registration Council"><Input value={formData.stateCounsilSection} onChange={(event) => setFormData({ ...formData, stateCounsilSection: event.target.value })} /></Field>
        <Field label="Registration Number"><Input value={formData.registrationNumber} onChange={(event) => setFormData({ ...formData, registrationNumber: event.target.value })} /></Field>
        <Field label="Prescription Header Text"><Input value={formData.prescriptionHeaderText} onChange={(event) => setFormData({ ...formData, prescriptionHeaderText: event.target.value })} /></Field>
      </div>
      {editingUser && <>
        <div className="grid gap-3 md:grid-cols-2"><AssetControl label="Upload / Replace Consultant Logo" onFile={(file) => handleAsset("logo", file)} disabled={uploadAsset.isPending} /><AssetControl label="Upload / Replace Digital Signature" onFile={(file) => handleAsset("signature", file)} disabled={uploadAsset.isPending} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <AssetPreview label="Current consultant logo" url={editingUser.consultantLogoUrl} />
          <AssetPreview label="Current digital signature" url={editingUser.signatureUrl} />
        </div>
      </>}
      {!editingUser && <p className="text-xs text-muted-foreground">Save the consultant first, then upload optional PNG/JPEG logo or signature files (maximum 1.5 MB).</p>}
      </section>}
      <div className="flex gap-2"><Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={createUser.isPending || updateUser.isPending}>{editingUser ? "Save User" : "Create User"}</Button><Button type="button" variant="outline" onClick={resetForm}>Cancel</Button></div>
    </form></CardContent></Card>}
    <Card><CardHeader><CardTitle>Users</CardTitle><CardDescription>{staffUsers.data?.length || 0} consultant(s) and staff member(s)</CardDescription></CardHeader><CardContent>{staffUsers.isLoading ? <div className="text-center text-slate-500">Loading users…</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>User ID</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Specialization</TableHead><TableHead>Registration</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{(staffUsers.data || []).map((staffUser: any) => <TableRow key={staffUser.id}><TableCell className="font-mono text-sm">{staffUser.userId}</TableCell><TableCell><div className="font-medium">{staffUser.name}</div><div className="text-xs text-muted-foreground">{staffUser.email || "—"}</div></TableCell><TableCell className="capitalize">{staffUser.role}</TableCell><TableCell>{staffUser.specialization || staffUser.department || "—"}</TableCell><TableCell>{staffUser.registrationNumber || "—"}</TableCell><TableCell>{staffUser.isActive ? "Active" : "Inactive"}</TableCell><TableCell className="flex gap-2"><Button size="sm" variant="outline" onClick={() => handleEdit(staffUser)}><Edit2 className="mr-1 h-3 w-3" />Edit</Button><Button size="sm" variant="outline" onClick={() => handleResetPassword(staffUser)} disabled={resetPassword.isPending}><KeyRound className="mr-1 h-3 w-3" />Reset Password</Button><Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${staffUser.name}?`)) deleteUser.mutate({ userId: staffUser.userId }); }}><Trash2 className="mr-1 h-3 w-3" />Delete</Button></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function AssetControl({ label, onFile, disabled }: { label: string; onFile: (file?: File) => void; disabled: boolean }) { return <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-teal-300 bg-teal-50 px-3 py-4 text-sm font-medium text-teal-900 hover:bg-teal-100"><ImageUp className="h-4 w-4" />{label}<input className="sr-only" type="file" accept="image/png,image/jpeg" disabled={disabled} onChange={(event) => onFile(event.target.files?.[0])} /></label>; }
function AssetPreview({ label, url }: { label: string; url?: string | null }) { return <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>{url ? <img src={url} alt={label} className="max-h-24 w-full object-contain object-left" /> : <p className="text-sm text-slate-500">No file stored.</p>}</div>; }
