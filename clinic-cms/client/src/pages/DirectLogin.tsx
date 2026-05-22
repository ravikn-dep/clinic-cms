import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Eye, EyeOff, LogIn } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function DirectLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<string | null>(null);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      window.location.replace("/");
    }
  }, [meQuery.data]);

  useEffect(() => {
    const healthUrl = `${window.location.origin}/api/health`;
    fetch(healthUrl, { credentials: "include" })
      .then(async (res) => {
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) {
          setServerOk(false);
          return;
        }
        const body = await res.json();
        setServerOk(Boolean(body?.ok));
        if (body?.database === "connected") {
          setDatabaseStatus(null);
        } else if (body?.database === "unconfigured") {
          setDatabaseStatus(body?.databaseError ?? "Database is not configured");
        } else if (body?.database === "error") {
          setDatabaseStatus(body?.databaseError ?? "Database connection failed");
        }
      })
      .catch(() => setServerOk(false));
  }, []);

  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: async () => {
      toast.success("Login successful!");
      await meQuery.refetch();
      window.location.replace("/");
    },
    onError: (err) => {
      const message = err.message || "Login failed. Please try again.";
      setError(message);
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername) {
      setError("Username is required");
      return;
    }

    if (!trimmedPassword) {
      setError("Password is required");
      return;
    }

    if (trimmedPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    loginMutation.mutate({ username: trimmedUsername, password: trimmedPassword });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 text-white p-3 rounded-lg">
              <LogIn className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl">Clinic Management System</CardTitle>
          <CardDescription>Sign in with your username and password</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {serverOk === false && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Backend is not responding. In Manus terminal run:{" "}
                  <code className="text-xs">cd clinic-cms; pnpm dev</code>
                  , then open{" "}
                  <code className="text-xs break-all">{window.location.origin}/api/health</code>{" "}
                  (must show JSON, not HTML).
                </AlertDescription>
              </Alert>
            )}

            {serverOk === true && databaseStatus && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Database: {databaseStatus}. Set{" "}
                  <code className="text-xs">DATABASE_URL</code> in{" "}
                  <code className="text-xs">clinic-cms/.env</code> and run{" "}
                  <code className="text-xs">pnpm db:push</code>.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="e.g. admin or cons-001"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loginMutation.isPending}
                autoComplete="username"
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                Admin: <span className="font-mono">admin@max</span> / <span className="font-mono">admin123</span>
                {" "}— or your username, email, or User ID (CONS-001)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loginMutation.isPending}
                  autoComplete="current-password"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={loginMutation.isPending}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-blue-600 hover:bg-blue-700"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t space-y-3">
            <div className="text-center text-sm text-muted-foreground">
              <p>Max Diagnostics</p>
              <p className="text-xs mt-1">The Pioneers in Diagnostic Medicare</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
