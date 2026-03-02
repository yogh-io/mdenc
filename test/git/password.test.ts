import { afterEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePassword } from "../../src/git/password.js";
import { createTempGitRepo, type TempGitRepo } from "./helpers.js";

describe("resolvePassword", () => {
  let repo: TempGitRepo;
  const originalEnv = process.env["MDENC_PASSWORD"];

  afterEach(() => {
    repo?.cleanup();
    // Restore original env
    if (originalEnv !== undefined) {
      process.env["MDENC_PASSWORD"] = originalEnv;
    } else {
      delete process.env["MDENC_PASSWORD"];
    }
  });

  it("returns MDENC_PASSWORD env var when set", () => {
    repo = createTempGitRepo();
    process.env["MDENC_PASSWORD"] = "env-password";
    expect(resolvePassword(repo.path)).toBe("env-password");
  });

  it("reads .mdenc-password file when env var not set", () => {
    repo = createTempGitRepo();
    delete process.env["MDENC_PASSWORD"];
    writeFileSync(join(repo.path, ".mdenc-password"), "file-password");
    expect(resolvePassword(repo.path)).toBe("file-password");
  });

  it("trims whitespace from file content", () => {
    repo = createTempGitRepo();
    delete process.env["MDENC_PASSWORD"];
    writeFileSync(join(repo.path, ".mdenc-password"), "  spaced-password  \n");
    expect(resolvePassword(repo.path)).toBe("spaced-password");
  });

  it("returns null when neither source is available", () => {
    repo = createTempGitRepo();
    delete process.env["MDENC_PASSWORD"];
    expect(resolvePassword(repo.path)).toBeNull();
  });

  it("env var takes precedence over file", () => {
    repo = createTempGitRepo();
    process.env["MDENC_PASSWORD"] = "env-wins";
    writeFileSync(join(repo.path, ".mdenc-password"), "file-loses");
    expect(resolvePassword(repo.path)).toBe("env-wins");
  });

  it("returns null when file is empty", () => {
    repo = createTempGitRepo();
    delete process.env["MDENC_PASSWORD"];
    writeFileSync(join(repo.path, ".mdenc-password"), "  \n");
    expect(resolvePassword(repo.path)).toBeNull();
  });
});
