import { assertOcrResultSize, composeDocumentFullText, inspectOcrInput, isSafeOcrClientError, runWithOcrTimeout } from './document';
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
    const inspected = await inspectOcrInput(input);

    try {
      const client = this.getClient();
      if (inspected.mimeType === 'application/pdf') {
        return await this.extractPdf(client, inspected.buffer, inspected.pageCount);
      }
      const [result] = await runWithOcrTimeout<any>(client.documentTextDetection({
        image: { content: inspected.buffer },
      }));

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
            text: pageText.trim(),
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

      const resolvedPages = pages.length > 0 ? pages : [{ pageNumber: 1, text: '' }];
      assertOcrResultSize(fullText);
      return {
        provider: 'google-cloud-vision',
        fullText,
        pages: resolvedPages,
        sourceMimeType: inspected.mimeType,
        pageCount: resolvedPages.length,
        // Confidence omitted when uncalculated from raw confidence annotations per security hardening rules
        safeProviderMetadata: {
          processingMode: 'image-ocr',
          pageCount: resolvedPages.length,
        },
      };
    } catch (error) {
      const rawErr = error instanceof Error ? error.message : String(error);
      if (rawErr.includes('OCR_PROVIDER_INITIALIZATION_FAILED') || rawErr.includes('OCR_PROVIDER_PROCESSING_FAILED') || rawErr.includes('OCR_PROVIDER_TIMEOUT') || isSafeOcrClientError(rawErr)) {
        throw error;
      }
      console.error('[GoogleVisionProvider] Processing error:', rawErr);
      throw new Error('OCR_PROVIDER_PROCESSING_FAILED');
    }
  }

  private async extractPdf(client: any, content: Buffer, pageCount: number): Promise<OcrResult> {
    const requestedPages = Array.from({ length: pageCount }, (_, index) => index + 1);
    const [batchResult] = await runWithOcrTimeout<any>(client.batchAnnotateFiles({
      requests: [{
        inputConfig: { content, mimeType: 'application/pdf' },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        pages: requestedPages,
      }],
    }));
    const fileResponse = batchResult?.responses?.[0];
    if (!fileResponse || fileResponse.error || !Array.isArray(fileResponse.responses)) {
      throw new Error('OCR_PROVIDER_PROCESSING_FAILED');
    }
    if (fileResponse.responses.length !== pageCount) {
      throw new Error('OCR_PROVIDER_PROCESSING_FAILED');
    }

    const pages: OcrPage[] = fileResponse.responses.map((response: any, index: number) => {
      if (response?.error) throw new Error('OCR_PROVIDER_PROCESSING_FAILED');
      return {
        pageNumber: index + 1,
        text: response?.fullTextAnnotation?.text?.trim() || '',
      };
    });
    const fullText = composeDocumentFullText(pages);
    assertOcrResultSize(fullText);
    return {
      provider: 'google-cloud-vision',
      fullText,
      pages,
      sourceMimeType: 'application/pdf',
      pageCount,
      safeProviderMetadata: { processingMode: 'synchronous-file-annotation', pageCount },
    };
  }
}
