import { useEffect, useState } from "react";
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
import { requireConsultantAssetUrl } from "@shared/consultantAssetResponse";

type AvailabilityInterval = { dayOfWeek: number; startTime: string; endTime: string; active: boolean };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toAvailabilityDraft(rows: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive: number | null }>): AvailabilityInterval[] {
  return rows.map((row) => ({ dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime, active: Boolean(row.isActive) }));
}

function emptyAvailabilityInterval(dayOfWeek: number): AvailabilityInterval {
  return { dayOfWeek, startTime: "09:00", endTime: "17:00", active: true };
}

function validateAvailabilityDraft(input: AvailabilityInterval[]) {
  const seen = new Set<string>();
  const activeByDay = new Map<number, Array<{ start: number; end: number }>>();
  for (const interval of input) {
    if (!/^\d{2}:\d{2}$/.test(interval.startTime) || !/^\d{2}:\d{2}$/.test(interval.endTime)) return "Enter valid start and end times.";
    const [startHours, startMinutes] = interval.startTime.split(":").map(Number);
    const [endHours, endMinutes] = interval.endTime.split(":").map(Number);
    const start = startHours * 60 + startMinutes;
    const end = endHours * 60 + endMinutes;
    if (start >= end) return `${DAYS[interval.dayOfWeek]} intervals must end after they start.`;
    const identity = `${interval.dayOfWeek}|${interval.startTime}|${interval.endTime}`;
    if (seen.has(identity)) return "Duplicate availability intervals are not allowed.";
    seen.add(identity);
    if (!interval.active) continue;
    const sameDay = activeByDay.get(interval.dayOfWeek) ?? [];
    if (sameDay.some((existing) => start < existing.end && existing.start < end)) return `${DAYS[interval.dayOfWeek]} intervals cannot overlap.`;
    sameDay.push({ start, end });
    activeByDay.set(interval.dayOfWeek, sameDay);
  }
  return null;
}

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
  consultantLocation: string;
  isActive: boolean;
};

const emptyForm = (): FormData => ({
  name: "", password: "", email: "", phone: "", department: "", role: "consultant",
  stateCounsilSection: "", registrationNumber: "", qualifications: "", specialization: "",
  designation: "", prescriptionHeaderText: "", consultantLocation: "", isActive: true,
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
  const [availability, setAvailability] = useState<AvailabilityInterval[]>([]);
  const staffUsers = trpc.rbac.listStaffUsers.useQuery(undefined, { enabled: user?.role === "admin" });
  const availabilityQuery = trpc.consultants.getAvailability.useQuery(
    { consultantId: editingUser?.id ?? 0 },
    { enabled: user?.role === "admin" && Boolean(editingUser?.id) && editingUser?.role === "consultant" },
  );
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
  const updateUser = trpc.rbac.updateStaffUser.useMutation({ onError: showMutationError });
  const updateAvailability = trpc.consultants.updateAvailability.useMutation({
    onError: (error) => toast.error(error.message || "Unable to save consultant availability."),
  });
  const deleteUser = trpc.rbac.deleteStaffUser.useMutation({ onSuccess: () => { utils.rbac.listStaffUsers.invalidate(); toast.success("User removed."); }, onError: showMutationError });
  const uploadAsset = trpc.consultants.uploadAsset.useMutation({
    onSuccess: (_result, variables) => {
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingUser) {
      if (formData.role === "consultant") {
        const availabilityError = validateAvailabilityDraft(availability);
        if (availabilityError) { toast.error(availabilityError); return; }
      }
      const { password: _password, ...updateData } = formData;
      try {
        await updateUser.mutateAsync({ userId: editingUser.userId, ...updateData });
        if (formData.role === "consultant") {
          await updateAvailability.mutateAsync({ consultantId: editingUser.id, availability });
        }
        saveSuccess();
      } catch {
        // The mutation hooks surface safe user-facing errors.
      }
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
      prescriptionHeaderText: staffUser.prescriptionHeaderText || "", consultantLocation: staffUser.consultantLocation || "", isActive: Boolean(staffUser.isActive),
    });
    setAvailability([]);
    setShowForm(true);
  };
  useEffect(() => {
    if (availabilityQuery.data) setAvailability(toAvailabilityDraft(availabilityQuery.data));
  }, [availabilityQuery.data]);

  const addAvailabilityInterval = (dayOfWeek: number) => setAvailability((current) => [...current, emptyAvailabilityInterval(dayOfWeek)]);
  const updateAvailabilityInterval = (index: number, updates: Partial<AvailabilityInterval>) => setAvailability((current) => current.map((interval, currentIndex) => currentIndex === index ? { ...interval, ...updates } : interval));
  const removeAvailabilityInterval = (index: number) => setAvailability((current) => current.filter((_, currentIndex) => currentIndex !== index));

  const handleAsset = async (assetType: "logo" | "signature", file?: File) => {
    if (!editingUser?.id || !file) return;
    try {
      const result = await uploadAsset.mutateAsync({ consultantId: editingUser.id, assetType, dataUrl: await readImageFile(file) });
      const previewField = assetType === "logo" ? "consultantLogoUrl" : "signatureUrl";
      const assetUrl = requireConsultantAssetUrl(result);
      setEditingUser((current: any) => current ? { ...current, [previewField]: assetUrl } : current);
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
        <Field label="OP Location"><Input value={formData.consultantLocation} onChange={(event) => setFormData({ ...formData, consultantLocation: event.target.value })} placeholder="e.g. Punjagutta, Hyderabad" maxLength={500} /></Field>
      </div>
      {editingUser && <>
        <div className="grid gap-3 md:grid-cols-2"><AssetControl label="Upload / Replace Consultant Logo" onFile={(file) => handleAsset("logo", file)} disabled={uploadAsset.isPending} /><AssetControl label="Upload / Replace Digital Signature" onFile={(file) => handleAsset("signature", file)} disabled={uploadAsset.isPending} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <AssetPreview label="Current consultant logo" url={editingUser.consultantLogoUrl} />
          <AssetPreview label="Current digital signature" url={editingUser.signatureUrl} />
        </div>
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div><h3 className="font-semibold text-slate-900">Availability</h3><p className="text-sm text-slate-600">Set one or more active intervals per day. Overlapping intervals cannot be saved.</p></div>
          {DAYS.map((day, dayOfWeek) => {
            const dayIntervals = availability.map((interval, index) => ({ interval, index })).filter(({ interval }) => interval.dayOfWeek === dayOfWeek);
            return <div key={day} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-800">{day}</span><Button type="button" size="sm" variant="outline" onClick={() => addAvailabilityInterval(dayOfWeek)} className="h-8">+ Add interval</Button></div>
              {dayIntervals.length === 0 ? <p className="text-xs text-slate-500">No active hours configured.</p> : dayIntervals.map(({ interval, index }) => <div key={`${day}-${index}`} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <Field label="Start"><Input type="time" value={interval.startTime} onChange={(event) => updateAvailabilityInterval(index, { startTime: event.target.value })} /></Field>
                <Field label="End"><Input type="time" value={interval.endTime} onChange={(event) => updateAvailabilityInterval(index, { endTime: event.target.value })} /></Field>
                <div className="flex items-center gap-2 pb-2"><Switch checked={interval.active} onCheckedChange={(active) => updateAvailabilityInterval(index, { active })} /><Label className="text-xs">Active</Label></div>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeAvailabilityInterval(index)} className="pb-2 text-red-700 hover:text-red-800">Remove</Button>
              </div>)}
            </div>;
          })}
        </div>
      </>}
      {!editingUser && <p className="text-xs text-muted-foreground">Save the consultant first, then upload optional PNG/JPEG logo or signature files (maximum 1.5 MB).</p>}
      </section>}
      <div className="flex gap-2"><Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={createUser.isPending || updateUser.isPending || updateAvailability.isPending}>{editingUser ? "Save User" : "Create User"}</Button><Button type="button" variant="outline" onClick={resetForm}>Cancel</Button></div>
    </form></CardContent></Card>}
    <Card><CardHeader><CardTitle>Users</CardTitle><CardDescription>{staffUsers.data?.length || 0} consultant(s) and staff member(s)</CardDescription></CardHeader><CardContent>{staffUsers.isLoading ? <div className="text-center text-slate-500">Loading users…</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>User ID</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Specialization</TableHead><TableHead>Registration</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{(staffUsers.data || []).map((staffUser: any) => <TableRow key={staffUser.id}><TableCell className="font-mono text-sm">{staffUser.userId}</TableCell><TableCell><div className="font-medium">{staffUser.name}</div><div className="text-xs text-muted-foreground">{staffUser.email || "—"}</div></TableCell><TableCell className="capitalize">{staffUser.role}</TableCell><TableCell>{staffUser.specialization || staffUser.department || "—"}</TableCell><TableCell>{staffUser.registrationNumber || "—"}</TableCell><TableCell>{staffUser.isActive ? "Active" : "Inactive"}</TableCell><TableCell className="flex gap-2"><Button size="sm" variant="outline" onClick={() => handleEdit(staffUser)}><Edit2 className="mr-1 h-3 w-3" />Edit</Button><Button size="sm" variant="outline" onClick={() => handleResetPassword(staffUser)} disabled={resetPassword.isPending}><KeyRound className="mr-1 h-3 w-3" />Reset Password</Button><Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${staffUser.name}?`)) deleteUser.mutate({ userId: staffUser.userId }); }}><Trash2 className="mr-1 h-3 w-3" />Delete</Button></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function AssetControl({ label, onFile, disabled }: { label: string; onFile: (file?: File) => void; disabled: boolean }) { return <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-teal-300 bg-teal-50 px-3 py-4 text-sm font-medium text-teal-900 hover:bg-teal-100"><ImageUp className="h-4 w-4" />{label}<input className="sr-only" type="file" accept="image/png,image/jpeg" disabled={disabled} onChange={(event) => onFile(event.target.files?.[0])} /></label>; }
function AssetPreview({ label, url }: { label: string; url?: string | null }) { return <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>{url ? <img src={url} alt={label} className="max-h-24 w-full object-contain object-left" /> : <p className="text-sm text-slate-500">No file stored.</p>}</div>; }
