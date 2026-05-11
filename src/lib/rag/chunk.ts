/** Split plain text into overlapping chunks for RAG indexing. */
export function chunkText(text: string, maxLen = 1600, overlap = 250): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + maxLen, normalized.length);
    let slice = normalized.slice(start, end);
    if (end < normalized.length) {
      const lastSpace = slice.lastIndexOf(" ");
      if (lastSpace > maxLen * 0.45) {
        slice = slice.slice(0, lastSpace);
      }
    }
    const t = slice.trim();
    if (t.length > 40) {
      chunks.push(t);
    }
    if (end >= normalized.length) {
      break;
    }
    const step = Math.max(1, slice.length - overlap);
    const next = start + step;
    start = next <= start ? start + slice.length : next;
  }
  return chunks;
}
