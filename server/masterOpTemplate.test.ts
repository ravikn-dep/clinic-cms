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
  consultantTimings: "Mon to Sat: 5:30 PM–8:30 PM · Sunday: 10:00 AM–12:00 PM & 3:00 PM–5:00 PM",
  facility: { name: "MAX DIAGNOSTICS", location: "Punjagutta" },
};

describe("master OP template", () => {
  it("uses one A4 master layout with dynamic consultant and patient data", () => {
    const html = generateConsultationOPHTML({ ...baseOp, consultantLogoUrl: "https://example.test/logo-wide.png" });
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('.page { width:194mm; height:282mm;');
    expect(html).toContain('width:42mm; height:22mm; display:flex; align-items:center; justify-content:center;');
    expect(html).toContain('height:11mm; width:auto;');
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain('class="consultant-logo"');
    expect(header).not.toContain("Dr Deepthi");
    expect(header).not.toContain("MBBS, MS");
    expect(header).not.toContain("Consultant Orthopaedist");
    expect(html).toContain("Asha Rao");
    expect(html).toContain('<span class="label">Consultant</span><span class="value">Dr Deepthi</span>');
    expect(html).toContain("DOCM-27/08/26OP001");
    expect(html).toContain("Punjagutta, Hyderabad");
    expect(html).toContain("Mon to Sat: 5:30 PM");
    expect(html).toContain("Clinical Notes");
    expect(html).toContain("OP valid only upto 4 weeks or one visit within.");
    expect(html).toContain('class="consultant-logo"');
    expect(html).not.toContain('class="facility"');
    expect(html).not.toContain("repeating-linear-gradient");
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
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).not.toContain("Dr Deepthi");
    expect(html).toContain("Clinical Notes");
    expect(html).toContain("Signature");
  });

  it("formats OP date/time in the required 12-hour display form", () => {
    const formatted = formatOPDateTime("2026-08-27T12:45:00.000Z");
    expect(formatted).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, (?:0[1-9]|1[0-2]):\d{2} (?:AM|PM)$/);
  });

  it("formats stored MySQL UTC timestamps in the fixed clinic timezone", () => {
    expect(formatOPDateTime("2026-08-30 05:12:52")).toBe("30 Aug 2026, 10:42 AM");
    expect(formatOPDateTime("2026-08-30T05:12:52.000Z")).toBe("30 Aug 2026, 10:42 AM");
  });

  it("derives compact human-readable timings from consultant availability", () => {
    expect(formatConsultantAvailability([
      { dayOfWeek: 1, startTime: "17:30", endTime: "20:30" },
      { dayOfWeek: 2, startTime: "17:30", endTime: "20:30" },
      { dayOfWeek: 3, startTime: "17:30", endTime: "20:30" },
      { dayOfWeek: 4, startTime: "17:30", endTime: "20:30" },
      { dayOfWeek: 5, startTime: "17:30", endTime: "20:30" },
      { dayOfWeek: 6, startTime: "17:30", endTime: "20:30" },
      { dayOfWeek: 0, startTime: "10:00", endTime: "12:00" },
      { dayOfWeek: 0, startTime: "15:00", endTime: "17:00" },
    ])).toBe("Mon to Sat: 5:30 PM–8:30 PM · Sunday: 10:00 AM–12:00 PM & 3:00 PM–5:00 PM");
    expect(formatConsultantAvailability([])).toBeNull();
  });

  it("keeps the signature optional and positions the writing area before the footer", () => {
    const html = generateConsultationOPHTML({ ...baseOp, signatureUrl: "https://example.test/signature.png" });
    expect(html).toContain('class="signature-image"');
    expect(html.indexOf('class="clinical-area"')).toBeLessThan(html.indexOf('class="footer"'));
    expect(html).toContain("height:9mm;");
    expect(html).toContain("Location:");
    expect(html).toContain("Date &amp; Time:");
  });
});
