export type ConsultantAssetUploadResult = {
  success?: boolean;
  asset?: {
    url?: string | null;
  } | null;
};

export function requireConsultantAssetUrl(result: unknown): string {
  if (!result || typeof result !== "object") {
    throw new Error("Upload completed without asset metadata. Please retry.");
  }
  const candidate = result as ConsultantAssetUploadResult;
  if (candidate.success !== true || typeof candidate.asset?.url !== "string" || candidate.asset.url.length === 0) {
    throw new Error("Upload completed without asset metadata. Please retry.");
  }
  return candidate.asset.url;
}
