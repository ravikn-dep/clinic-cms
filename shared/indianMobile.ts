export function normalizeIndianMobile(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const nationalNumber = digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;

  return /^[6-9]\d{9}$/.test(nationalNumber) ? nationalNumber : null;
}

export function isValidIndianMobile(value: string): boolean {
  return normalizeIndianMobile(value) !== null;
}

export function formatIndianMobileInput(value: string): string {
  return value.replace(/[^\d+()\-\s]/g, "").slice(0, 20);
}

/** Masks a contact number for external-facing responses, revealing only the last 4 digits (e.g. "+91••••••3210"). Falls back to a fully redacted value if the input cannot be normalized, so no unnormalized/malformed number is ever echoed back raw. */
export function maskIndianMobile(value: string): string {
  const normalized = normalizeIndianMobile(value);
  if (!normalized) return "••••••••••";
  return `+91${"•".repeat(6)}${normalized.slice(-4)}`;
}
