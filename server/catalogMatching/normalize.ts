const UNIT_ALIASES: Record<string, string> = {
  mg: "mg",
  milligram: "mg",
  milligrams: "mg",
  mcg: "mcg",
  microgram: "mcg",
  micrograms: "mcg",
  g: "g",
  gram: "g",
  grams: "g",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
};

const CONTROLLED_ABBREVIATIONS: Record<string, string> = {
  tab: "tablet",
  tabs: "tablet",
  cap: "capsule",
  caps: "capsule",
  inj: "injection",
  syr: "syrup",
};

const DOSAGE_FORMS = new Set([
  "tablet", "capsule", "syrup", "suspension", "injection", "cream", "ointment", "drops", "spray", "gel", "solution",
]);

const MODIFIED_RELEASE_MARKERS = new Set(["xr", "sr", "cr", "er", "dr"]);

export type ClinicalSignature = {
  strengths: string[];
  dosageForms: string[];
  releaseMarkers: string[];
};

export function normalizeCatalogText(value: string): string {
  return value
    .toLocaleLowerCase("en-IN")
    .replace(/[\u00ae™]/g, " ")
    .replace(/[\-_/,.()]+/g, " ")
    .replace(/(\d)\s*(mg|mcg|g|ml|milligrams?|micrograms?|grams?|millilit(?:re|er)s?)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => CONTROLLED_ABBREVIATIONS[token] ?? UNIT_ALIASES[token] ?? token)
    .join(" ");
}

export function tokenizeCatalogText(value: string): string[] {
  return normalizeCatalogText(value).split(" ").filter(Boolean);
}

export function clinicalSignature(value: string): ClinicalSignature {
  const normalized = normalizeCatalogText(value);
  const strengths = Array.from(normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml)\b/g))
    .map((match) => `${match[1]} ${match[2]}`);
  const tokens = tokenizeCatalogText(value);
  return {
    strengths: Array.from(new Set(strengths)),
    dosageForms: tokens.filter((token) => DOSAGE_FORMS.has(token)),
    releaseMarkers: tokens.filter((token) => MODIFIED_RELEASE_MARKERS.has(token)),
  };
}

export function clinicalConflicts(left: string, right: string): string[] {
  const source = clinicalSignature(left);
  const candidate = clinicalSignature(right);
  const conflicts: string[] = [];

  if (source.strengths.length > 0 && candidate.strengths.length > 0 && source.strengths.join("|") !== candidate.strengths.join("|")) {
    conflicts.push("Strength mismatch");
  }
  if (source.dosageForms.length > 0 && candidate.dosageForms.length > 0 && source.dosageForms.join("|") !== candidate.dosageForms.join("|")) {
    conflicts.push("Dosage-form mismatch");
  }
  if (source.releaseMarkers.length > 0 && candidate.releaseMarkers.length > 0 && source.releaseMarkers.join("|") !== candidate.releaseMarkers.join("|")) {
    conflicts.push("Modified-release formulation mismatch");
  }
  return conflicts;
}
