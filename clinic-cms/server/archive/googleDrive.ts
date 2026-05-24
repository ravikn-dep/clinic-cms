import fs from "fs";
import { google } from "googleapis";
import { ENV } from "../_core/env";
import {
  getGoogleDriveTokens,
  saveGoogleDriveTokens,
  updateGoogleDriveAccessToken,
} from "./db";
import { decryptToken } from "./tokenCrypto";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const GOOGLE_DRIVE_ROW_ID = "default";

function getOAuthClient() {
  if (!ENV.googleDriveClientId || !ENV.googleDriveClientSecret) {
    throw new Error(
      "Google Drive OAuth is not configured. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET."
    );
  }

  return new google.auth.OAuth2(
    ENV.googleDriveClientId,
    ENV.googleDriveClientSecret,
    ENV.googleDriveRedirectUri || undefined
  );
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(ENV.googleDriveClientId && ENV.googleDriveClientSecret);
}

export function getGoogleAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
    state,
  });
}

export async function exchangeOAuthCode(code: string): Promise<{
  connectedEmail: string | null;
}> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke prior access and reconnect with consent."
    );
  }

  client.setCredentials(tokens);

  let connectedEmail: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const profile = await oauth2.userinfo.get();
    connectedEmail = profile.data.email ?? null;
  } catch {
  }

  await saveGoogleDriveTokens({
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    connectedEmail,
    driveFolderId: ENV.googleDriveFolderId || null,
  });

  return { connectedEmail };
}

async function getAuthorizedClient() {
  const row = await getGoogleDriveTokens();
  if (!row) {
    throw new Error("Google Drive is not connected. Connect from Archive settings first.");
  }

  const client = getOAuthClient();
  const refreshToken = decryptToken(row.refreshTokenEnc);
  const accessToken = row.accessTokenEnc ? decryptToken(row.accessTokenEnc) : undefined;

  client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
    expiry_date: row.expiryDate ? row.expiryDate.getTime() : undefined,
  });

  client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await updateGoogleDriveAccessToken({
        accessToken: tokens.access_token,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      });
    }
    if (tokens.refresh_token) {
      await saveGoogleDriveTokens({
        accessToken: tokens.access_token ?? accessToken ?? "",
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : row.expiryDate,
        connectedEmail: row.connectedEmail,
        driveFolderId: row.driveFolderId,
      });
    }
  });

  return { client, row };
}

export async function getGoogleDriveConnectionStatus(): Promise<{
  connected: boolean;
  connectedEmail: string | null;
  driveFolderId: string | null;
}> {
  const row = await getGoogleDriveTokens();
  if (!row) {
    return { connected: false, connectedEmail: null, driveFolderId: null };
  }

  return {
    connected: true,
    connectedEmail: row.connectedEmail,
    driveFolderId: (row.driveFolderId ?? ENV.googleDriveFolderId) || null,
  };
}

async function ensureArchiveFolder(
  drive: ReturnType<typeof google.drive>,
  folderName: string,
  parentFolderId?: string | null
): Promise<string> {
  const queryParts = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${folderName.replace(/'/g, "\\'")}'`,
    "trashed=false",
  ];
  if (parentFolderId) {
    queryParts.push(`'${parentFolderId}' in parents`);
  }

  const existing = await drive.files.list({
    q: queryParts.join(" and "),
    fields: "files(id,name)",
    pageSize: 1,
  });

  const found = existing.data.files?.[0]?.id;
  if (found) return found;

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentFolderId ? [parentFolderId] : undefined,
    },
    fields: "id",
  });

  if (!created.data.id) {
    throw new Error("Failed to create Google Drive archive folder");
  }

  return created.data.id;
}

export async function uploadArchiveToDrive(
  zipPath: string,
  archiveLabel: string
): Promise<{ driveFileId: string; driveFolderId: string }> {
  const { client, row } = await getAuthorizedClient();
  const drive = google.drive({ version: "v3", auth: client });

  const parentFolderId = (row.driveFolderId ?? ENV.googleDriveFolderId) || undefined;
  const folderId = await ensureArchiveFolder(drive, archiveLabel, parentFolderId);

  const upload = await drive.files.create({
    requestBody: {
      name: `${archiveLabel}.zip`,
      parents: [folderId],
    },
    media: {
      mimeType: "application/zip",
      body: fs.createReadStream(zipPath),
    },
    fields: "id",
  });

  if (!upload.data.id) {
    throw new Error("Google Drive upload did not return a file id");
  }

  return { driveFileId: upload.data.id, driveFolderId: folderId };
}

/** Used in tests / admin disconnect. */
export async function disconnectGoogleDrive(): Promise<void> {
  const { deleteGoogleDriveTokens } = await import("./db");
  await deleteGoogleDriveTokens();
}

export const GOOGLE_DRIVE_CONFIG_ID = GOOGLE_DRIVE_ROW_ID;
