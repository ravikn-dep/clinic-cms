import { useAuth } from "@/_core/hooks/useAuth";
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
import { getLoginUrl } from "@/const";
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
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-white to-teal-50 p-4">
        <div className="flex w-full max-w-md flex-col items-center gap-8 rounded-[2rem] border border-white/75 bg-white/85 p-8 text-center shadow-2xl shadow-teal-900/10 backdrop-blur">
          <div className="flex flex-col items-center gap-6">
            <div className="rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800">
              Dr.Deepthi’s Ortho clinic CMS
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-center">
              Welcome back to your clinic workspace
            </h1>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Sign in to continue managing patient intake, clinical notes, billing, inventory, and audit records from one calm workspace.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/password-login";
            }}
            size="lg"
            className="friendly-action w-full bg-teal-600 text-white hover:bg-teal-700"
          >
            Sign in with Password
          </Button>
          <div className="text-sm text-muted-foreground">
            or
          </div>
          <Button
            onClick={() => {
              window.location.href = "/login";
            }}
            variant="outline"
            size="lg"
            className="w-full"
          >
            Sign in with Manus OAuth
          </Button>
        </div>
      </div>
    );
  }

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
    
    // Admin-only items visible only to admins
    if (item.adminOnly && user?.role !== "admin") return false;
    
    // Feature-gated items visible only if user has access
    if ("feature" in item && item.feature) {
      return hasAccess(item.feature);
    }
    
    return true;
  });
  const activeMenuItem = visibleMenuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
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
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
          <Sidebar
            collapsible="icon"
            className="border-r border-white/70 bg-sidebar/90 shadow-xl shadow-teal-900/5 backdrop-blur-xl"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-20 justify-center border-b border-white/70 bg-gradient-to-r from-teal-50/80 to-amber-50/70">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex flex-col leading-tight">
                    <span className="truncate font-semibold tracking-tight text-teal-950">
                      Clinic workspace
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Friendly care flow
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {visibleMenuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 rounded-2xl font-medium transition-all hover:-translate-y-0.5 hover:bg-teal-50 hover:text-teal-900 hover:shadow-sm ${isActive ? "bg-teal-100/80 text-teal-950 shadow-sm" : ""}`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-teal-700" : "text-muted-foreground"}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-white/70 bg-gradient-to-r from-white/55 to-amber-50/55 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-all hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-sm group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-10 w-10 shrink-0 border border-teal-200 bg-teal-50 shadow-sm">
                    <AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/password-management")}
                  className="cursor-pointer"
                >
                  <span>Change Password</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/70 bg-background/85 px-2 shadow-sm shadow-teal-900/5 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-3 sm:p-5 lg:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
