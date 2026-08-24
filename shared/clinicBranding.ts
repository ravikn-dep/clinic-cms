/**
 * Phase 4 Step 1 is intentionally a single-clinic deployment. This fixed
 * configuration is facility identity for printable OP documents; it is not a
 * tenant, location selector, or database-backed clinic model.
 */
export const FIXED_CLINIC_BRANDING = {
  name: "MAX DIAGNOSTICS",
  location: "Punjagutta",
  logoUrl: undefined as string | undefined,
} as const;
