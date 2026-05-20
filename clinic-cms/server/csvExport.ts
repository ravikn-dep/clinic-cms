type CsvPrimitive = string | number | boolean | Date | null | undefined;

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => CsvPrimitive;
};

export function formatCsvValue(value: CsvPrimitive): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();

  const stringValue = String(value);
  const mustQuote = /[",\r\n]/.test(stringValue) || stringValue.startsWith(" ") || stringValue.endsWith(" ");
  const escaped = stringValue.replace(/"/g, '""');

  return mustQuote ? `"${escaped}"` : escaped;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((column) => formatCsvValue(column.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((column) => formatCsvValue(column.value(row))).join(",")
  );

  return [headerLine, ...dataLines].join("\n");
}

export function makeCsvFilename(prefix: string, exportedAt = new Date()): string {
  const timestamp = exportedAt.toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${timestamp}.csv`;
}

export function csvResponse(csv: string, filename: string, rowCount: number) {
  return {
    filename,
    mimeType: "text/csv;charset=utf-8",
    csv,
    rowCount,
    exportedAt: new Date().toISOString(),
  } as const;
}
