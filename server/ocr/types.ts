export type OcrInputType = 'base64' | 'url' | 'buffer';

export type OcrInput = {
  data: string | Buffer;
  mimeType: string;
  inputType?: OcrInputType;
  fileName?: string;
  maxSizeMb?: number;
};

export type OcrPage = {
  pageNumber: number;
  text: string;
  width?: number;
  height?: number;
};

export type OcrResult = {
  provider: "google-cloud-vision" | "mock-ocr";
  fullText: string;
  pages: OcrPage[];
  confidence?: number;
  rawProviderMetadata?: Record<string, unknown>;
};

export interface OcrProvider {
  extractDocument(input: OcrInput): Promise<OcrResult>;
}
