import { describe, expect, it } from "vitest";
import { appointmentDateToLocalDate, appointmentOccursOnDate, toAppointmentDate } from "../client/src/lib/appointmentView";

describe("appointment list and calendar day matching", () => {
  it("matches the exact stored appointment date without UTC day drift", () => {
    const selected = appointmentDateToLocalDate("2026-08-29");
    expect(appointmentOccursOnDate("2026-08-29", selected)).toBe(true);
    expect(appointmentOccursOnDate("2026-08-28", selected)).toBe(false);
  });

  it("creates a local calendar date for a new booking before focusing list view", () => {
    const selected = appointmentDateToLocalDate("2026-12-01");
    expect(selected).not.toBeNull();
    expect(toAppointmentDate(selected!)).toBe("2026-12-01");
  });

  it("rejects incomplete or malformed native date values instead of creating an invalid selected date", () => {
    expect(appointmentDateToLocalDate("")).toBeNull();
    expect(appointmentDateToLocalDate("2026-02-30")).toBeNull();
  });

  it("keeps every booked appointment associated with its intended calendar day", () => {
    const day = appointmentDateToLocalDate("2026-08-27");
    const appointments = ["2026-08-27", "2026-08-27", "2026-08-29"];
    expect(appointments.filter((appointmentDate) => appointmentOccursOnDate(appointmentDate, day))).toHaveLength(2);
  });
});
