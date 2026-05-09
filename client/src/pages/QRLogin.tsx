import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QrCode, Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function QRLogin() {
  const [manualUserId, setManualUserId] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const loginWithQR = trpc.rbac.loginWithQRCode.useMutation({
    onSuccess: (data) => {
      setSuccess(true);
      setError("");
      // Redirect to dashboard after successful login
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    },
    onError: (error) => {
      setError(error.message || "Login failed. Please try again.");
      setIsLoading(false);
    },
  });

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUserId || !manualPassword) {
      setError("Please enter both User ID and Password");
      return;
    }

    setIsLoading(true);
    setError("");

    // Encode credentials to base64 (simulating QR code data)
    const encodedData = btoa(`${manualUserId}:${manualPassword}`);
    loginWithQR.mutate({ encodedData });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-white to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-teal-100 p-3">
              <QrCode className="h-6 w-6 text-teal-600" />
            </div>
          </div>
          <CardTitle>Staff & Consultant Login</CardTitle>
          <CardDescription>
            Enter your credentials to access the clinic system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>Login successful! Redirecting to dashboard...</p>
            </div>
          )}

          <form onSubmit={handleManualLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                User ID
              </label>
              <Input
                type="text"
                value={manualUserId}
                onChange={(e) => setManualUserId(e.target.value)}
                placeholder="e.g., CONS-001 or STAFF-001"
                disabled={isLoading || success}
                required
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-1">
                Example: CONS-001 for consultant, STAFF-001 for staff
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <Input
                type="password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isLoading || success}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700"
              disabled={isLoading || success}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : success ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Login Successful
                </>
              ) : (
                "Login"
              )}
            </Button>
          </form>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            <p className="font-semibold mb-1">Test Credentials:</p>
            <p className="mb-1">
              <strong>Consultant:</strong> CONS-001 / mpwM3dgl
            </p>
            <p>
              <strong>Staff:</strong> STAFF-001 / 1ZVOc@uD
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
