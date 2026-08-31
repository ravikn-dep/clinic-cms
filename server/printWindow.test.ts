import { afterEach, describe, expect, it, vi } from "vitest";
import { closePrintWindow, getPrintErrorMessage, openAndPrintWhenReady, openPrintWindow, renderAndPrintWindow, waitForPrintAssets } from "../client/src/lib/printWindow";

type FakeImage = {
  complete: boolean;
  naturalWidth: number;
  src?: string;
  decode: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  trigger: (eventName: "load" | "error") => void;
  getAttribute: ReturnType<typeof vi.fn>;
};

type FakeDocument = {
  open: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  images: FakeImage[];
};

type FakePrintWindow = {
  closed: boolean;
  document: FakeDocument;
  focus: ReturnType<typeof vi.fn>;
  print: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function makeImage(overrides: Partial<Pick<FakeImage, "complete" | "naturalWidth">> = {}): FakeImage {
  const listeners = new Map<string, () => void>();
  const image: FakeImage = {
    complete: false,
    naturalWidth: 0,
    decode: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((eventName: string, handler: () => void) => listeners.set(eventName, handler)),
    removeEventListener: vi.fn((eventName: string) => listeners.delete(eventName)),
    trigger: (eventName) => listeners.get(eventName)?.(),
    getAttribute: vi.fn().mockReturnValue("/manus-storage/consultant-logo.png"),
    ...overrides,
  };
  return image;
}

function makePrintWindow(images: FakeImage[] = []): FakePrintWindow {
  return {
    closed: false,
    document: { open: vi.fn(), write: vi.fn(), close: vi.fn(), images },
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
  };
}

describe("shared print-window orchestration", () => {
  const runtime = globalThis as typeof globalThis & { window?: Window };
  const originalWindow = runtime.window;

  afterEach(() => {
    runtime.window = originalWindow;
    vi.restoreAllMocks();
  });

  it("opens the popup synchronously and leaves a preparing document before async data resolves", () => {
    const popup = makePrintWindow();
    const open = vi.fn().mockReturnValue(popup);
    runtime.window = { open } as unknown as Window;

    expect(openPrintWindow()).toBe(popup);
    expect(open).toHaveBeenCalledWith("", "_blank", "width=800,height=600");
    expect(popup.document.open).toHaveBeenCalledOnce();
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining("Preparing the consultant-branded OP"));
    expect(popup.document.close).toHaveBeenCalledOnce();
    expect(popup.focus).toHaveBeenCalledOnce();
  });

  it("renders the final OP and starts printing when no image assets are required", async () => {
    const popup = makePrintWindow();

    await renderAndPrintWindow(popup as unknown as Window, "<!doctype html><html><body>OP</body></html>");

    expect(popup.document.open).toHaveBeenCalledOnce();
    expect(popup.document.write).toHaveBeenCalledWith("<!doctype html><html><body>OP</body></html>");
    expect(popup.document.close).toHaveBeenCalledOnce();
    expect(popup.focus).toHaveBeenCalledOnce();
    expect(popup.print).toHaveBeenCalledOnce();
  });

  it("waits for a configured logo to load and decode before printing", async () => {
    const image = makeImage();
    const popup = makePrintWindow([image]);

    const rendered = renderAndPrintWindow(popup as unknown as Window, "<html><body><img src='/logo.png'></body></html>");
    expect(popup.print).not.toHaveBeenCalled();

    image.complete = true;
    image.naturalWidth = 640;
    image.trigger("load");
    await rendered;

    expect(image.decode).toHaveBeenCalledOnce();
    expect(popup.print).toHaveBeenCalledOnce();
  });

  it("resolves managed-storage images through the opener origin before waiting to print", async () => {
    const image = makeImage({ complete: true, naturalWidth: 640 });
    const popup = makePrintWindow([image]);
    runtime.window = { location: { origin: "https://preview.example.test" } } as unknown as Window;

    await renderAndPrintWindow(popup as unknown as Window, "<html><body><img src='/manus-storage/consultant-logo.png'></body></html>");

    expect(image.src).toBe("https://preview.example.test/manus-storage/consultant-logo.png");
    expect(popup.print).toHaveBeenCalledOnce();
  });

  it("settles an image that completes while readiness listeners are being attached", async () => {
    const image = makeImage();
    const popup = makePrintWindow([image]);
    image.addEventListener.mockImplementation((eventName: string, handler: () => void) => {
      if (eventName === "load") {
        image.complete = true;
        image.naturalWidth = 640;
        handler();
      }
    });

    await renderAndPrintWindow(popup as unknown as Window, "<html><body><img src='/logo.png'></body></html>");

    expect(image.decode).toHaveBeenCalledOnce();
    expect(popup.print).toHaveBeenCalledOnce();
  });

  it("does not print when a configured logo reports a load failure", async () => {
    const popup = makePrintWindow([makeImage({ complete: true, naturalWidth: 0 })]);

    await expect(renderAndPrintWindow(popup as unknown as Window, "<html><body><img src='/logo.png'></body></html>"))
      .rejects.toThrow("PRINT_ASSET_LOAD_FAILED");
    expect(popup.print).not.toHaveBeenCalled();
    expect(getPrintErrorMessage(new Error("PRINT_ASSET_LOAD_FAILED"), "fallback"))
      .toBe("A consultant print image could not be loaded. Please retry printing.");
  });

  it("opens the popup before asynchronous OP generation begins", async () => {
    const popup = makePrintWindow();
    const order: string[] = [];
    const open = vi.fn(() => {
      order.push("open");
      return popup;
    });
    runtime.window = { open } as unknown as Window;
    let completeHtml: ((html: string) => void) | undefined;
    const rendered = openAndPrintWhenReady(async () => {
      order.push("load");
      return new Promise<string>((resolve) => { completeHtml = resolve; });
    });

    expect(order).toEqual(["open", "load"]);
    completeHtml?.("<html><body>OP</body></html>");
    await expect(rendered).resolves.toBe(true);
    expect(popup.document.write).toHaveBeenLastCalledWith("<html><body>OP</body></html>");
    expect(popup.print).toHaveBeenCalledOnce();
  });

  it("reports a popup-blocked attempt without starting asynchronous data work", async () => {
    const open = vi.fn().mockReturnValue(null);
    runtime.window = { open } as unknown as Window;
    const loadHtml = vi.fn().mockResolvedValue("<html><body>OP</body></html>");

    await expect(openAndPrintWhenReady(loadHtml)).resolves.toBe(false);
    expect(loadHtml).not.toHaveBeenCalled();
  });

  it("closes an opened popup and preserves the failure when branded data fails", async () => {
    const popup = makePrintWindow();
    runtime.window = { open: vi.fn().mockReturnValue(popup) } as unknown as Window;

    await expect(openAndPrintWhenReady(async () => {
      throw new Error("safe provider failure");
    })).rejects.toThrow("safe provider failure");

    expect(popup.close).toHaveBeenCalledOnce();

    closePrintWindow(popup as unknown as Window);

    expect(popup.close).toHaveBeenCalledTimes(2);
  });

  it("fails closed on a required image timeout and closes the preview", async () => {
    const image = makeImage();
    const popup = makePrintWindow([image]);
    await expect(waitForPrintAssets(popup as unknown as Window, 1)).rejects.toThrow("PRINT_ASSET_TIMEOUT");

    runtime.window = { open: vi.fn().mockReturnValue(popup) } as unknown as Window;
    await expect(openAndPrintWhenReady(async () => "<html><body><img src='/logo.png'></body></html>"))
      .rejects.toThrow("PRINT_ASSET_TIMEOUT");
    expect(popup.close).toHaveBeenCalledOnce();
  });
});
