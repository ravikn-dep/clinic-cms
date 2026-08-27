import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { getPasswordLoginErrorMessage } from "@/lib/passwordLogin";

export default function PasswordLogin() {
  const [, setLocation] = useLocation();
  const [userIdOrEmail, setUserIdOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: () => {
      setSuccessMessage("Signed in successfully. Redirecting to your workspace…");
      setIsLoading(false);
      window.location.assign("/");
    },
    onError: (err) => {
      setIsLoading(false);
      setError(getPasswordLoginErrorMessage(err.message));
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      await loginMutation.mutateAsync({
        email: userIdOrEmail.trim(),
        password: password.trim(),
      });
    } catch (err) {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-teal-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-center mb-4">
            <div className="rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800">
              🏥 Dr. Deepthi's Ortho Clinic
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Clinic CMS Login</CardTitle>
          <CardDescription className="text-center">
            Enter your User ID and password to access your clinic workspace
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {successMessage && (
              <div role="status" aria-live="polite" className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-emerald-700" aria-hidden="true">✓</span>
                <p className="text-sm text-emerald-700">{successMessage}</p>
              </div>
            )}

            {error && (
              <div role="alert" aria-live="polite" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">User ID or Email</label>
              <Input
                type="text"
                placeholder="e.g., CONS-001 or your@email.com"
                value={userIdOrEmail}
                onChange={(e) => setUserIdOrEmail(e.target.value)}
                disabled={isLoading}
                required
                className="border-slate-200 focus:border-teal-500 focus:ring-teal-500"
              />
              <p className="text-xs text-slate-500 mt-1">Enter your User ID or Email address</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                  minLength={6}
                  className="border-slate-200 focus:border-teal-500 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !userIdOrEmail || !password}
              aria-busy={isLoading}
              className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>

            <div className="relative py-1" aria-hidden="true">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-slate-500">or</span></div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => { window.location.href = getLoginUrl(); }}
              disabled={isLoading}
              className="w-full border-teal-200 text-teal-800 hover:bg-teal-50"
            >
              Continue with Microsoft
            </Button>

            {/* Help Text */}
            <div className="pt-4 text-center text-sm text-slate-600">
              <p>Contact your clinic administrator if you forgot your credentials</p>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-slate-500">
          © 2026 Dr. Deepthi's Ortho Clinic. All rights reserved.
        </p>
      </div>
    </div>
  );
}
