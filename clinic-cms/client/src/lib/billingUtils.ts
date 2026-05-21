export function parseCurrency(value: unknown): number {
  return Number.parseFloat(String(value ?? "0")) || 0;
}

export function formatMoney(value: unknown): string {
  const numeric = parseCurrency(value);
  return `₹${numeric.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function openInvoiceUrl(url: string, mode: "view" | "print" = "view") {
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to open the invoice.");
  }
  if (mode === "print") {
    win.addEventListener("load", () => {
      win.focus();
      win.print();
    });
  }
}

export async function downloadFromUrl(url: string, filename: string) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to download invoice file");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
