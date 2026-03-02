import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempGitRepo, mdenc, type TempGitRepo } from "./helpers.js";

describe("mdenc status", () => {
  let repo: TempGitRepo;

  afterEach(() => repo?.cleanup());

  it("reports no marked directories", () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ["init"]);
    const output = mdenc(repo.path, ["status"]);
    expect(output).toContain("No directories marked");
  });

  it("shows marked directory and filter status", () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, "notes");
    mkdirSync(dir);

    mdenc(repo.path, ["init"]);
    mdenc(repo.path, ["mark", dir]);

    const output = mdenc(repo.path, ["status"]);
    expect(output).toContain("notes/");
    expect(output).toContain("Filter: configured");
    expect(output).toContain("Password: available");
  });

  it("shows unconfigured filter", () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, "notes");
    mkdirSync(dir);

    mdenc(repo.path, ["mark", dir]);

    const output = mdenc(repo.path, ["status"]);
    expect(output).toContain("NOT CONFIGURED");
  });

  it("shows missing password", () => {
    repo = createTempGitRepo();
    mdenc(repo.path, ["init"]);

    const output = mdenc(repo.path, ["status"], { MDENC_PASSWORD: "" });
    expect(output).toContain("NOT AVAILABLE");
  });

  it("shows plaintext .md files", () => {
    repo = createTempGitRepo();
    const dir = join(repo.path, "notes");
    mkdirSync(dir);

    mdenc(repo.path, ["init"]);
    mdenc(repo.path, ["mark", dir]);
    writeFileSync(join(dir, "test.md"), "# Hello\n");

    const output = mdenc(repo.path, ["status"]);
    expect(output).toContain("test.md");
    expect(output).toContain("plaintext");
  });
});
