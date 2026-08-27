import { describe, expect, it } from "vitest";
import { formatConsultantAvailability } from "./db";
import { formatOPDateTime, generateConsultationOPHTML } from "../client/src/lib/opFormGenerator";

const baseOp = {
  consultationId: "CON-1",
  consultationDate: "2026-08-27T12:45:00.000Z",
  patientId: "DOCM-27/08/26OP001",
  firstName: "Asha",
  lastName: "Rao",
  age: 35,
  gender: "Female",
  contactNumber: "9999999999",
  address: "Hyderabad",
  consultantName: "Dr Deepthi",
  qualifications: "MBBS, MS",
  designation: "Consultant Orthopaedist",
  consultantLocation: "Punjagutta, Hyderabad",
  consultantTimings: "Mon: 5:30 PM–8:30 PM · Sun: 10:00 AM–12:00 PM & 3:00 PM–5:00 PM",
  facility: { name: "MAX DIAGNOSTICS", location: "Punjagutta" },
};

describe("master OP template", () => {
  it("uses one A4 master layout with dynamic consultant and patient data", () => {
    const html = generateConsultationOPHTML({ ...baseOp, consultantLogoUrl: "https://example.test/logo-wide.png" });
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('.page { width:194mm; height:282mm;');
    expect(html).toContain('height:16mm; width:auto;');
    expect(html).toContain("Dr Deepthi");
    expect(html).toContain("Asha Rao");
    expect(html).toContain("DOCM-27/08/26OP001");
    expect(html).toContain("Punjagutta, Hyderabad");
    expect(html).toContain("Mon: 5:30 PM");
    expect(html).toContain("Clinical Notes");
    expect(html).toContain("OP valid only upto 4 weeks or one visit within.");
    expect(html).toContain('class="consultant-logo"');
    expect(html).not.toContain('class="facility"');
  });

  it("safely renders missing logo, location, timings, and optional patient data", () => {
    const html = generateConsultationOPHTML({
      ...baseOp,
      age: null,
      gender: null,
      address: null,
      consultantLocation: null,
      consultantTimings: null,
    });
    expect(html).not.toContain("src=\"undefined\"");
    expect(html).not.toContain("src=\"null\"");
    expect(html).toContain("Clinical Notes");
    expect(html).toContain("Signature");
  });

  it("formats OP date/time in the required 12-hour display form", () => {
    const formatted = formatOPDateTime("2026-08-27T12:45:00.000Z");
    expect(formatted).toMatch(/am|pm/i);
    expect(formatted).toMatch(/\b(?:0?[1-9]|1[0-2]):\d{2} (?:am|pm)\b/i);
  });

  it("derives compact human-readable timings from consultant availability", () => {
    expect(formatConsultantAvailability([
      { dayOfWeek: 1, startTime: "17:30", endTime: "20:30" },
      { dayOfWeek: 0, startTime: "10:00", endTime: "12:00" },
      { dayOfWeek: 0, startTime: "15:00", endTime: "17:00" },
    ])).toBe("Mon: 5:30 PM–8:30 PM · Sun: 10:00 AM–12:00 PM & 3:00 PM–5:00 PM");
    expect(formatConsultantAvailability([])).toBeNull();
  });

  it("keeps the signature optional and positions the writing area before the footer", () => {
    const html = generateConsultationOPHTML({ ...baseOp, signatureUrl: "https://example.test/signature.png" });
    expect(html).toContain('class="signature-image"');
    expect(html.indexOf('class="clinical-area"')).toBeLessThan(html.indexOf('class="footer"'));
    expect(html).toContain("height:9mm;");
  });
});
