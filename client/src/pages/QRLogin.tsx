import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QrCode, Loader2, AlertCircle } from "lucide-react";

export default function QRLogin() {
  const [qrData, setQrData] = useState("");
  const [manualUserId, setManualUserId] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loginWithQR = trpc.rbac.loginWithQRCode.useMutation({
    onSuccess: (data) => {
      setSuccess(true);
      setError("");
      // Store user session or redirect to dashboard
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    },
    onError: (error) => {
      setError(error.message || "Login failed. Please try again.");
      setIsLoading(false);
    },
  });

  const handleQRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError("");

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageData = event.target?.result as string;
        // In a real implementation, you would decode the QR code image
        // For now, we'll show a placeholder message
        setError("QR code scanning requires a QR decoder library. Please use manual entry or scan with your device camera.");
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Failed to read QR code image");
      setIsLoading(false);
    }
  };

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
          <CardTitle>Staff Login</CardTitle>
          <CardDescription>
            Scan your QR code or enter your credentials to access the clinic system
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
              <div className="h-4 w-4 flex-shrink-0 mt-0.5 rounded-full bg-green-600" />
              <p>Login successful! Redirecting...</p>
            </div>
          )}

          {!useManual ? (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-teal-300 bg-teal-50 p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleQRUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="w-full gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <QrCode className="h-4 w-4" />
                      Upload QR Code
                    </>
                  )}
                </Button>
                <p className="mt-3 text-xs text-teal-700">
                  Or use your device camera to scan the QR code
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-slate-500">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={() => setUseManual(true)}
                className="w-full"
              >
                Enter Credentials Manually
              </Button>
            </div>
          ) : (
            <form onSubmit={handleManualLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  User ID
                </label>
                <Input
                  type="text"
                  value={manualUserId}
                  onChange={(e) => setManualUserId(e.target.value)}
                  placeholder="e.g., CONS-001"
                  disabled={isLoading}
                  required
                />
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
                  disabled={isLoading}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-teal-600 hover:bg-teal-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setUseManual(false);
                  setManualUserId("");
                  setManualPassword("");
                  setError("");
                }}
                className="w-full"
              >
                Back to QR Code
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
