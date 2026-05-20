import { ReactNode } from "react";
import { useLocation } from "wouter";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useCredentialAuth as useAuth } from "@/_core/hooks/useCredentialAuth";
import { FeatureKey, getFeatureLabel } from "@/lib/featureAccess";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export interface ProtectedRouteProps {
  children: ReactNode;
  feature?: FeatureKey;
  adminOnly?: boolean;
}

/**
 * Component to protect routes based on feature access or admin role
 * Shows an access denied message if the user doesn't have permission
 */
export function ProtectedRoute({
  children,
  feature,
  adminOnly = false,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const { hasAccess, isLoading: permissionsLoading } = useFeatureAccess();
  const [, setLocation] = useLocation();

  const isLoading = loading || permissionsLoading;

  // Check access permissions
  const hasAdminAccess = user?.role === "admin";
  const hasFeatureAccess = feature ? hasAccess(feature) : true;
  const isAuthorized = adminOnly ? hasAdminAccess : hasFeatureAccess;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-amber-50 via-white to-teal-50 p-4">
        <Card className="w-full max-w-md border-amber-200 bg-white/90 shadow-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-amber-100 p-3">
                <AlertCircle className="h-6 w-6 text-amber-600" />
              </div>
            </div>
            <CardTitle className="text-amber-900">Access Denied</CardTitle>
            <CardDescription className="text-amber-700">
              {adminOnly
                ? "This page is only available to administrators."
                : feature
                  ? `You don't have access to ${getFeatureLabel(feature)}.`
                  : "You don't have permission to view this page."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {adminOnly
                ? "Please contact your clinic administrator if you believe this is an error."
                : feature
                  ? `Your administrator can enable ${getFeatureLabel(feature)} access in the Feature Access Control settings.`
                  : "Please contact your clinic administrator if you believe this is an error."}
            </p>
            <Button
              onClick={() => setLocation("/")}
              className="w-full bg-teal-600 text-white hover:bg-teal-700"
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
