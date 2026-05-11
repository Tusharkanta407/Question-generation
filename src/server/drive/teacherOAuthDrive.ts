import { getGoogleOAuthWebCredentials } from "@/src/lib/googleOAuthWebCredentials";

/** Avoid static `googleapis` import here — it balloons the `/api/upload/init` dev bundle and can OOM Node on Windows. */
export async function getTeacherAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getGoogleOAuthWebCredentials();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok) {
    const detail = data.error_description || data.error || JSON.stringify(data);
    throw new Error(`Google token refresh failed (${res.status}): ${detail}`);
  }
  if (!data.access_token) {
    throw new Error("Google OAuth refresh did not return an access token");
  }
  return data.access_token;
}

export async function getTeacherDrive(refreshToken: string) {
  const { google } = await import("googleapis");
  const { clientId, clientSecret } = getGoogleOAuthWebCredentials();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}
