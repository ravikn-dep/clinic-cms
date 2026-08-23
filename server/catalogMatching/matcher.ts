import { clinicalConflicts, normalizeCatalogText, tokenizeCatalogText } from "./normalize";
import type { CatalogAliasRecord, CatalogMatchInput, CatalogMatchSuggestion, CatalogRecord } from "./types";

type CandidateScore = CatalogMatchSuggestion & { rank: number };

function tokenOverlap(left: string, right: string): number {
  const source = new Set(tokenizeCatalogText(left));
  const candidate = new Set(tokenizeCatalogText(right));
  const shared = Array.from(source).filter((token) => candidate.has(token));
  return shared.length;
}

function candidateFromName(
  input: CatalogMatchInput,
  item: CatalogRecord,
  candidateText: string,
  source: CatalogMatchSuggestion["source"],
): CandidateScore | null {
  const normalizedInput = normalizeCatalogText(input.lineDescription);
  const normalizedCandidate = normalizeCatalogText(candidateText);
  const conflicts = clinicalConflicts(input.lineDescription, candidateText);
  const reasons: string[] = [];
  let matchLevel: CatalogMatchSuggestion["matchLevel"] | null = null;
  let rank = 0;

  if (normalizedInput === normalizedCandidate) {
    matchLevel = "EXACT";
    rank = 300;
    reasons.push(source === "CANONICAL_NAME" ? "Normalized canonical-name match" : source === "VENDOR_ALIAS" ? "Normalized vendor alias match" : "Normalized active alias match");
  } else {
    const overlap = tokenOverlap(input.lineDescription, candidateText);
    const sourceTokens = tokenizeCatalogText(input.lineDescription).length;
    const candidateTokens = tokenizeCatalogText(candidateText).length;
    if (overlap >= 2 && overlap >= Math.min(sourceTokens, candidateTokens) - 1) {
      matchLevel = conflicts.length > 0 ? "POSSIBLE" : "STRONG";
      rank = conflicts.length > 0 ? 80 : 200;
      reasons.push("Strong token match");
    } else if (overlap >= 1 && (sourceTokens > 1 || candidateTokens > 1)) {
      matchLevel = "POSSIBLE";
      rank = 50;
      reasons.push("Partial token overlap");
    }
  }

  if (!matchLevel) return null;
  if (input.hsnCode && item.hsnCode) {
    if (input.hsnCode.trim() === item.hsnCode.trim()) {
      reasons.push("HSN agreement");
      rank += 10;
    } else {
      conflicts.push("HSN mismatch");
      matchLevel = "POSSIBLE";
      rank = Math.min(rank, 90);
    }
  }

  return {
    catalogItemId: item.catalogItemId,
    canonicalName: item.canonicalName,
    matchLevel,
    source,
    reasons,
    conflicts,
    rank,
  };
}

/** Deterministic, provider-neutral suggestion engine. It never writes catalog, PO, inventory, or receipt data. */
export function suggestCatalogMatches(
  input: CatalogMatchInput,
  catalogItems: CatalogRecord[],
  aliases: CatalogAliasRecord[],
): CatalogMatchSuggestion[] {
  const byId = new Map(catalogItems.map((item) => [item.catalogItemId, item]));
  const candidates = new Map<string, CandidateScore>();
  const addCandidate = (candidate: CandidateScore | null) => {
    if (!candidate) return;
    const existing = candidates.get(candidate.catalogItemId);
    if (!existing || candidate.rank > existing.rank) candidates.set(candidate.catalogItemId, candidate);
  };

  for (const item of catalogItems) {
    addCandidate(candidateFromName(input, item, item.canonicalName, "CANONICAL_NAME"));
  }
  for (const alias of aliases) {
    const item = byId.get(alias.catalogItemId);
    if (!item) continue;
    const source = input.vendorId && alias.vendorId === input.vendorId ? "VENDOR_ALIAS" : alias.vendorId ? null : "ALIAS";
    if (!source) continue;
    addCandidate(candidateFromName(input, item, alias.aliasText, source));
  }

  const ranked = Array.from(candidates.values()).sort((left, right) => right.rank - left.rank || left.canonicalName.localeCompare(right.canonicalName));
  const topRank = ranked[0]?.rank;
  if (topRank !== undefined && ranked.filter((candidate) => candidate.rank === topRank).length > 1) {
    for (const candidate of ranked.filter((entry) => entry.rank === topRank)) {
      candidate.matchLevel = "POSSIBLE";
      candidate.conflicts = [...candidate.conflicts, "Multiple equally ranked candidates require selection"];
    }
  }

  return ranked.slice(0, 5).map(({ rank: _rank, ...candidate }) => candidate);
}
