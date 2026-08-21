import { validateOcrInput } from './provider';
import type { OcrProvider, OcrInput, OcrResult, OcrPage } from './types';

export class GoogleVisionProvider implements OcrProvider {
  private client: any = null;

  private getClient() {
    if (!this.client) {
      try {
        // Dynamic import to avoid hard bundling failure if package is absent in some environments
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vision = require('@google-cloud/vision');
        this.client = new vision.ImageAnnotatorClient();
      } catch (error) {
        const rawErr = error instanceof Error ? error.message : String(error);
        console.error('[GoogleVisionProvider] Initialization failed:', rawErr);
        throw new Error('OCR_PROVIDER_INITIALIZATION_FAILED');
      }
    }
    return this.client;
  }

  async extractDocument(input: OcrInput): Promise<OcrResult> {
    validateOcrInput(input);

    let contentBuffer: Buffer;
    if (Buffer.isBuffer(input.data)) {
      contentBuffer = input.data;
    } else if (typeof input.data === 'string') {
      if (input.data.startsWith('data:')) {
        const base64Data = input.data.split(',')[1];
        if (!base64Data) {
          throw new Error('Malformed data URI in OCR input');
        }
        contentBuffer = Buffer.from(base64Data, 'base64');
      } else {
        try {
          contentBuffer = Buffer.from(input.data, 'base64');
        } catch {
          contentBuffer = Buffer.from(input.data);
        }
      }
    } else {
      throw new Error('Invalid OCR input format');
    }

    try {
      const client = this.getClient();
      const [result] = await client.documentTextDetection({
        image: { content: contentBuffer },
      });

      const fullTextAnnotation = result.fullTextAnnotation;
      const fullText = fullTextAnnotation?.text || '';
      
      const pages: OcrPage[] = [];
      if (fullTextAnnotation?.pages) {
        fullTextAnnotation.pages.forEach((page: any, idx: number) => {
          let pageText = '';
          if (page.blocks) {
            page.blocks.forEach((block: any) => {
              if (block.paragraphs) {
                block.paragraphs.forEach((para: any) => {
                  if (para.words) {
                    const wordsStr = para.words
                      .map((word: any) =>
                        (word.symbols || []).map((s: any) => s.text).join('')
                      )
                      .join(' ');
                    pageText += wordsStr + '\n';
                  }
                });
              }
            });
          }
          pages.push({
            pageNumber: idx + 1,
            text: pageText.trim() || fullText,
            width: page.width,
            height: page.height,
          });
        });
      }

      if (pages.length === 0 && fullText) {
        pages.push({
          pageNumber: 1,
          text: fullText,
        });
      }

      return {
        provider: 'google-cloud-vision',
        fullText,
        pages,
        // Confidence omitted when uncalculated from raw confidence annotations per security hardening rules
        rawProviderMetadata: {
          textAnnotationsCount: result.textAnnotations?.length || 0,
        },
      };
    } catch (error) {
      const rawErr = error instanceof Error ? error.message : String(error);
      if (rawErr.includes('OCR_PROVIDER_INITIALIZATION_FAILED') || rawErr.includes('OCR_PROVIDER_PROCESSING_FAILED') || rawErr.includes('Unsupported MIME type') || rawErr.includes('PDF OCR is not supported') || rawErr.includes('Cannot process empty file') || rawErr.includes('exceeds maximum allowed limit') || rawErr.includes('OCR input data is required') || rawErr.includes('Malformed data URI')) {
        throw error;
      }
      console.error('[GoogleVisionProvider] Processing error:', rawErr);
      throw new Error('OCR_PROVIDER_PROCESSING_FAILED');
    }
  }
}
