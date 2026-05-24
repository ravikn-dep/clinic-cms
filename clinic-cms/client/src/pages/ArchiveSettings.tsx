import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Archive, Cloud, Loader2, Play, Unplug } from "lucide-react";
import { toast } from "sonner";

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString();
}

export default function ArchiveSettings() {
  const [isRunningManual, setIsRunningManual] = useState(false);
  const utils = trpc.useUtils();

  const statusQuery = trpc.archive.getStatus.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const runsQuery = trpc.archive.listRuns.useQuery({ limit: 10 });

  const authUrlMutation = trpc.archive.getGoogleAuthUrl.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message),
  });

  const disconnectMutation = trpc.archive.disconnectGoogleDrive.useMutation({
    onSuccess: async () => {
      toast.success("Google Drive disconnected");
      await utils.archive.getStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const runNowMutation = trpc.archive.runNow.useMutation({
    onSuccess: async (result) => {
      toast.success(
        `Archive uploaded (${result.fileCount} files, ${formatBytes(result.archiveSizeBytes)})`
      );
      await utils.archive.getStatus.invalidate();
      await utils.archive.listRuns.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      toast.success("Google Drive connected");
      void utils.archive.getStatus.invalidate();
      window.history.replaceState({}, "", "/archive");
    }
    const error = params.get("error");
    if (error) {
      toast.error(decodeURIComponent(error));
      window.history.replaceState({}, "", "/archive");
    }
  }, [utils.archive.getStatus]);

  const handleRunNow = async () => {
    setIsRunningManual(true);
    try {
      await runNowMutation.mutateAsync();
    } finally {
      setIsRunningManual(false);
    }
  };

  const status = statusQuery.data;
  const isRunning = Boolean(status?.runningRun);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Archive className="h-8 w-8 text-teal-600" />
          Archive to Google Drive
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Google Drive connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!statusQuery.isLoading && status && (
            <>
              <p className="text-sm text-muted-foreground">
                {status.googleDriveConfigured
                  ? "OAuth credentials are configured on the server."
                  : "Server OAuth env vars are missing — see docs/ARCHIVE_GOOGLE_DRIVE.md."}
              </p>
              <p className="text-sm">
                Status:{" "}
                <span className="font-medium">
                  {status.googleDriveConnected
                    ? `Connected${status.connectedEmail ? ` as ${status.connectedEmail}` : ""}`
                    : "Not connected"}
                </span>
              </p>
              {status.driveFolderId && (
                <p className="text-xs text-muted-foreground">
                  Target folder ID: {status.driveFolderId}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {!status.googleDriveConnected ? (
                  <Button
                    onClick={() => authUrlMutation.mutate()}
                    disabled={!status.googleDriveConfigured || authUrlMutation.isPending}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    {authUrlMutation.isPending ? "Opening…" : "Connect Google Drive"}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="gap-2"
                  >
                    <Unplug className="h-4 w-4" />
                    Disconnect
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule &amp; status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {statusQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : status ? (
            <>
              <p>
                Auto archive:{" "}
                <span className="font-medium">
                  {status.cronEnabled ? `every ${status.intervalWeeks} weeks` : "disabled"}
                </span>
                {status.cronEnabled && " (production only, checked daily at 02:00 UTC)"}
              </p>
              <p>Last completed run: {formatDate(status.lastRun?.finishedAt)}</p>
              <p>Next due (estimate): {formatDate(status.nextDueAt)}</p>
              <p>
                Due now:{" "}
                <span className={status.dueNow ? "text-amber-600 font-medium" : ""}>
                  {status.dueNow ? "Yes" : "No"}
                </span>
              </p>
              {isRunning && (
                <p className="text-teal-700 font-medium flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Archive job in progress…
                </p>
              )}
              <Button
                onClick={handleRunNow}
                disabled={
                  isRunningManual ||
                  runNowMutation.isPending ||
                  isRunning ||
                  !status.googleDriveConnected
                }
                className="gap-2 bg-teal-600 hover:bg-teal-700"
              >
                <Play className="h-4 w-4" />
                {isRunningManual || runNowMutation.isPending
                  ? "Running archive…"
                  : "Run archive now"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Archives are copy-only — source files in clinic storage are not deleted.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runsQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Started</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Files</th>
                    <th className="py-2 pr-4">Size</th>
                    <th className="py-2 pr-4">Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {(runsQuery.data ?? []).map((run) => (
                    <tr key={run.runId} className="border-b last:border-0">
                      <td className="py-2 pr-4">{formatDate(run.startedAt)}</td>
                      <td className="py-2 pr-4 capitalize">{run.status}</td>
                      <td className="py-2 pr-4">{run.fileCount ?? "—"}</td>
                      <td className="py-2 pr-4">{formatBytes(run.archiveSizeBytes)}</td>
                      <td className="py-2 pr-4">{run.triggeredBy ?? "—"}</td>
                    </tr>
                  ))}
                  {(runsQuery.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-muted-foreground">
                        No archive runs yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
