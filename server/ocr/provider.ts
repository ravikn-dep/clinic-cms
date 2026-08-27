import { GoogleVisionProvider } from './googleVisionProvider';
import type { OcrProvider, OcrInput, OcrResult } from './types';
export { isSafeOcrClientError, validateOcrInput } from './document';
import { assertOcrResultSize, composeDocumentFullText, inspectOcrInput, isSafeOcrClientError } from './document';

class MockOcrProvider implements OcrProvider {
  async extractDocument(input: OcrInput): Promise<OcrResult> {
    const inspected = await inspectOcrInput(input);
    const firstPageText = 'MOCK GST INVOICE\nVendor: Apex Pharma Distributers\nGSTIN: 29AABCA1234F1Z5\nItem: Paracetamol 500mg\nBatch: BAT-999\nExpiry: 2028-12-31\nQty: 100\nRate: 10.00\nTotal: 1000.00';
    const pages = Array.from({ length: inspected.pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: index === 0 ? firstPageText : `MOCK PDF PAGE ${index + 1}\nAdditional deterministic OCR text`,
    }));
    const fullText = inspected.mimeType === 'application/pdf' ? composeDocumentFullText(pages) : firstPageText;
    assertOcrResultSize(fullText);
    return {
      provider: 'mock-ocr',
      fullText,
      pages,
      sourceMimeType: inspected.mimeType,
      pageCount: inspected.pageCount,
      safeProviderMetadata: { mocked: true, processingMode: inspected.mimeType === 'application/pdf' ? 'pdf-file-ocr' : 'image-ocr' },
    };
  }
}

class SanitizingProviderWrapper implements OcrProvider {
  constructor(private inner: OcrProvider) {}

  async extractDocument(input: OcrInput): Promise<OcrResult> {
    try {
      return await this.inner.extractDocument(input);
    } catch (error) {
      const rawErr = error instanceof Error ? error.message : String(error);
      if (
        rawErr.includes('OCR_PROVIDER_INITIALIZATION_FAILED') ||
        rawErr.includes('OCR_PROVIDER_PROCESSING_FAILED') ||
        isSafeOcrClientError(rawErr)
      ) {
        throw error;
      }
      console.error('[OcrProvider] Sanitized raw provider error:', rawErr);
      throw new Error('OCR_PROVIDER_PROCESSING_FAILED');
    }
  }
}

let activeProvider: OcrProvider | null = null;

export function setOcrProvider(provider: OcrProvider | null) {
  activeProvider = provider ? new SanitizingProviderWrapper(provider) : null;
}

export function getOcrProvider(): OcrProvider {
  if (activeProvider) {
    return activeProvider;
  }
  // If in test environment, mock mode, or GOOGLE_APPLICATION_CREDENTIALS is not configured, fallback to MockOcrProvider
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_OCR === 'true' || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new SanitizingProviderWrapper(new MockOcrProvider());
  }
  try {
    return new SanitizingProviderWrapper(new GoogleVisionProvider());
  } catch (error) {
    console.warn('[OCR] Failed to initialize GoogleVisionProvider, falling back to mock provider:', error);
    return new SanitizingProviderWrapper(new MockOcrProvider());
  }
}
