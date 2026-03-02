const DEFAULT_MAX_CHUNK_SIZE = 65536; // 64 KiB

export function chunkByParagraph(text: string, maxSize = DEFAULT_MAX_CHUNK_SIZE): string[] {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, "\n");

  if (normalized.length === 0) {
    return [""];
  }

  // Split on runs of 2+ newlines, attaching each boundary to the preceding chunk
  const chunks: string[] = [];
  const boundary = /\n{2,}/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(normalized)) !== null) {
    // Content up to and including the boundary goes to the preceding chunk
    const chunkEnd = match.index + match[0].length;
    chunks.push(normalized.slice(lastEnd, chunkEnd));
    lastEnd = chunkEnd;
  }

  // Remaining content after the last boundary (or the entire string if no boundary)
  if (lastEnd < normalized.length) {
    chunks.push(normalized.slice(lastEnd));
  } else if (chunks.length === 0) {
    // No boundaries found and nothing remaining — shouldn't happen since we checked length > 0
    chunks.push(normalized);
  }

  // Split any oversized chunks at byte boundaries
  const result: string[] = [];
  for (const chunk of chunks) {
    if (byteLength(chunk) <= maxSize) {
      result.push(chunk);
    } else {
      result.push(...splitAtByteLimit(chunk, maxSize));
    }
  }

  return result;
}

export function chunkByFixedSize(text: string, size: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n");

  if (normalized.length === 0) {
    return [""];
  }

  const bytes = new TextEncoder().encode(normalized);
  if (bytes.length <= size) {
    return [normalized];
  }

  const chunks: string[] = [];
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset < bytes.length) {
    const end = Math.min(offset + size, bytes.length);
    // Avoid splitting in the middle of a multi-byte UTF-8 character
    let adjusted = end;
    if (adjusted < bytes.length) {
      while (adjusted > offset && (bytes[adjusted]! & 0xc0) === 0x80) {
        adjusted--;
      }
    }
    chunks.push(decoder.decode(bytes.slice(offset, adjusted)));
    offset = adjusted;
  }

  return chunks;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function splitAtByteLimit(text: string, maxSize: number): string[] {
  const bytes = new TextEncoder().encode(text);
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    let end = Math.min(offset + maxSize, bytes.length);
    // Avoid splitting multi-byte characters
    if (end < bytes.length) {
      while (end > offset && (bytes[end]! & 0xc0) === 0x80) {
        end--;
      }
    }
    parts.push(decoder.decode(bytes.slice(offset, end)));
    offset = end;
  }
  return parts;
}
