export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

export type UploadInitMeta = {
  lectureTitle: string;
  subject?: string;
  chapter?: string;
  teacherId?: string;
  idempotencyKey?: string;
};

function describeUnknownError(e: unknown): string {
  if (e instanceof Error) return e.message;
  // Some environments reject fetch() with Event/ProgressEvent.
  if (typeof Event !== "undefined" && e instanceof Event) {
    return `${e.constructor?.name || "Event"}(${e.type || "unknown"})`;
  }
  try {
    return typeof e === "string" ? e : JSON.stringify(e);
  } catch {
    return String(e);
  }
}

async function fetchOrExplain(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, credentials: "include" });
  } catch (e) {
    const msg = describeUnknownError(e);
    const hint =
      msg === "Failed to fetch"
        ? " (Usually: dev server crashed or stopped — check the terminal for “Array buffer allocation failed” / OOM; use npm run dev:mem. Or wrong origin: use http://localhost:3000 and keep the tab URL consistent.)"
        : "";
    throw new Error(`Network error calling ${url}: ${msg}${hint}`);
  }
}

export async function uploadVideoInChunks(
  file: File,
  meta: UploadInitMeta,
  onProgress: (percent: number) => void,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<string> {
  const initRes = await fetchOrExplain("/api/upload/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      teacherId: meta.teacherId,
      fileName: file.name,
      mimeType: file.type || "video/mp4",
      fileSize: file.size,
      lectureTitle: meta.lectureTitle,
      subject: meta.subject,
      chapter: meta.chapter,
      idempotencyKey:
        meta.idempotencyKey ??
        `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    }),
  });

  const initText = await initRes.text();
  let initJson = {} as {
    jobId?: string;
    error?: string;
    reused?: boolean;
  };
  try {
    initJson = JSON.parse(initText) as typeof initJson;
  } catch {
    /* non-JSON */
  }

  if (!initRes.ok) {
    throw new Error(initJson.error || initText || "Upload init failed");
  }
  if (!initJson.jobId) {
    throw new Error("Upload init returned no jobId");
  }

  const jobId = initJson.jobId;
  let start = 0;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size) - 1;
    const chunk = file.slice(start, end + 1);
    const res = await fetchOrExplain(`/api/upload/${jobId}/chunk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": `bytes ${start}-${end}/${file.size}`,
      },
      body: chunk,
    });

    const chunkText = await res.text();
    let json = {} as {
      complete?: boolean;
      progressPercent?: number;
      error?: string;
    };
    try {
      json = JSON.parse(chunkText) as typeof json;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      throw new Error(json.error || chunkText || "Chunk upload failed");
    }

    if (typeof json.progressPercent === "number") {
      onProgress(json.progressPercent);
    }

    if (json.complete) {
      onProgress(90);
      return jobId;
    }

    start = end + 1;
  }

  throw new Error("Upload ended without completion response from Drive");
}
