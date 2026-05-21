import type { User } from "../drizzle/schema";

type AppointmentRow = {
  consultantId: number;
};

export function canViewAllAppointments(role: string): boolean {
  return role === "admin" || role === "staff";
}

export function canViewAppointment(user: User, appointment: AppointmentRow): boolean {
  if (canViewAllAppointments(user.role)) return true;
  if (user.role === "consultant") return appointment.consultantId === user.id;
  return false;
}

/** Admin/staff manage any appointment; doctors only their own schedule. */
export function canManageAppointment(user: User, appointment: AppointmentRow): boolean {
  if (user.role === "admin" || user.role === "staff") return true;
  if (user.role === "consultant") return appointment.consultantId === user.id;
  return false;
}

export function resolveConsultantIdForCreate(
  user: User,
  requestedConsultantId: number
): number {
  if (user.role === "consultant") {
    return user.id;
  }
  return requestedConsultantId;
}
