import { describe, expect, it } from "vitest";
import { generateConsultationOPHTML } from "../client/src/lib/opFormGenerator";
import { canCompleteEncounter, canGeneratePaperOp, closesVisitAfterBillCreation, isReadyForBilling, paperOpSectionTitles } from "./paperFirstWorkflow";

const op = {
  consultationId: "CON-PAPER-1",
  consultationDate: "2026-08-26T10:00:00.000Z",
  patientId: "PAT-1",
  firstName: "Paper",
  lastName: "Patient",
  age: 42,
  gender: "Other",
  contactNumber: "9999999999",
  clinicalHistory: "DIGITAL HISTORY MUST NOT PRINT",
  presentComplaints: "DIGITAL COMPLAINT MUST NOT PRINT",
  advisedInvestigations: "DIGITAL TEST MUST NOT PRINT",
  treatmentPlan: "DIGITAL TREATMENT MUST NOT PRINT",
  consultantName: "Consultant A",
  qualifications: "MBBS",
  specialization: "Orthopaedics",
  designation: "Consultant",
  registrationCouncil: "TSMC",
  registrationNumber: "REG-1",
  facility: { name: "MAX DIAGNOSTICS", location: "Punjagutta" },
};

describe("paper-first workflow policy", () => {
  it("1. allows Generate OP for Checked-in", () => expect(canGeneratePaperOp("Checked-in")).toBe(true));
  it("2. rejects Generate OP for Scheduled", () => expect(canGeneratePaperOp("Scheduled")).toBe(false));
  it("3. rejects Generate OP for Completed", () => expect(canGeneratePaperOp("Completed")).toBe(false));
  it("4. rejects Generate OP for Cancelled", () => expect(canGeneratePaperOp("Cancelled")).toBe(false));
  it("5. rejects Generate OP for No-show", () => expect(canGeneratePaperOp("No-show")).toBe(false));
  it("6. rejects Generate OP for Rescheduled", () => expect(canGeneratePaperOp("Rescheduled")).toBe(false));
  it("7. allows assigned consultant completion", () => expect(canCompleteEncounter("consultant", 7, 7)).toBe(true));
  it("8. rejects cross-consultant completion", () => expect(canCompleteEncounter("consultant", 7, 8)).toBe(false));
  it("9. allows admin override", () => expect(canCompleteEncounter("admin", 1, 8)).toBe(true));
  it("10. rejects staff completion", () => expect(canCompleteEncounter("staff", 1, 8)).toBe(false));
  it("11. rejects generic user completion", () => expect(canCompleteEncounter("user", 1, 8)).toBe(false));
  it("12. finalized consultation without bill is ready", () => expect(isReadyForBilling(1, false)).toBe(true));
  it("13. draft consultation is not ready", () => expect(isReadyForBilling(0, false)).toBe(false));
  it("14. finalized consultation with bill is not ready", () => expect(isReadyForBilling(1, true)).toBe(false));
  it("15. null finalization is not ready", () => expect(isReadyForBilling(null, false)).toBe(false));
  it("16. bill creation closes visit", () => expect(closesVisitAfterBillCreation(true)).toBe(true));
  it("17. no bill does not close visit", () => expect(closesVisitAfterBillCreation(false)).toBe(false));
  it("18. policy exposes six blank paper sections", () => expect(paperOpSectionTitles()).toHaveLength(6));
  it("19. first section is history", () => expect(paperOpSectionTitles()[0]).toContain("history"));
  it("20. second section is examination", () => expect(paperOpSectionTitles()[1]).toContain("examination"));
  it("21. third section is investigations", () => expect(paperOpSectionTitles()[2]).toBe("Investigations"));
  it("22. fourth section is diagnosis", () => expect(paperOpSectionTitles()[3]).toContain("Diagnosis"));
  it("23. fifth section is treatment", () => expect(paperOpSectionTitles()[4]).toContain("Treatment"));
  it("24. sixth section is follow-up", () => expect(paperOpSectionTitles()[5]).toContain("follow-up"));
});

describe("paper OP rendering", () => {
  const html = generateConsultationOPHTML(op);
  it("25. renders consultant on the left identity block", () => expect(html.indexOf("Consultant A")).toBeLessThan(html.indexOf("MAX DIAGNOSTICS")));
  it("26. renders facility name", () => expect(html).toContain("MAX DIAGNOSTICS"));
  it("27. renders facility location", () => expect(html).toContain("Punjagutta"));
  it("28. renders patient ID", () => expect(html).toContain("PAT-1"));
  it("29. renders patient name", () => expect(html).toContain("Paper Patient"));
  it("30. renders age", () => expect(html).toContain("42"));
  it("31. renders gender", () => expect(html).toContain("Other"));
  it("32. renders contact number", () => expect(html).toContain("9999999999"));
  it("33. renders handwriting areas", () => expect(html.match(/<div class="handwriting-lines"/g)?.length).toBe(6));
  it("34. renders chief complaints heading", () => expect(html).toContain("Chief complaints / history"));
  it("35. renders clinical examination heading", () => expect(html).toContain("Clinical examination / findings"));
  it("36. renders diagnosis heading", () => expect(html).toContain("Diagnosis / assessment"));
  it("37. renders treatment heading", () => expect(html).toContain("Treatment / prescription"));
  it("38. renders follow-up heading", () => expect(html).toContain("Advice / follow-up"));
  it("39. does not print digital clinical history", () => expect(html).not.toContain("DIGITAL HISTORY MUST NOT PRINT"));
  it("40. does not print digital treatment", () => expect(html).not.toContain("DIGITAL TREATMENT MUST NOT PRINT"));
});
