import { useCredentialAuth as useAuth } from "@/_core/hooks/useCredentialAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { FEATURE_TO_ROUTES } from "@/lib/featureAccess";
import { Activity, Bell, BarChart3, Calendar, ClipboardPenLine, LayoutDashboard, LogOut, PackageSearch, PanelLeft, Receipt, ShoppingCart, UserPlus, Users, Download, Settings } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: UserPlus, label: "Register Patient", path: "/register-patient" },
  { icon: Users, label: "Patient Records", path: "/patients", feature: "patient_records" as const },
  { icon: ClipboardPenLine, label: "Ambient Scribe", path: "/scribe", feature: "ambient_scribe" as const },
  { icon: PackageSearch, label: "Pharmacy", path: "/pharmacy", feature: "pharmacy" as const },
  { icon: Receipt, label: "Billing", path: "/billing", feature: "billing" as const },
  { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders", feature: "purchase_orders" as const },
  { icon: Calendar, label: "Appointments", path: "/appointments", feature: "appointments" as const },
  { icon: Bell, label: "Notifications", path: "/notifications", feature: "notifications" as const },
  { icon: Users, label: "User Management", path: "/users", adminOnly: true },
  { icon: Settings, label: "Feature Access Control", path: "/feature-access", adminOnly: true },
  { icon: Settings, label: "OP Form Customization", path: "/op-form-customization", adminOnly: true },
  { icon: BarChart3, label: "Analytics", path: "/analytics", adminOnly: true },
  { icon: Activity, label: "Audit Trail", path: "/audit-logs", feature: "audit_trail" as const },
  { icon: Download, label: "Daily Export", path: "/daily-export", feature: "daily_export" as const },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const { hasAccess } = useFeatureAccess();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const visibleMenuItems = menuItems.filter(item => {
    // Always show dashboard and register patient
    if (item.path === "/" || item.path === "/register-patient") return true;
    // Show admin items only for admins
    if (item.adminOnly) return user?.role === "admin";
    // Show feature-gated items if user has access
    if (item.feature) return hasAccess(item.feature);
    return true;
  });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <Sidebar className="border-r border-border" collapsible="icon">
        <SidebarHeader className="border-b border-border">
          <div className="flex items-center gap-2 px-2">
            <div className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800">
              Clinic CMS
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {visibleMenuItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  asChild
                  isActive={location === item.path}
                  onClick={() => setLocation(item.path)}
                  className="cursor-pointer"
                >
                  <a href={item.path}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-border">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{user?.name?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate capitalize">{user?.role}</p>
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <LogOut className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => logout()}>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <PanelLeft className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </SidebarInset>
    </>
  );
}
