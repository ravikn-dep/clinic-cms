import { parseISO } from "date-fns";

/** Parse appointment date stored as YYYY-MM-DD or legacy ISO datetime. */
export function parseAppointmentDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const normalized = dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`;
  return parseISO(normalized);
}
