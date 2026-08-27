export function getUserManagementErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("unexpected token '<'") || normalized.includes("<html") || normalized.includes("invalid json")) {
    return "The administrator session or upload service could not be verified. Refresh the page and sign in again, then retry.";
  }
  if (normalized.includes("not authorized") || normalized.includes("forbidden") || normalized.includes("admin")) {
    return "Only an administrator can perform this action. Refresh the page if your role was recently changed.";
  }
  return message || "User Management action failed. Please try again.";
}
