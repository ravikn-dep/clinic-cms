import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const navigate = (path: string) => {
    window.location.href = path;
  };
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loginMutation = trpc.rbac.loginWithCredentials.useMutation({
    onSuccess: () => {
      // Redirect to dashboard
      navigate("/");
    },
    onError: (error: any) => {
      setError(error.message || "Login failed. Please check your credentials.");
      setIsLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!userId.trim() || !password.trim()) {
      setError("Please enter both User ID and password");
      setIsLoading(false);
      return;
    }

    await loginMutation.mutateAsync({
      userId: userId.trim(),
      password: password.trim(),
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 mb-4">
            <span className="text-2xl font-bold text-white">🏥</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Clinic CMS</h1>
          <p className="text-slate-600">Friendly care flow</p>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to your clinic management account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Alert */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* User ID Input */}
              <div className="space-y-2">
                <label htmlFor="userId" className="text-sm font-medium text-slate-700">
                  User ID
                </label>
                <Input
                  id="userId"
                  type="text"
                  placeholder="e.g., CONS-001 or STAFF-001"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  disabled={isLoading}
                  className="border-slate-200 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="border-slate-200 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>

              {/* Login Button */}
              <Button
                type="submit"
                disabled={isLoading}
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
              <div className="pt-4 text-center text-sm text-slate-600">
                <p>Contact your clinic administrator for login credentials</p>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          © 2026 Clinic Management System. All rights reserved.
        </p>
      </div>
    </div>
  );
}
