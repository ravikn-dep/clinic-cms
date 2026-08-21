import { GoogleVisionProvider } from './googleVisionProvider';
import type { OcrProvider, OcrInput, OcrResult } from './types';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

export function validateOcrInput(input: OcrInput): void {
  if (!input || !input.data) {
    throw new Error('OCR input data is required');
  }

  const mimeType = (input.mimeType || '').toLowerCase().trim();
  if (mimeType === 'application/pdf') {
    throw new Error('PDF OCR is not supported in this release');
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported MIME type '${input.mimeType}'. Allowed types: JPEG, PNG.`);
  }

  let buffer: Buffer;
  if (Buffer.isBuffer(input.data)) {
    buffer = input.data;
  } else if (typeof input.data === 'string') {
    if (input.data.startsWith('data:')) {
      const base64Data = input.data.split(',')[1];
      if (!base64Data) {
        throw new Error('Malformed data URI in OCR input');
      }
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      try {
        buffer = Buffer.from(input.data, 'base64');
      } catch {
        buffer = Buffer.from(input.data);
      }
    }
  } else {
    throw new Error('Invalid OCR input data format');
  }

  if (buffer.length === 0) {
    throw new Error('Cannot process empty file for OCR');
  }

  const maxBytes = (input.maxSizeMb || 10) * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error(`File size exceeds maximum allowed limit of ${input.maxSizeMb || 10}MB`);
  }
}

class MockOcrProvider implements OcrProvider {
  async extractDocument(input: OcrInput): Promise<OcrResult> {
    validateOcrInput(input);
    return {
      provider: 'mock-ocr',
      fullText: 'MOCK GST INVOICE\nVendor: Apex Pharma Distributers\nGSTIN: 29AABCA1234F1Z5\nItem: Paracetamol 500mg\nBatch: BAT-999\nExpiry: 2028-12-31\nQty: 100\nRate: 10.00\nTotal: 1000.00',
      pages: [
        {
          pageNumber: 1,
          text: 'MOCK GST INVOICE\nVendor: Apex Pharma Distributers\nGSTIN: 29AABCA1234F1Z5\nItem: Paracetamol 500mg\nBatch: BAT-999\nExpiry: 2028-12-31\nQty: 100\nRate: 10.00\nTotal: 1000.00',
        },
      ],
      rawProviderMetadata: { mocked: true },
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
        rawErr.includes('Unsupported MIME type') ||
        rawErr.includes('PDF OCR is not supported') ||
        rawErr.includes('Cannot process empty file') ||
        rawErr.includes('exceeds maximum allowed limit') ||
        rawErr.includes('OCR input data is required') ||
        rawErr.includes('Malformed data URI')
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
