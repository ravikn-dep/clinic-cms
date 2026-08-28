export function openPrintWindow(): Window | null {
  const printWindow = window.open("", "_blank", "width=800,height=600");
  if (!printWindow) return null;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><title>Preparing consultation OP…</title></head><body><p style="font-family:Arial,sans-serif;padding:24px">Preparing the consultant-branded OP…</p></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  return printWindow;
}

export function renderAndPrintWindow(printWindow: Window, html: string): void {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

/**
 * Opens the popup before starting asynchronous work so the invocation remains
 * inside the browser's user-gesture allowance. The caller supplies only the
 * later HTML resolution work; failed resolutions close the blank preview.
 */
export async function openAndPrintWhenReady(loadHtml: () => Promise<string>): Promise<boolean> {
  const printWindow = openPrintWindow();
  if (!printWindow) return false;

  try {
    renderAndPrintWindow(printWindow, await loadHtml());
    return true;
  } catch (error) {
    closePrintWindow(printWindow);
    throw error;
  }
}

export function closePrintWindow(printWindow: Window | null): void {
  if (printWindow && !printWindow.closed) printWindow.close();
}
