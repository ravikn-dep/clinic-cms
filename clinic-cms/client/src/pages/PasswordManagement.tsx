import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
export default function PasswordManagement() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [changeNewPassword, setChangeNewPassword] = useState("");
  const [changeConfirmPassword, setChangeConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [setError, setSetError] = useState("");
  const [setSuccess, setSetSuccess] = useState("");
  const [changeError, setChangeError] = useState("");
  const [changeSuccess, setChangeSuccess] = useState("");
  const [isSetLoading, setIsSetLoading] = useState(false);
  const [isChangeLoading, setIsChangeLoading] = useState(false);

  const setPasswordMutation = trpc.auth.setPassword.useMutation({
    onSuccess: () => {
      setIsSetLoading(false);
      setSetSuccess("Password set successfully!");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSetSuccess(""), 3000);
    },
    onError: (err) => {
      setIsSetLoading(false);
      setSetError(err.message || "Failed to set password");
    },
  });

  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setIsChangeLoading(false);
      setChangeSuccess("Password changed successfully!");
      setCurrentPassword("");
      setChangeNewPassword("");
      setChangeConfirmPassword("");
      setTimeout(() => setChangeSuccess(""), 3000);
    },
    onError: (err) => {
      setIsChangeLoading(false);
      setChangeError(err.message || "Failed to change password");
    },
  });

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetError("");
    setSetSuccess("");

    if (newPassword !== confirmPassword) {
      setSetError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setSetError("Password must be at least 6 characters");
      return;
    }

    setIsSetLoading(true);
    try {
      await setPasswordMutation.mutateAsync({ password: newPassword });
    } catch {
      setIsSetLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError("");
    setChangeSuccess("");

    if (changeNewPassword !== changeConfirmPassword) {
      setChangeError("New passwords do not match");
      return;
    }

    if (changeNewPassword.length < 6) {
      setChangeError("Password must be at least 6 characters");
      return;
    }

    setIsChangeLoading(true);
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword: changeNewPassword,
      });
    } catch {
      setIsChangeLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Password Management</h1>
        <p className="text-slate-600 mt-2">
          Set or change your password for local authentication
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Set Password Card */}
        <Card>
          <CardHeader>
            <CardTitle>Set Password</CardTitle>
            <CardDescription>
              Create a password to login with your email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetPassword} className="space-y-4">
              {setError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-700">{setError}</p>
                </div>
              )}

              {setSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-700">{setSuccess}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">New Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSetLoading}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Confirm Password</label>
                <Input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSetLoading}
                  minLength={6}
                />
              </div>

              <Button
                type="submit"
                disabled={isSetLoading || !newPassword || !confirmPassword}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                {isSetLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting...
                  </>
                ) : (
                  "Set Password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Update your existing password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {changeError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-700">{changeError}</p>
                </div>
              )}

              {changeSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-700">{changeSuccess}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Current Password</label>
                <Input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={isChangeLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">New Password</label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={changeNewPassword}
                    onChange={(e) => setChangeNewPassword(e.target.value)}
                    disabled={isChangeLoading}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Confirm New Password</label>
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={changeConfirmPassword}
                  onChange={(e) => setChangeConfirmPassword(e.target.value)}
                  disabled={isChangeLoading}
                  minLength={6}
                />
              </div>

              <Button
                type="submit"
                disabled={isChangeLoading || !currentPassword || !changeNewPassword || !changeConfirmPassword}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                {isChangeLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  "Change Password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
