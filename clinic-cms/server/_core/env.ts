export const ENV = {
  appId: process.env.VITE_APP_ID ?? "clinic-cms",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /** S3-compatible object storage (AWS, MinIO, Cloudflare R2). */
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3AccessKeyId:
    process.env.AWS_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey:
    process.env.AWS_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  /** OpenAI-compatible chat/transcription API (optional). */
  aiApiUrl: process.env.AI_API_URL ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  /** Google Maps JavaScript / REST (optional). */
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  googleDriveRedirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI ?? "",
  googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "",
  archiveCronEnabled: process.env.ARCHIVE_CRON_ENABLED === "true",
  archiveIntervalWeeks: Math.max(
    1,
    parseInt(process.env.ARCHIVE_INTERVAL_WEEKS ?? "6", 10) || 6,
  ),
};
