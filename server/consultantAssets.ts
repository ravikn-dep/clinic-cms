import { storagePut } from "./storage";

export const MAX_CONSULTANT_IMAGE_BYTES = 1_500_000;

export type ConsultantAssetType = "logo" | "signature";

type ValidatedImage = {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
};

function hasPngSignature(bytes: Buffer) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function hasJpegSignature(bytes: Buffer) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Accepts only a compact image data URL supplied by the authenticated UI.
 * Both declared MIME and file signature are verified server-side; the client
 * filename is never read or used as a storage key.
 */
export function validateConsultantImageDataUrl(dataUrl: string): ValidatedImage {
  const match = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error("Consultant image must be a PNG or JPEG data URL");

  const declaredMime = match[1].toLowerCase() as "image/png" | "image/jpeg";
  const encoded = match[2].replace(/\s/g, "");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("Consultant image data is invalid");
  }

  if (bytes.length === 0) throw new Error("Consultant image cannot be empty");
  if (bytes.length > MAX_CONSULTANT_IMAGE_BYTES) throw new Error("Consultant image exceeds the 1.5 MB limit");

  const isPng = hasPngSignature(bytes);
  const isJpeg = hasJpegSignature(bytes);
  if (!isPng && !isJpeg) throw new Error("Consultant image content is not a valid PNG or JPEG");
  if ((declaredMime === "image/png" && !isPng) || (declaredMime === "image/jpeg" && !isJpeg)) {
    throw new Error("Consultant image MIME type does not match its content");
  }

  return {
    bytes,
    mimeType: declaredMime,
    extension: isPng ? "png" : "jpg",
  };
}

export async function storeConsultantImage(input: {
  consultantId: number;
  assetType: ConsultantAssetType;
  dataUrl: string;
}) {
  const image = validateConsultantImageDataUrl(input.dataUrl);
  const keyPrefix = `consultants/${input.consultantId}/${input.assetType}`;
  const uploaded = await storagePut(`${keyPrefix}.${image.extension}`, image.bytes, image.mimeType);
  return { key: uploaded.key, mimeType: image.mimeType, sizeBytes: image.bytes.length };
}
