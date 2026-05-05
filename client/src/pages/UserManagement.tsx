import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Edit2, Plus, Download } from "lucide-react";

export default function UserManagement() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    role: "consultant" as "consultant" | "staff",
  });

  const staffUsers = trpc.rbac.listStaffUsers.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const createUser = trpc.rbac.createStaffUser.useMutation({
    onSuccess: () => {
      staffUsers.refetch();
      setFormData({ name: "", email: "", phone: "", department: "", role: "consultant" });
      setShowForm(false);
      alert("Staff user created successfully!");
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  const updateUser = trpc.rbac.updateStaffUser.useMutation({
    onSuccess: () => {
      staffUsers.refetch();
      setEditingUser(null);
      setFormData({ name: "", email: "", phone: "", department: "", role: "consultant" });
      alert("Staff user updated successfully!");
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  const deleteUser = trpc.rbac.deleteStaffUser.useMutation({
    onSuccess: () => {
      staffUsers.refetch();
      alert("Staff user deleted successfully!");
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      updateUser.mutate({
        userId: editingUser.userId,
        ...formData,
      });
    } else {
      createUser.mutate(formData);
    }
  };

  const handleEdit = (staffUser: any) => {
    setEditingUser(staffUser);
    setFormData({
      name: staffUser.name || "",
      email: staffUser.email || "",
      phone: staffUser.phone || "",
      department: staffUser.department || "",
      role: staffUser.role,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormData({ name: "", email: "", phone: "", department: "", role: "consultant" });
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-red-800">
            Only administrators can manage staff users.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-600">Create and manage consultant and staff accounts</p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="gap-2 bg-teal-600 hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          Add Staff User
        </Button>
      </div>

      {showForm && (
        <Card className="border-teal-200 bg-teal-50">
          <CardHeader>
            <CardTitle>{editingUser ? "Edit Staff User" : "Create New Staff User"}</CardTitle>
            <CardDescription>
              {editingUser
                ? "Update staff member details"
                : "Add a new consultant or staff member to the system"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Name *</label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Full name"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Role *</label>
                  <Select value={formData.role} onValueChange={(value: any) => setFormData({ ...formData, role: value })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consultant">Consultant</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Email</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Phone</label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Department</label>
                  <Input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="e.g., Orthopedics, General"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="bg-teal-600 hover:bg-teal-700">
                  {editingUser ? "Update User" : "Create User"}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Staff Members</CardTitle>
          <CardDescription>
            {staffUsers.data?.length || 0} consultant(s) and staff member(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staffUsers.isLoading ? (
            <div className="text-center text-slate-500">Loading staff users...</div>
          ) : staffUsers.data && staffUsers.data.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffUsers.data.map((staffUser: any) => (
                    <TableRow key={staffUser.id}>
                      <TableCell className="font-mono text-sm">{staffUser.userId}</TableCell>
                      <TableCell className="font-medium">{staffUser.name}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          staffUser.role === "consultant"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800"
                        }`}>
                          {staffUser.role}
                        </span>
                      </TableCell>
                      <TableCell>{staffUser.email || "-"}</TableCell>
                      <TableCell>{staffUser.phone || "-"}</TableCell>
                      <TableCell>{staffUser.department || "-"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          staffUser.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {staffUser.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(staffUser)}
                          className="gap-1"
                        >
                          <Edit2 className="h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm(`Delete ${staffUser.name}?`)) {
                              deleteUser.mutate({ userId: staffUser.userId });
                            }
                          }}
                          className="gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center text-slate-500">No staff users yet. Create one to get started.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
