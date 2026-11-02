import type { NonNullableUserContext } from "../../lib/types";

export const DRIVE_NEEDS_CONSENT = "DRIVE_NEEDS_CONSENT";
export const DRIVE_NO_ACCOUNT = "DRIVE_NO_ACCOUNT";

/**
 * Returns a valid Google access token for the signed-in user's linked
 * Google account, refreshing it with the stored refresh token when needed.
 * Throws an Error whose message starts with DRIVE_NEEDS_CONSENT or
 * DRIVE_NO_ACCOUNT when the user has to (re)connect Google with the
 * Drive scope granted.
 */
export async function getGoogleAccessToken(
  ctx: NonNullableUserContext,
): Promise<string> {
  const account = await ctx.prisma.account.findFirst({
    where: { userId: ctx.session.user.id, provider: "google" },
  });
  if (!account) {
    throw new Error(
      `${DRIVE_NO_ACCOUNT}: No Google account is linked to this user.`,
    );
  }
  if (!account.scope || !account.scope.includes("drive")) {
    throw new Error(
      `${DRIVE_NEEDS_CONSENT}: Google Drive access has not been granted yet. Sign in with Google again to grant it.`,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  if (account.access_token && account.expires_at && account.expires_at > now + 60) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error(
      `${DRIVE_NEEDS_CONSENT}: The Google session has expired. Sign in with Google again to reconnect Drive.`,
    );
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  if (!resp.ok) {
    throw new Error(
      `${DRIVE_NEEDS_CONSENT}: Could not refresh the Google session (HTTP ${resp.status}). Sign in with Google again to reconnect Drive.`,
    );
  }
  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  await ctx.prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: now + data.expires_in,
    },
  });
  return data.access_token;
}

export interface DriveFile {
  id: string;
  name: string;
  sizeBytes: number;
  modifiedTime: string;
}

export async function listDriveApkgFiles(token: string): Promise<DriveFile[]> {
  const q = encodeURIComponent("name contains '.apkg' and trashed = false");
  const fields = encodeURIComponent("files(id,name,size,modifiedTime)");
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(
      `${DRIVE_NEEDS_CONSENT}: Google Drive access was refused. Sign in with Google again to reconnect Drive.`,
    );
  }
  if (!resp.ok) {
    throw new Error(`Google Drive list failed (HTTP ${resp.status}).`);
  }
  const data = (await resp.json()) as {
    files?: { id: string; name: string; size?: string; modifiedTime: string }[];
  };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    sizeBytes: f.size ? Number(f.size) : 0,
    modifiedTime: f.modifiedTime,
  }));
}

export async function downloadDriveFile(
  token: string,
  fileId: string,
): Promise<Buffer> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(
      `${DRIVE_NEEDS_CONSENT}: Google Drive access was refused. Sign in with Google again to reconnect Drive.`,
    );
  }
  if (!resp.ok) {
    throw new Error(`Google Drive download failed (HTTP ${resp.status}).`);
  }
  return Buffer.from(await resp.arrayBuffer());
}
