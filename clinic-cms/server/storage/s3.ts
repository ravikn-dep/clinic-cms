import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "../_core/env";

export const STORAGE_PUBLIC_PATH = "/files";

let client: S3Client | null = null;

export function isS3Configured(): boolean {
  return Boolean(ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey);
}

function getClient(): S3Client {
  if (!isS3Configured()) {
    throw new Error(
      "S3 storage is not configured. Set S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY (optional S3_REGION, S3_ENDPOINT for MinIO).",
    );
  }
  if (!client) {
    client = new S3Client({
      region: ENV.s3Region,
      credentials: {
        accessKeyId: ENV.s3AccessKeyId,
        secretAccessKey: ENV.s3SecretAccessKey,
      },
      ...(ENV.s3Endpoint
        ? { endpoint: ENV.s3Endpoint, forcePathStyle: true }
        : {}),
    });
  }
  return client;
}

export async function s3PutObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  const data =
    typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  await getClient().send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    }),
  );
}

export async function s3GetPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}

export function publicStorageUrl(key: string): string {
  return `${STORAGE_PUBLIC_PATH}/${key}`;
}
