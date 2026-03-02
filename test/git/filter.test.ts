import { afterEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { encrypt } from "../../src/crypto/encrypt.js";
import { cleanFilter, smudgeFilter } from "../../src/git/filter.js";
import { FAST_SCRYPT, SIMPLE_MARKDOWN, TEST_PASSWORD, WRONG_PASSWORD } from "../helpers.js";
import { createTempGitRepo, type TempGitRepo } from "./helpers.js";

describe("smudgeFilter", () => {
  it("decrypts mdenc content back to plaintext", async () => {
    const encrypted = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, { scrypt: FAST_SCRYPT });
    const result = await smudgeFilter(encrypted, TEST_PASSWORD);
    expect(result).toBe(SIMPLE_MARKDOWN);
  });

  it("passes through non-mdenc content unchanged", async () => {
    const plain = "# Just a normal markdown file\n\nNothing encrypted here.";
    const result = await smudgeFilter(plain, TEST_PASSWORD);
    expect(result).toBe(plain);
  });

  it("passes through content when password is null", async () => {
    const encrypted = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, { scrypt: FAST_SCRYPT });
    const result = await smudgeFilter(encrypted, null);
    expect(result).toBe(encrypted);
  });

  it("returns encrypted content on wrong password (no throw)", async () => {
    const encrypted = await encrypt(SIMPLE_MARKDOWN, TEST_PASSWORD, { scrypt: FAST_SCRYPT });
    const result = await smudgeFilter(encrypted, WRONG_PASSWORD);
    // Should return the original encrypted content, not throw
    expect(result).toBe(encrypted);
  });

  it("passes through empty string", async () => {
    const result = await smudgeFilter("", TEST_PASSWORD);
    expect(result).toBe("");
  });
});

describe("cleanFilter", () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it("encrypts plaintext to mdenc format", async () => {
    repo = createTempGitRepo();
    const result = await cleanFilter("test.md", SIMPLE_MARKDOWN, TEST_PASSWORD, repo.path);
    expect(result).toStartWith("mdenc:v1 ");
    expect(result).toContain("seal_b64=");
  });

  it("round-trips: clean then smudge returns original", async () => {
    repo = createTempGitRepo();
    const encrypted = await cleanFilter("test.md", SIMPLE_MARKDOWN, TEST_PASSWORD, repo.path);
    const decrypted = await smudgeFilter(encrypted, TEST_PASSWORD);
    expect(decrypted).toBe(SIMPLE_MARKDOWN);
  });

  it("produces deterministic output with previousFile", async () => {
    repo = createTempGitRepo();

    // First encryption
    const first = await cleanFilter("notes.md", SIMPLE_MARKDOWN, TEST_PASSWORD, repo.path);

    // Commit the encrypted file so gitShow can find it
    writeFileSync(join(repo.path, "notes.md"), first);
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["-C", repo.path, "add", "notes.md"], { stdio: "pipe" });
    execFileSync("git", ["-C", repo.path, "commit", "-m", "add notes"], { stdio: "pipe" });

    // Re-encrypt same content — should reuse salt/fileId from HEAD
    const second = await cleanFilter("notes.md", SIMPLE_MARKDOWN, TEST_PASSWORD, repo.path);

    expect(second).toBe(first);
  });
});
