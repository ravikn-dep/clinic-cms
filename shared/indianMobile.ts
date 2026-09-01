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
