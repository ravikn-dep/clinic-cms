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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import { DASHBOARD_NAVIGATION_GROUPS, getVisibleNavigationGroups } from "@/lib/dashboardNavigation";
import { LayoutDashboard, LogOut, Lock } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

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
      style=
        {{
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties}
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
  const navigate = setLocation;
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const visibleNavigationGroups = getVisibleNavigationGroups(DASHBOARD_NAVIGATION_GROUPS, user?.role, hasAccess);

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
      <style>{`
        @keyframes sidebar-holographic-glow {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(20, 184, 166, 0.3)) drop-shadow(0 0 12px rgba(34, 197, 94, 0.15)); }
          50% { filter: drop-shadow(0 0 10px rgba(20, 184, 166, 0.5)) drop-shadow(0 0 16px rgba(34, 197, 94, 0.25)); }
        }
        .sidebar-holographic-logo {
          animation: sidebar-holographic-glow 3s ease-in-out infinite;
          filter: drop-shadow(0 0 8px rgba(20, 184, 166, 0.4)) drop-shadow(0 0 12px rgba(34, 197, 94, 0.2));
        }
      `}</style>
      <Sidebar className="border-r border-border/60 bg-gradient-to-b from-slate-50 to-white" collapsible="icon">
        <SidebarHeader className="border-b border-border/40 bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-4">
          <div className="flex items-center gap-3 px-2">
            <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-xs font-black tracking-wide text-white sidebar-holographic-logo">MD</div>
            <div className="hidden group-data-[collapsible=icon]:hidden">
              <p className="font-bold text-teal-900 text-sm">MAX DIAGNOSTICS</p>
              <p className="text-xs text-teal-600">Punjagutta</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-4">
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={location === "/"}
                onClick={() => setLocation("/")}
                className="cursor-pointer rounded-lg transition-all duration-200 hover:bg-teal-100/50 data-[active=true]:bg-gradient-to-r data-[active=true]:from-teal-500 data-[active=true]:to-cyan-500 data-[active=true]:text-white data-[active=true]:shadow-md"
              >
                <a href="/" className="flex items-center gap-3">
                  <LayoutDashboard className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-medium">Dashboard</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {visibleNavigationGroups.map((group) => {
              const visibleItems = group.items;
              return (
                <SidebarGroup key={group.label} className="px-0 pt-4 first:pt-2">
                  <SidebarGroupLabel className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700/70 group-data-[collapsible=icon]:hidden">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-1">
                      {visibleItems.map((item) => (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            asChild
                            isActive={location === item.path}
                            onClick={() => setLocation(item.path)}
                            className="cursor-pointer rounded-lg transition-all duration-200 hover:bg-teal-100/50 data-[active=true]:bg-gradient-to-r data-[active=true]:from-teal-500 data-[active=true]:to-cyan-500 data-[active=true]:text-white data-[active=true]:shadow-md"
                          >
                            <a href={item.path} className="flex items-center gap-3">
                              <item.icon className="h-5 w-5 flex-shrink-0" />
                              <span className="text-sm font-medium">{item.label}</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-border/40 bg-gradient-to-r from-slate-50 to-teal-50/30 px-2 py-4">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="h-9 w-9 border-2 border-teal-200 shadow-sm">
                <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white font-bold">{user?.name?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-slate-900">{user?.name}</p>
                  <p className="text-xs text-teal-600 truncate capitalize font-medium">{user?.role}</p>
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-teal-100/50 rounded-lg transition-colors">
                  <LogOut className="h-4 w-4 text-teal-700" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-lg shadow-lg">
                <DropdownMenuItem onClick={() => navigate("/change-password")} className="cursor-pointer">
                  <Lock className="h-4 w-4 mr-2" />
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => logout()} className="cursor-pointer text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="flex flex-1 flex-col bg-gradient-to-b from-slate-50/50 to-white">
          <div className="flex items-center justify-between border-b border-border/40 bg-white/80 backdrop-blur-sm px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="rounded-lg hover:bg-teal-100/50 transition-colors" />
              <div className="hidden sm:block h-6 w-px bg-border/40" />
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 hidden sm:block">Clinic Management System</h2>
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
