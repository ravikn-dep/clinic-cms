export type CatalogMatchLevel = "EXACT" | "STRONG" | "POSSIBLE";
export type CatalogMatchSource = "CANONICAL_NAME" | "ALIAS" | "VENDOR_ALIAS";

/**
 * Created only from an explicit reviewer action. OCR and parser outputs never
 * populate this structure, and an unmatched line has no catalogItemId.
 */
export type CatalogResolutionDecision = {
  lineIndex: number;
  originalExtractedDescription: string;
  reviewedDescription: string;
  decision: "ACCEPTED" | "UNMATCHED";
  catalogItemId?: string;
  canonicalName?: string;
  matchLevel?: CatalogMatchLevel;
  source?: CatalogMatchSource;
  reasons: string[];
  conflicts: string[];
  confirmedAt: string;
};
