import type { CatalogMatchLevel, CatalogMatchSource } from "../../shared/catalogResolution";

export type CatalogRecord = {
  catalogItemId: string;
  canonicalName: string;
  normalizedName: string;
  genericName: string | null;
  brandName: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  hsnCode: string | null;
};

export type CatalogAliasRecord = {
  aliasId: string;
  catalogItemId: string;
  vendorId: string;
  aliasText: string;
  normalizedAlias: string;
};

export type CatalogMatchInput = {
  lineDescription: string;
  vendorId?: string;
  hsnCode?: string;
};

export type CatalogMatchSuggestion = {
  catalogItemId: string;
  canonicalName: string;
  matchLevel: CatalogMatchLevel;
  reasons: string[];
  conflicts: string[];
  source: CatalogMatchSource;
};
