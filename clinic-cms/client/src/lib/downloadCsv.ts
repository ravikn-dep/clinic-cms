export type CsvDownloadPayload = {
  csv: string;
  filename: string;
  mimeType?: string;
};

export function downloadCsvFile(payload: CsvDownloadPayload) {
  const blob = new Blob([payload.csv], {
    type: payload.mimeType || "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = payload.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
