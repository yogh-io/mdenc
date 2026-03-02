import { cleanFilter, smudgeFilter } from "./filter.js";
import { resolvePassword } from "./password.js";
import { findGitRoot } from "./utils.js";

// --- Pkt-line protocol ---

const FLUSH = Buffer.from("0000", "ascii");
const MAX_PKT_DATA = 65516; // max payload per pkt-line (65520 - 4)

function writePktLine(data: string): void {
  const payload = Buffer.from(data, "utf-8");
  const len = (payload.length + 4).toString(16).padStart(4, "0");
  process.stdout.write(len, "ascii");
  process.stdout.write(payload);
}

function writeFlush(): void {
  process.stdout.write(FLUSH);
}

function writeBinaryPktLines(data: Buffer): void {
  let offset = 0;
  while (offset < data.length) {
    const chunk = data.subarray(offset, offset + MAX_PKT_DATA);
    const len = (chunk.length + 4).toString(16).padStart(4, "0");
    process.stdout.write(len, "ascii");
    process.stdout.write(chunk);
    offset += chunk.length;
  }
}

class PktLineReader {
  private buf = Buffer.alloc(0);
  // biome-ignore lint/suspicious/noConfusingVoidType: standard Promise resolve signature
  private resolveWait: ((value: void) => void) | null = null;
  private ended = false;

  constructor(stream: NodeJS.ReadableStream) {
    stream.on("data", (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      if (this.resolveWait) {
        const r = this.resolveWait;
        this.resolveWait = null;
        r();
      }
    });
    stream.on("end", () => {
      this.ended = true;
      if (this.resolveWait) {
        const r = this.resolveWait;
        this.resolveWait = null;
        r();
      }
    });
    stream.resume();
  }

  private async waitForData(): Promise<void> {
    if (this.buf.length > 0 || this.ended) return;
    return new Promise((resolve) => {
      this.resolveWait = resolve;
    });
  }

  private async readExact(n: number): Promise<Buffer | null> {
    while (this.buf.length < n) {
      if (this.ended) return null;
      await this.waitForData();
    }
    const result = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return result;
  }

  /** Read one pkt-line. Returns string for data, null for flush, undefined for EOF. */
  async readPacket(): Promise<string | null | undefined> {
    const lenBuf = await this.readExact(4);
    if (!lenBuf) return undefined; // EOF

    const lenStr = lenBuf.toString("ascii");
    const len = parseInt(lenStr, 16);

    if (len === 0) return null; // flush packet

    if (len <= 4) throw new Error(`Invalid pkt-line length: ${len}`);

    const payload = await this.readExact(len - 4);
    if (!payload) throw new Error("Unexpected EOF in pkt-line payload");
    return payload.toString("utf-8");
  }

  /** Read lines until flush. Returns array of strings (newlines stripped). */
  async readUntilFlush(): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const pkt = await this.readPacket();
      if (pkt === null || pkt === undefined) break;
      lines.push(pkt.replace(/\n$/, ""));
    }
    return lines;
  }

  /** Read binary content until flush. Returns concatenated buffer. */
  async readContentUntilFlush(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    while (true) {
      const lenBuf = await this.readExact(4);
      if (!lenBuf) break; // EOF

      const len = parseInt(lenBuf.toString("ascii"), 16);
      if (len === 0) break; // flush
      if (len <= 4) throw new Error(`Invalid pkt-line length: ${len}`);

      const payload = await this.readExact(len - 4);
      if (!payload) throw new Error("Unexpected EOF in pkt-line content");
      chunks.push(payload);
    }
    return Buffer.concat(chunks);
  }
}

// --- Protocol handshake + command loop ---

export async function filterProcessMain(): Promise<void> {
  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);

  const reader = new PktLineReader(process.stdin);

  // --- Handshake ---
  const welcome = await reader.readUntilFlush();
  if (!welcome.includes("git-filter-client") || !welcome.includes("version=2")) {
    process.stderr.write("mdenc: invalid filter protocol handshake\n");
    process.exit(1);
  }

  writePktLine("git-filter-server\n");
  writePktLine("version=2\n");
  writeFlush();

  // Read capabilities
  const caps = await reader.readUntilFlush();
  // Respond with the capabilities we support
  if (caps.includes("capability=clean")) writePktLine("capability=clean\n");
  if (caps.includes("capability=smudge")) writePktLine("capability=smudge\n");
  writeFlush();

  // --- Command loop ---
  while (true) {
    const commandLines = await reader.readUntilFlush();
    if (commandLines.length === 0) break; // EOF / no more commands

    let cmd = "";
    let pathname = "";
    for (const line of commandLines) {
      if (line.startsWith("command=")) cmd = line.slice("command=".length);
      if (line.startsWith("pathname=")) pathname = line.slice("pathname=".length);
    }

    // Read file content
    const content = await reader.readContentUntilFlush();
    const contentStr = content.toString("utf-8");

    try {
      let result: string;

      if (cmd === "clean") {
        if (!password) {
          writePktLine("status=error\n");
          writeFlush();
          writeFlush();
          continue;
        }
        result = await cleanFilter(pathname, contentStr, password, repoRoot);
      } else if (cmd === "smudge") {
        result = await smudgeFilter(contentStr, password);
      } else {
        process.stderr.write(`mdenc: unknown filter command: ${cmd}\n`);
        writePktLine("status=error\n");
        writeFlush();
        writeFlush();
        continue;
      }

      const resultBuf = Buffer.from(result, "utf-8");
      writePktLine("status=success\n");
      writeFlush();
      writeBinaryPktLines(resultBuf);
      writeFlush();
    } catch (err) {
      process.stderr.write(
        `mdenc: filter error for ${pathname}: ${err instanceof Error ? err.message : err}\n`,
      );
      writePktLine("status=error\n");
      writeFlush();
      writeFlush();
    }
  }
}
