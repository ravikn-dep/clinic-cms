import { describe, expect, it } from "vitest";
import { csvResponse, formatCsvValue, makeCsvFilename, toCsv } from "./csvExport";

describe("csv export utilities", () => {
  it("formats empty values as blank CSV cells", () => {
    expect(formatCsvValue(null)).toBe("");
    expect(formatCsvValue(undefined)).toBe("");
  });

  it("escapes commas, quotes, and line breaks safely", () => {
    expect(formatCsvValue('Doe, John')).toBe('"Doe, John"');
    expect(formatCsvValue('Patient says "better" today')).toBe('"Patient says ""better"" today"');
    expect(formatCsvValue("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
  });

  it("keeps simple numbers and strings unquoted", () => {
    expect(formatCsvValue(42)).toBe("42");
    expect(formatCsvValue("PAT-ABC12345")).toBe("PAT-ABC12345");
  });

  it("exports rows with header order preserved", () => {
    const csv = toCsv(
      [
        { id: "PAT-001", name: "Asha Rao", note: "Requires follow-up" },
        { id: "PAT-002", name: "Meera, Khan", note: "Quote: \"stable\"" },
      ],
      [
        { header: "Patient ID", value: (row) => row.id },
        { header: "Name", value: (row) => row.name },
        { header: "Note", value: (row) => row.note },
      ]
    );

    expect(csv).toBe([
      "Patient ID,Name,Note",
      "PAT-001,Asha Rao,Requires follow-up",
      'PAT-002,"Meera, Khan","Quote: ""stable"""',
    ].join("\n"));
  });

  it("creates a header-only file when there are no rows", () => {
    const csv = toCsv([], [
      { header: "Bill ID", value: (row: { billId: string }) => row.billId },
      { header: "Payment Status", value: (row: { paymentStatus: string }) => row.paymentStatus },
    ]);

    expect(csv).toBe("Bill ID,Payment Status");
  });

  it("normalizes dates to ISO timestamps", () => {
    expect(formatCsvValue(new Date("2026-04-29T01:02:03.000Z"))).toBe("2026-04-29T01:02:03.000Z");
  });

  it("builds deterministic timestamped CSV filenames", () => {
    const filename = makeCsvFilename("patient-records", new Date("2026-04-29T01:02:03.004Z"));
    expect(filename).toBe("patient-records-2026-04-29T01-02-03-004Z.csv");
  });

  it("wraps CSV data with download response metadata", () => {
    const response = csvResponse("A,B\n1,2", "billing-history.csv", 1);

    expect(response).toMatchObject({
      filename: "billing-history.csv",
      mimeType: "text/csv;charset=utf-8",
      csv: "A,B\n1,2",
      rowCount: 1,
    });
    expect(new Date(response.exportedAt).toString()).not.toBe("Invalid Date");
  });
});
