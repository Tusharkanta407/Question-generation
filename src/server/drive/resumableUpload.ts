import { getDriveFolderId } from "@/src/server/drive/googleDrive";

/** Start a resumable upload using a **user** OAuth access token (teacher's Drive). */
export async function startDriveResumableSession(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  accessToken: string;
}): Promise<string> {
  const token = input.accessToken;
  const folderId = getDriveFolderId();
  const url = new URL("https://www.googleapis.com/upload/drive/v3/files");
  url.searchParams.set("uploadType", "resumable");
  // Required when parent folder is in a Shared drive; safe to send otherwise.
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType,
      "X-Upload-Content-Length": String(input.fileSize),
    },
    body: JSON.stringify({
      name: input.fileName,
      parents: [folderId],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive resumable init failed: ${res.status} ${text}`);
  }

  const location = res.headers.get("Location");
  if (!location) {
    throw new Error("Drive resumable init missing Location header");
  }
  return location;
}

export async function putDriveResumableChunk(input: {
  sessionUrl: string;
  chunk: Buffer;
  start: number;
  end: number;
  total: number;
  mimeType: string;
}): Promise<{ complete: boolean; fileId?: string }> {
  const res = await fetch(input.sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(input.chunk.length),
      "Content-Range": `bytes ${input.start}-${input.end}/${input.total}`,
      "Content-Type": input.mimeType,
    },
    // Node `Buffer` is valid for `fetch` body; DOM `BodyInit` typings omit it.
    body: input.chunk as unknown as BodyInit,
  });

  if (res.status === 308) {
    return { complete: false };
  }

  if (res.status === 200 || res.status === 201) {
    const data = (await res.json()) as { id?: string };
    if (!data.id) {
      throw new Error("Drive upload completed but response had no file id");
    }
    return { complete: true, fileId: data.id };
  }

  const text = await res.text();
  throw new Error(`Drive chunk upload failed: ${res.status} ${text}`);
}
