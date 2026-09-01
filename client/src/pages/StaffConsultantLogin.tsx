import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { confirmCredentialLoginAndNavigate } from "@/lib/credentialLoginNavigation";

export default function StaffConsultantLogin() {
  const [userIdOrEmail, setUserIdOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const submissionInProgress = useRef(false);
  const loginMutation = trpc.auth.loginWithPassword.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || submissionInProgress.current || loginMutation.isPending) return;
    setError("");
    setIsLoading(true);
    submissionInProgress.current = true;

    try {
      await loginMutation.mutateAsync({
        email: userIdOrEmail.trim(),
        password: password.trim(),
      });
      await confirmCredentialLoginAndNavigate({
        refreshAuthenticatedUser: () => utils.auth.me.fetch(),
        navigate: setLocation,
      });
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Login failed. Please check your credentials.");
    } finally {
      submissionInProgress.current = false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-blue-50 p-4 relative overflow-hidden">
      <div>
        <Card className="w-full max-w-md shadow-lg border-teal-100">
          <CardHeader className="space-y-2 bg-gradient-to-r from-teal-50 to-blue-50">
            <div className="flex items-center justify-center mb-4">
              {/* Holographic Logo */}
              <style>{`
                @keyframes holographicGlow {
                  0%, 100% { 
                    filter: drop-shadow(0 0 8px rgba(20, 184, 166, 0.4)) drop-shadow(0 0 16px rgba(59, 130, 246, 0.2));
                  }
                  50% { 
                    filter: drop-shadow(0 0 12px rgba(20, 184, 166, 0.6)) drop-shadow(0 0 24px rgba(59, 130, 246, 0.3));
                  }
                }
                .holographic-logo {
                  animation: holographicGlow 3s ease-in-out infinite;
                }
              `}</style>
              <div className="holographic-logo">
                <img 
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663610523383/47itfTjNF9LgnsoJ4nN2Uu/deepthis-ortho-logo-d-YAeHZCG69ek8URaAkYo7Nz.webp"
                  alt="Deepthis Ortho Clinic"
                  className="h-16 w-16"
                />
              </div>
            </div>
            <CardTitle className="text-2xl text-center text-teal-900">Staff & Consultant Portal</CardTitle>
            <CardDescription className="text-center text-slate-600">
              Access your clinic workspace with your credentials
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
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
                <p className="text-xs text-slate-500 mt-1">Enter your assigned User ID or Email address</p>
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

              {/* Help Text */}
              <div className="pt-4 text-center text-sm text-slate-600 border-t border-slate-100">
                <p>Contact your clinic administrator if you forgot your credentials</p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-slate-500">
          © 2026 Dr. Deepthi's Ortho Clinic. All rights reserved.
        </p>
      </div>
    </div>
  );
}
