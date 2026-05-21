import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, LogIn, RefreshCcw } from "lucide-react";
import { LOGIN_PATH } from "@/const";

type ServerConnectionHelpProps = {
  title?: string;
  message: string;
  showLoginLink?: boolean;
};

export function ServerConnectionHelp({
  title = "Cannot reach the clinic server",
  message,
  showLoginLink = true,
}: ServerConnectionHelpProps) {
  const healthUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/health`
      : "/api/health";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50 p-4">
      <Card className="w-full max-w-lg border-amber-200 shadow-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="h-5 w-5 text-amber-700" />
          </div>
          <CardTitle className="text-amber-950">{title}</CardTitle>
          <CardDescription className="text-amber-900/80">{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            On <strong>Manus AI</strong>, run in the project terminal:
          </p>
          <pre className="rounded-lg bg-slate-900 p-3 text-xs text-slate-100 overflow-x-auto">
            cd clinic-cms{"\n"}pnpm dev
          </pre>
          <p>
            Then open this URL in your browser (copy from the address bar, do not use a placeholder):
          </p>
          <p className="font-mono text-xs break-all text-teal-800">{healthUrl}</p>
          <p>You should see JSON like {"{"}"ok":true{"}"} — not HTML or “invalid host”.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            {showLoginLink && (
              <Button asChild className="bg-teal-600 hover:bg-teal-700">
                <a href={LOGIN_PATH}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Go to login
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
