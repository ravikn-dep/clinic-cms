import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";

describe("Appointment Scheduling System", () => {
  const testConsultantId = 100000 + (Date.now() % 100000000);
  const testPatientId = `PAT-TEST-${testConsultantId}`;
  const testDate = "2026-05-15";
  const testTime = "10:00";

  beforeAll(async () => {
    // Setup: Ensure database is available
    const database = await db.getDb();
    expect(database).toBeDefined();
  });

  describe("Appointment Creation", () => {
    it("should create a new appointment successfully", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: testTime,
        notes: "Test appointment",
      });

      expect(appointmentId).toBeDefined();
      expect(appointmentId).toMatch(/^APT-/);

      // Verify appointment was created
      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment).toBeDefined();
      expect(appointment?.patientId).toBe(testPatientId);
      expect(appointment?.consultantId).toBe(testConsultantId);
      expect(appointment?.appointmentDate).toBe(testDate);
      expect(appointment?.appointmentTime).toBe(testTime);
      expect(appointment?.status).toBe("Scheduled");
    });

    it("should create appointment with default duration of 30 minutes", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "14:00",
      });

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment?.duration).toBe(30);
    });

    it("should create appointment with custom duration", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "15:00",
        duration: 60,
      });

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment?.duration).toBe(60);
    });
  });

  describe("Appointment Retrieval", () => {
    it("should retrieve appointment by ID", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "11:00",
      });

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment).toBeDefined();
      expect(appointment?.appointmentId).toBe(appointmentId);
    });

    it("should retrieve appointments by patient ID", async () => {
      const patientId = `PAT-${Date.now()}`;
      
      const apt1 = await db.createAppointment({
        patientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "09:00",
      });

      const apt2 = await db.createAppointment({
        patientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "10:30",
      });

      const appointments = await db.getAppointmentsByPatient(patientId);
      expect(appointments.length).toBeGreaterThanOrEqual(2);
      expect(appointments.some((a: any) => a.appointmentId === apt1)).toBe(true);
      expect(appointments.some((a: any) => a.appointmentId === apt2)).toBe(true);
    });

    it("should retrieve appointments by consultant ID", async () => {
      const consultantId = testConsultantId + 1;
      
      const apt1 = await db.createAppointment({
        patientId: `PAT-${Date.now()}-1`,
        consultantId,
        appointmentDate: testDate,
        appointmentTime: "09:00",
      });

      const apt2 = await db.createAppointment({
        patientId: `PAT-${Date.now()}-2`,
        consultantId,
        appointmentDate: testDate,
        appointmentTime: "10:30",
      });

      const appointments = await db.getAppointmentsByConsultant(consultantId, testDate);
      expect(appointments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Appointment Status Updates", () => {
    it("should update appointment status to Completed", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "12:00",
      });

      await db.updateAppointmentStatus(appointmentId, "Completed");

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment?.status).toBe("Completed");
    });

    it("should update appointment status to No-show", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "13:00",
      });

      await db.updateAppointmentStatus(appointmentId, "No-show");

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment?.status).toBe("No-show");
    });

    it("should update appointment status to Cancelled", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "14:30",
      });

      await db.updateAppointmentStatus(appointmentId, "Cancelled");

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment?.status).toBe("Cancelled");
    });
  });

  describe("Appointment Cancellation", () => {
    it("should cancel an appointment", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "16:00",
      });

      await db.cancelAppointment(appointmentId);

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment?.status).toBe("Cancelled");
    });

    it("should update updatedAt timestamp on cancellation", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "17:00",
      });

      const beforeCancel = await db.getAppointmentById(appointmentId);
      const beforeTime = beforeCancel?.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 1100));
      await db.cancelAppointment(appointmentId);

      const afterCancel = await db.getAppointmentById(appointmentId);
      expect(afterCancel?.updatedAt).not.toBe(beforeTime);
    });
  });

  describe("Appointment Rescheduling", () => {
    it("should reschedule an appointment to a new date and time", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "10:00",
      });

      const newDate = "2026-05-20";
      const newTime = "15:00";

      await db.rescheduleAppointment(appointmentId, newDate, newTime);

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment?.appointmentDate).toBe(newDate);
      expect(appointment?.appointmentTime).toBe(newTime);
      expect(appointment?.status).toBe("Rescheduled");
    });

    it("should update status to Rescheduled when rescheduling", async () => {
      const appointmentId = await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "11:00",
      });

      await db.rescheduleAppointment(appointmentId, "2026-05-22", "14:00");

      const appointment = await db.getAppointmentById(appointmentId);
      expect(appointment?.status).toBe("Rescheduled");
    });
  });

  describe("Appointment Conflict Detection", () => {
    it("should detect conflict when booking overlapping time slot", async () => {
      // Create first appointment
      await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "10:00",
        duration: 30,
      });

      // Check for conflict at overlapping time
      const hasConflict = await db.checkAppointmentConflict(
        testConsultantId,
        testDate,
        "10:15", // Overlaps with 10:00-10:30
        30
      );

      expect(hasConflict).toBe(true);
    });

    it("should not detect conflict for non-overlapping time slots", async () => {
      const uniqueConsultantId = testConsultantId + 2;
      const uniqueDate = new Date();
      uniqueDate.setDate(uniqueDate.getDate() + 1);
      const dateStr = uniqueDate.toISOString().split('T')[0];
      
      await db.createAppointment({
        patientId: `PAT-${Date.now()}-1`,
        consultantId: uniqueConsultantId,
        appointmentDate: dateStr,
        appointmentTime: "10:00",
        duration: 30,
      });

      const hasConflict = await db.checkAppointmentConflict(
        uniqueConsultantId,
        dateStr,
        "10:31", // Starts after previous ends
        30
      );

      expect(hasConflict).toBe(false);
    });

    it("should not detect conflict for different dates", async () => {
      await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "10:00",
        duration: 30,
      });

      const hasConflict = await db.checkAppointmentConflict(
        testConsultantId,
        "2026-05-25", // Different date
        "10:00",
        30
      );

      expect(hasConflict).toBe(false);
    });

    it("should not detect conflict for different consultants", async () => {
      await db.createAppointment({
        patientId: testPatientId,
        consultantId: testConsultantId,
        appointmentDate: testDate,
        appointmentTime: "10:00",
        duration: 30,
      });

      const hasConflict = await db.checkAppointmentConflict(
        testConsultantId + 3, // Different consultant
        testDate,
        "10:00",
        30
      );

      expect(hasConflict).toBe(false);
    });

    it("should not detect conflict for cancelled appointments", async () => {
      const uniqueConsultantId = testConsultantId + 4;
      const uniqueDate = new Date();
      uniqueDate.setDate(uniqueDate.getDate() + 2);
      const dateStr = uniqueDate.toISOString().split('T')[0];
      
      const appointmentId = await db.createAppointment({
        patientId: `PAT-${Date.now()}-2`,
        consultantId: uniqueConsultantId,
        appointmentDate: dateStr,
        appointmentTime: "10:00",
        duration: 30,
      });

      await db.cancelAppointment(appointmentId);

      const hasConflict = await db.checkAppointmentConflict(
        uniqueConsultantId,
        dateStr,
        "10:00",
        30
      );

      // Cancelled appointments should not cause conflicts
      expect(hasConflict).toBe(false);
    });
  });

  describe("Available Slots Calculation", () => {
    it("should return empty array when no availability is set", async () => {
      const slots = await db.getAvailableSlots(testConsultantId + 5, testDate);
      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBe(0);
    });

    it("should return available slots for a consultant", async () => {
      // Set availability for consultant
      await db.setConsultantAvailability({
        consultantId: testConsultantId,
        dayOfWeek: new Date(testDate).getDay(),
        startTime: "09:00",
        endTime: "17:00",
        slotDuration: 30,
      });

      const slots = await db.getAvailableSlots(testConsultantId, testDate);
      
      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]).toMatch(/^\d{2}:\d{2}$/);
    });

    it("should exclude booked time slots from available slots", async () => {
      const consultantId = testConsultantId + 6;
      const uniqueDate = new Date();
      uniqueDate.setDate(uniqueDate.getDate() + 7);
      const futureDate = uniqueDate.toISOString().split('T')[0];
      
      // Set availability
      await db.setConsultantAvailability({
        consultantId,
        dayOfWeek: uniqueDate.getDay(),
        startTime: "09:00",
        endTime: "12:00",
        slotDuration: 30,
      });

      // Book a slot
      await db.createAppointment({
        patientId: `PAT-${Date.now()}`,
        consultantId,
        appointmentDate: futureDate,
        appointmentTime: "10:00",
        duration: 30,
      });

      const slots = await db.getAvailableSlots(consultantId, futureDate);
      
      expect(slots).not.toContain("10:00");
    });
  });

  describe("Consultant Availability Management", () => {
    it("should set consultant availability", async () => {
      const availabilityId = await db.setConsultantAvailability({
        consultantId: testConsultantId + 7,
        dayOfWeek: 1, // Monday
        startTime: "09:00",
        endTime: "17:00",
        slotDuration: 30,
        maxAppointmentsPerDay: 10,
      });

      expect(availabilityId).toBeDefined();
      expect(availabilityId).toMatch(/^AVL-/);
    });

    it("should retrieve consultant availability", async () => {
      const consultantId = testConsultantId + 8;
      
      await db.setConsultantAvailability({
        consultantId,
        dayOfWeek: 2, // Tuesday
        startTime: "10:00",
        endTime: "18:00",
        slotDuration: 45,
      });

      const availability = await db.getConsultantAvailability(consultantId);
      
      expect(Array.isArray(availability)).toBe(true);
      expect(availability.length).toBeGreaterThan(0);
      expect(availability[0].consultantId).toBe(consultantId);
    });

    it("should use default slot duration of 30 minutes", async () => {
      const consultantId = testConsultantId + 9;
      
      const availabilityId = await db.setConsultantAvailability({
        consultantId,
        dayOfWeek: 3,
        startTime: "09:00",
        endTime: "17:00",
      });

      const availability = await db.getConsultantAvailability(consultantId);
      const record = availability.find((a: any) => a.availabilityId === availabilityId);
      
      expect(record?.slotDuration).toBe(30);
    });

    it("should use default max appointments of 10 per day", async () => {
      const consultantId = testConsultantId + 10;
      
      const availabilityId = await db.setConsultantAvailability({
        consultantId,
        dayOfWeek: 4,
        startTime: "09:00",
        endTime: "17:00",
      });

      const availability = await db.getConsultantAvailability(consultantId);
      const record = availability.find((a: any) => a.availabilityId === availabilityId);
      
      expect(record?.maxAppointmentsPerDay).toBe(10);
    });
  });
});
