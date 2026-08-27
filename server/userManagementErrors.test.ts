import { describe, expect, it } from "vitest";
import { getUserManagementErrorMessage } from "../shared/userManagementErrors";

describe("User Management error messages", () => {
  it("does not expose HTML or parser details from an upload failure", () => {
    const message = getUserManagementErrorMessage("Unexpected token '<', \"<html>\"... is not valid JSON");
    expect(message).toBe("The administrator session or upload service could not be verified. Refresh the page and sign in again, then retry.");
    expect(message).not.toContain("<html>");
  });

  it("keeps authorization guidance explicit", () => {
    expect(getUserManagementErrorMessage("FORBIDDEN: admin role required")).toContain("Only an administrator");
  });
});
