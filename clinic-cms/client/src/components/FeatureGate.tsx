import { ReactNode } from "react";
import { useCanAccessFeature } from "@/hooks/useFeatureAccess";
import { FeatureKey, getFeatureLabel } from "@/lib/featureAccess";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock } from "lucide-react";

export interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
  disabled?: boolean;
  showTooltip?: boolean;
}

/**
 * Component to conditionally render content based on feature access
 * If user doesn't have access, shows fallback or nothing
 */
export function FeatureGate({
  feature,
  children,
  fallback = null,
  disabled = false,
  showTooltip = false,
}: FeatureGateProps) {
  const hasAccess = useCanAccessFeature(feature);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  if (disabled) {
    const content = (
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>
    );

    if (showTooltip) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{content}</div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getFeatureLabel(feature)} is not available</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  }

  return <>{children}</>;
}

/**
 * Component to conditionally render a button with feature access control
 */
export interface FeatureGateButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGateButton({
  feature,
  children,
  fallback = null,
  disabled = false,
  ...props
}: FeatureGateButtonProps) {
  const hasAccess = useCanAccessFeature(feature);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          disabled={disabled || !hasAccess}
        >
          {children}
        </Button>
      </TooltipTrigger>
      {!hasAccess && (
        <TooltipContent>
          <p className="flex items-center gap-2">
            <Lock className="h-3 w-3" />
            {getFeatureLabel(feature)} access required
          </p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

/**
 * Component to show a permission-denied message for a feature
 */
export interface PermissionDeniedProps {
  feature: FeatureKey;
  message?: string;
}

export function PermissionDenied({
  feature,
  message,
}: PermissionDeniedProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <Lock className="h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Access Restricted</p>
        <p className="text-amber-700">
          {message || `You don't have access to ${getFeatureLabel(feature)}.`}
        </p>
      </div>
    </div>
  );
}
