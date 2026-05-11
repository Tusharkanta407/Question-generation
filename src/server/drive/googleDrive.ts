import fs from "node:fs";

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function resolveServiceAccount() {
  const filePath = getEnv("GOOGLE_SERVICE_ACCOUNT_FILE");
  if (filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as {
      client_email: string;
      private_key: string;
    };
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

let cachedDriveClient: any | null = null;

export async function getDriveClient() {
  if (cachedDriveClient) {
    return cachedDriveClient;
  }

  const { google } = await import("googleapis");
  const serviceAccount = resolveServiceAccount();
  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  cachedDriveClient = google.drive({ version: "v3", auth });
  return cachedDriveClient;
}

export function getDriveFolderId(): string {
  const folderId = getEnv("GOOGLE_DRIVE_FOLDER_ID");
  if (!folderId) {
    throw new Error("Missing required env var: GOOGLE_DRIVE_FOLDER_ID");
  }
  return folderId;
}
