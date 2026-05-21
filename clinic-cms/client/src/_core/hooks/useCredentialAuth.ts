import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";

/**
 * useCredentialAuth - Authentication hook for credential-based login only
 * Does NOT use Manus OAuth, only checks for credential-based session
 */
export function useCredentialAuth() {
  const utils = trpc.useUtils();

  // Query user info - this will fail silently if not authenticated
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      // Ignore errors
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      if (typeof window !== "undefined") {
        window.location.href = getLoginUrl();
      }
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading,
      error: meQuery.error,
      logout,
    };
  }, [meQuery.data, meQuery.isLoading, meQuery.error, logout]);

  return state;
}
