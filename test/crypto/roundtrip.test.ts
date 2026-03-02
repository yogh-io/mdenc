import { describe, expect, it } from "bun:test";
import { decrypt, encrypt } from "../../src/crypto/encrypt.js";
import { ChunkingStrategy } from "../../src/crypto/types.js";
import { FAST_SCRYPT, TEST_PASSWORD } from "../helpers.js";

const opts = { scrypt: FAST_SCRYPT };

describe("roundtrip property tests", () => {
  it("empty string encrypts and decrypts", async () => {
    const encrypted = await encrypt("", TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe("");
  });

  it("single character", async () => {
    const encrypted = await encrypt("a", TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe("a");
  });

  it("only whitespace", async () => {
    const text = "   \t\n\n  \n";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("unicode: CJK characters", async () => {
    const text = "日本語のテスト\n\nこれは二番目の段落です";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("unicode: emoji", async () => {
    const text = "Hello 🌍🌎🌏\n\n🎉 Party time! 🎊";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("unicode: combining characters", async () => {
    const text = "e\u0301 (e + combining acute)\n\nCaf\u00e9 vs Cafe\u0301";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("unicode: right-to-left text", async () => {
    const text = "مرحبا بالعالم\n\nשלום עולם";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("BOM prefix is stripped during roundtrip", async () => {
    const text = "\uFEFFHello World\n\nSecond paragraph";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    // BOM is stripped by NFKC normalization in the chunker
    expect(decrypted).toBe("Hello World\n\nSecond paragraph");
  });

  it("many short paragraphs", async () => {
    const paragraphs = Array.from({ length: 100 }, (_, i) => `Paragraph ${i}`);
    const text = paragraphs.join("\n\n");
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("single large paragraph (no splits)", async () => {
    const text = "x".repeat(100_000);
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("fixed-size chunking roundtrip", async () => {
    const text = "Hello World\n\nSecond paragraph\n\nThird one here";
    const encrypted = await encrypt(text, TEST_PASSWORD, {
      ...opts,
      chunking: ChunkingStrategy.FixedSize,
      fixedChunkSize: 16,
    });
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("password with special characters", async () => {
    const password = "p@$$w0rd!#%^&*()_+-=[]{}|;':\",./<>?`~";
    const text = "Secret content\n\nMore secrets";
    const encrypted = await encrypt(text, password, opts);
    const decrypted = await decrypt(encrypted, password);
    expect(decrypted).toBe(text);
  });

  it("unicode password (NFKC normalized)", async () => {
    const password = "café résumé naïve";
    const text = "Protected text";
    const encrypted = await encrypt(text, password, opts);
    const decrypted = await decrypt(encrypted, password);
    expect(decrypted).toBe(text);
  });

  it("content with mdenc-like header line", async () => {
    const text = "mdenc:v1 salt_b64=fake\n\nReal content after fake header";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("content with base64-like strings", async () => {
    const text = "SGVsbG8gV29ybGQ=\n\naHR0cHM6Ly9leGFtcGxlLmNvbQ==";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("trailing newlines preserved exactly", async () => {
    const text = "Content\n\nMore content\n\n";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(text);
  });

  it("Windows CRLF newlines are normalized to LF", async () => {
    const text = "Line one\r\n\r\nLine two\r\n\r\nLine three";
    const encrypted = await encrypt(text, TEST_PASSWORD, opts);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    // CRLF is normalized to LF by the chunker
    expect(decrypted).toBe("Line one\n\nLine two\n\nLine three");
  });
});
