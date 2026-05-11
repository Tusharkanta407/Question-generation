import fs from "node:fs";

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function resolveServiceAccount() {
  const filePath = getEnv("GOOGLE_SERVICE_ACCOUNT_FILE");
  if (filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as { client_email: string; private_key: string };
  }

  const clientEmail = getEnv("GOOGLE_CLIENT_EMAIL");
  const privateKey = getEnv("GOOGLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY."
    );
  }
  return { client_email: clientEmail, private_key: privateKey };
}

export async function getGoogleAccessToken(): Promise<string> {
  const { google } = await import("googleapis");
  const sa = resolveServiceAccount();
  const jwt = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const res = await jwt.getAccessToken();
  const token = typeof res === "string" ? res : res?.token;
  if (!token) {
    throw new Error("Failed to obtain Google access token");
  }
  return token;
}
