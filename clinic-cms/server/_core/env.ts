export const ENV = {
  appId: process.env.VITE_APP_ID ?? "clinic-cms-local",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  googleDriveRedirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI ?? "",
  googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "",
  archiveCronEnabled: process.env.ARCHIVE_CRON_ENABLED === "true",
  archiveIntervalWeeks: Math.max(
    1,
    parseInt(process.env.ARCHIVE_INTERVAL_WEEKS ?? "6", 10) || 6
  ),
};
