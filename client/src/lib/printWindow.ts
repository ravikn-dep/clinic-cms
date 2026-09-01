const PRINT_ASSET_LOAD_FAILED = "PRINT_ASSET_LOAD_FAILED";
const PRINT_ASSET_TIMEOUT = "PRINT_ASSET_TIMEOUT";
const DEFAULT_PRINT_ASSET_TIMEOUT_MS = 5000;

type PrintImage = HTMLImageElement;

function printAssetError(code: string): Error {
  return new Error(code);
}

async function waitForImage(image: PrintImage): Promise<void> {
  const decodeImage = async () => {
    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        throw printAssetError(PRINT_ASSET_LOAD_FAILED);
      }
    }
  };

  if (image.complete) {
    if (image.naturalWidth <= 0) throw printAssetError(PRINT_ASSET_LOAD_FAILED);
    await decodeImage();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
    const onLoad = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (image.naturalWidth <= 0) {
        reject(printAssetError(PRINT_ASSET_LOAD_FAILED));
        return;
      }
      void decodeImage().then(resolve, reject);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(printAssetError(PRINT_ASSET_LOAD_FAILED));
    };

    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
    // An image can finish in the interval before its listeners are attached.
    if (image.complete) onLoad();
  });
}

function resolveRelativePrintAssetUrls(printWindow: Window): void {
  const openerOrigin = typeof window === "undefined" ? undefined : window.location?.origin;
  if (!openerOrigin) return;

  Array.from(printWindow.document.images).forEach((image) => {
    const source = image.getAttribute("src");
    if (source?.startsWith("/")) image.src = new URL(source, openerOrigin).toString();
  });
}

export async function waitForPrintAssets(
  printWindow: Window,
  timeoutMs = DEFAULT_PRINT_ASSET_TIMEOUT_MS,
): Promise<void> {
  const images = Array.from(printWindow.document.images).filter((image) => Boolean(image.getAttribute("src")));
  if (images.length === 0) return;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(images.map(waitForImage)),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(printAssetError(PRINT_ASSET_TIMEOUT)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function getPrintErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === PRINT_ASSET_TIMEOUT) {
    return "A consultant print image took too long to load. Please retry printing.";
  }
  if (error instanceof Error && error.message === PRINT_ASSET_LOAD_FAILED) {
    return "A consultant print image could not be loaded. Please retry printing.";
  }
  return fallback;
}

export function openPrintWindow(): Window | null {
  const printWindow = window.open("", "_blank", "width=800,height=600");
  if (!printWindow) return null;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><title>Preparing consultation OP…</title></head><body><p style="font-family:Arial,sans-serif;padding:24px">Preparing the consultant-branded OP…</p></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  return printWindow;
}

export async function renderAndPrintWindow(printWindow: Window, html: string): Promise<void> {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  resolveRelativePrintAssetUrls(printWindow);
  await waitForPrintAssets(printWindow);
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
    await renderAndPrintWindow(printWindow, await loadHtml());
    return true;
  } catch (error) {
    closePrintWindow(printWindow);
    throw error;
  }
}

export function closePrintWindow(printWindow: Window | null): void {
  if (printWindow && !printWindow.closed) printWindow.close();
}
