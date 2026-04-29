import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, Bell, Check, CheckCircle2, FileText, Loader2, Megaphone, Search, Trash2, UserRound } from "lucide-react";

export default function Notifications() {
  const [filterType, setFilterType] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: user } = trpc.auth.me.useQuery();
  const notificationsQuery = trpc.notifications.getByUserId.useQuery(
    { userId: user?.id || 0 },
    { enabled: !!user?.id }
  );
  const markAsReadMutation = trpc.notifications.markAsRead.useMutation();

  const notifications = notificationsQuery.data || [];

  // Auto-refresh notifications every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      notificationsQuery.refetch();
    }, 10000);

    return () => clearInterval(interval);
  }, [autoRefresh, notificationsQuery]);

  const filteredNotifications = notifications.filter((notif) => {
    const matchesType = filterType === "ALL" || notif.notificationType === filterType;
    const matchesSearch = notif.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (notif.content?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markAsReadMutation.mutateAsync({ notificationId });
      await notificationsQuery.refetch();
      toast.success("Marked as read");
    } catch (error) {
      toast.error("Failed to mark as read");
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "patient_registration":
        return <UserRound className="h-5 w-5 text-blue-700" />;
      case "invoice_generated":
        return <FileText className="h-5 w-5 text-green-700" />;
      case "low_stock":
        return <AlertTriangle className="h-5 w-5 text-orange-700" />;
      case "consultation_completed":
        return <CheckCircle2 className="h-5 w-5 text-purple-700" />;
      default:
        return <Megaphone className="h-5 w-5 text-slate-700" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "patient_registration":
        return "bg-blue-50 border-blue-200";
      case "invoice_generated":
        return "bg-green-50 border-green-200";
      case "low_stock":
        return "bg-orange-50 border-orange-200";
      case "consultation_completed":
        return "bg-purple-50 border-purple-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "patient_registration":
        return "Patient Registration";
      case "invoice_generated":
        return "Invoice Generated";
      case "low_stock":
        return "Low Stock Alert";
      case "consultation_completed":
        return "Consultation Completed";
      default:
        return "Notification";
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-2">
            {unreadCount > 0 ? `${unreadCount} unread notification(s)` : "All notifications read"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <Bell className="h-4 w-4 mr-2" />
            {autoRefresh ? "Auto-refresh On" : "Auto-refresh Off"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => notificationsQuery.refetch()}
            disabled={notificationsQuery.isFetching}
            className="bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            {notificationsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 transition-colors focus-visible:ring-teal-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Notification Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="patient_registration">Patient Registration</SelectItem>
                  <SelectItem value="invoice_generated">Invoice Generated</SelectItem>
                  <SelectItem value="low_stock">Low Stock Alert</SelectItem>
                  <SelectItem value="consultation_completed">Consultation Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button variant="outline" className="w-full bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" onClick={() => { setFilterType("ALL"); setSearchQuery(""); }}>
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <div className="space-y-3">
        {notificationsQuery.isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading notifications...
            </CardContent>
          </Card>
        ) : notificationsQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Unable to load notifications.</p>
                <p className="text-sm text-muted-foreground">{notificationsQuery.error.message}</p>
              </div>
              <Button variant="outline" onClick={() => notificationsQuery.refetch()}>Try again</Button>
            </CardContent>
          </Card>
        ) : filteredNotifications.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground text-center">
                {notifications.length === 0
                  ? "No notifications yet"
                  : "No notifications match your filters"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredNotifications.map((notif) => (
            <Card
              key={notif.notificationId}
              className={`${getNotificationColor(notif.notificationType)} border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${!notif.isRead ? "border-l-4" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-1 items-start gap-3">
                    <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-sm">
                      {getNotificationIcon(notif.notificationType)}
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{notif.title}</h3>
                        {!notif.isRead && (
                          <Badge variant="default" className="text-xs">
                            New
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {getTypeLabel(notif.notificationType)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{notif.content ?? "No description"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(notif.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!notif.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkAsRead(notif.notificationId)}
                        className="transition-all hover:-translate-y-0.5"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive transition-all hover:-translate-y-0.5 hover:text-destructive"
                      onClick={() => toast.info("Notification deletion is coming soon.")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Notification Settings */}
      <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle>Notification Settings</CardTitle>
          <CardDescription>Configure how you receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border bg-white p-3 shadow-sm">
              <Label>Patient Registration Alerts</Label>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-teal-700" />
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-white p-3 shadow-sm">
              <Label>Invoice Generation Alerts</Label>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-teal-700" />
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-white p-3 shadow-sm">
              <Label>Low Stock Alerts</Label>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-teal-700" />
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-white p-3 shadow-sm">
              <Label>Email Notifications</Label>
              <input type="checkbox" className="h-4 w-4 accent-teal-700" />
            </div>
          </div>
          <Button className="shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" onClick={() => toast.info("Notification preference persistence is coming soon.")}>Save Settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}
