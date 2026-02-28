const DEFAULT_MAX_CHUNK_SIZE = 65536; // 64 KiB

export function chunkByParagraph(text: string, maxSize = DEFAULT_MAX_CHUNK_SIZE): string[] {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n');

  if (normalized.length === 0) {
    return [''];
  }

  // Split on paragraph boundaries (\n\n), keeping separators attached to preceding chunk
  const rawParts = normalized.split(/(\n\n)/);
  const chunks: string[] = [];
  let current = '';

  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    if (part === '\n\n') {
      // Attach separator to current chunk
      current += part;
    } else {
      if (current !== '') {
        chunks.push(current);
      }
      current = part;
    }
  }
  if (current !== '') {
    chunks.push(current);
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
  const normalized = text.replace(/\r\n/g, '\n');

  if (normalized.length === 0) {
    return [''];
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
      while (adjusted > offset && (bytes[adjusted] & 0xc0) === 0x80) {
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
      while (end > offset && (bytes[end] & 0xc0) === 0x80) {
        end--;
      }
    }
    parts.push(decoder.decode(bytes.slice(offset, end)));
    offset = end;
  }
  return parts;
}
