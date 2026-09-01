function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Returns a calendar day without converting the supplied date through UTC. */
export function toAppointmentDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Creates a local calendar day for an appointment date stored as YYYY-MM-DD. */
export function appointmentDateToLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toAppointmentDate(date) === value ? date : null;
}

export function appointmentOccursOnDate(appointmentDate: string, selectedDate: Date): boolean {
  return appointmentDate === toAppointmentDate(selectedDate);
}
