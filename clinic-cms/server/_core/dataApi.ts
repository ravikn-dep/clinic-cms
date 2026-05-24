/**
 * Legacy Manus data API — not available in self-hosted deployments.
 */
export type DataApiCallOptions = {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
  formData?: Record<string, unknown>;
};

export async function callDataApi(
  _apiId: string,
  _options: DataApiCallOptions = {},
): Promise<unknown> {
  throw new Error(
    "External data API is not configured. This feature was removed for independent hosting.",
  );
}
