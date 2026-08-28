import { afterEach, describe, expect, it, vi } from "vitest";
import { closePrintWindow, openAndPrintWhenReady, openPrintWindow, renderAndPrintWindow } from "../client/src/lib/printWindow";

type FakeDocument = {
  open: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

type FakePrintWindow = {
  closed: boolean;
  document: FakeDocument;
  focus: ReturnType<typeof vi.fn>;
  print: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function makePrintWindow(): FakePrintWindow {
  return {
    closed: false,
    document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
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
  });

  it("renders the final OP and starts printing after branded data resolves", () => {
    const popup = makePrintWindow();

    renderAndPrintWindow(popup as unknown as Window, "<!doctype html><html><body>OP</body></html>");

    expect(popup.document.open).toHaveBeenCalledOnce();
    expect(popup.document.write).toHaveBeenCalledWith("<!doctype html><html><body>OP</body></html>");
    expect(popup.document.close).toHaveBeenCalledOnce();
    expect(popup.focus).toHaveBeenCalledOnce();
    expect(popup.print).toHaveBeenCalledOnce();
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

  it("closes an opened popup safely when branded data fails", () => {
    const popup = makePrintWindow();

    closePrintWindow(popup as unknown as Window);

    expect(popup.close).toHaveBeenCalledOnce();
  });
});
