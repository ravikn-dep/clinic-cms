import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertCircle, Download, Info, Loader2, Search } from "lucide-react";

export default function AuditLogs() {
  const [filterAction, setFilterAction] = useState("ALL");
  const [filterTable, setFilterTable] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const auditLogsQuery = trpc.auditLogs.getAll.useQuery();
  const logs = auditLogsQuery.data || [];

  const filteredLogs = logs.filter(log => {
    const matchesAction = filterAction === "ALL" || log.actionType === filterAction;
    const matchesTable = filterTable === "ALL" || log.tableName === filterTable;
    const matchesSearch = log.recordId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.userId?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAction && matchesTable && matchesSearch;
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case "CREATE":
        return "bg-green-50 text-green-700 border-green-200";
      case "UPDATE":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "DELETE":
        return "bg-red-50 text-red-700 border-red-200";
      case "ACCESS":
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-muted-foreground mt-2">Immutable log of all system actions for compliance</p>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Record ID or User ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 transition-colors focus-visible:ring-teal-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="action">Action Type</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="ACCESS">Access</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="table">Table</Label>
              <Select value={filterTable} onValueChange={setFilterTable}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Tables</SelectItem>
                  <SelectItem value="patients">Patients</SelectItem>
                  <SelectItem value="consultations">Consultations</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="bills">Bills</SelectItem>
                  <SelectItem value="auditLogs">Audit Logs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button variant="outline" className="w-full bg-white shadow-sm" disabled>
                <Download className="mr-2 h-4 w-4" />
                Export unavailable
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>{filteredLogs.length} log entries</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLogsQuery.isLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading audit logs...
            </div>
          ) : auditLogsQuery.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Unable to load audit logs.</p>
                <p className="text-sm text-muted-foreground">{auditLogsQuery.error.message}</p>
              </div>
              <Button variant="outline" onClick={() => auditLogsQuery.refetch()}>Try again</Button>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-slate-50/70 py-12 text-center">
              <Search className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No audit logs found</p>
              <p className="mt-1 text-sm text-muted-foreground">Adjust the filters or search terms to review activity.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/70 text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Timestamp</th>
                    <th className="text-left py-3 px-4 font-semibold">Action</th>
                    <th className="text-left py-3 px-4 font-semibold">Table</th>
                    <th className="text-left py-3 px-4 font-semibold">Record ID</th>
                    <th className="text-left py-3 px-4 font-semibold">User ID</th>
                    <th className="text-left py-3 px-4 font-semibold">IP Address</th>
                    <th className="text-left py-3 px-4 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, idx) => (
                    <tr key={idx} className="border-b transition-colors hover:bg-accent/70">
                      <td className="py-3 px-4 text-xs font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={getActionColor(log.actionType)}>
                          {log.actionType}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-medium">{log.tableName}</td>
                      <td className="py-3 px-4 font-mono text-xs">{log.recordId}</td>
                      <td className="py-3 px-4 text-xs">{log.userId}</td>
                      <td className="py-3 px-4 text-xs font-mono">{log.ipAddress || "N/A"}</td>
                      <td className="py-3 px-4">
                        <Button variant="ghost" size="sm" className="transition-all hover:-translate-y-0.5" onClick={() => toast.info("Detailed audit-log diff viewing is coming soon.")}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Note */}
      <Card className="border-blue-200 bg-blue-50 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900"><Info className="h-5 w-5" /> Audit Trail Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6 text-blue-800">
          <p>
            This audit trail is immutable and cannot be edited or deleted for compliance purposes.
          </p>
          <p>
            All actions on patient data (PHI), prescriptions, and billing are logged automatically.
          </p>
          <p>
            Logs are retained for regulatory compliance and can be exported for audits.
          </p>
          <p>
            Each entry captures the actor, action type, timestamp, and change details.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
