export type Navigate = (path: string, options?: { replace?: boolean }) => void;

export async function confirmCredentialLoginAndNavigate<T>(params: {
  refreshAuthenticatedUser: () => Promise<T | null | undefined>;
  navigate: Navigate;
}): Promise<T> {
  const authenticatedUser = await params.refreshAuthenticatedUser();

  if (!authenticatedUser) {
    throw new Error("Login session could not be confirmed. Please try again.");
  }

  params.navigate("/", { replace: true });
  return authenticatedUser;
}
