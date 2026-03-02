import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { resolvePassword } from "./password.js";
import { findGitRoot, findMarkedDirs, getMdFilesInDir } from "./utils.js";

interface FilterConfig {
  process: string | null;
  clean: string | null;
  smudge: string | null;
  required: boolean;
  textconv: string | null;
}

function getFilterConfig(repoRoot: string): FilterConfig {
  const get = (key: string): string | null => {
    try {
      return execFileSync("git", ["config", "--get", key], {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return null;
    }
  };

  return {
    process: get("filter.mdenc.process"),
    clean: get("filter.mdenc.clean"),
    smudge: get("filter.mdenc.smudge"),
    required: get("filter.mdenc.required") === "true",
    textconv: get("diff.mdenc.textconv"),
  };
}

export function statusCommand(): void {
  const repoRoot = findGitRoot();
  const password = resolvePassword(repoRoot);
  const markedDirs = findMarkedDirs(repoRoot);

  if (markedDirs.length === 0) {
    console.log("No directories marked for mdenc encryption.");
    console.log('Use "mdenc mark <directory>" to designate a directory.');
  } else {
    console.log("Marked directories:\n");

    for (const dir of markedDirs) {
      const relDir = relative(repoRoot, dir) || ".";
      console.log(`  ${relDir}/`);

      // List .md files and their state
      const mdFiles = getMdFilesInDir(dir);
      for (const f of mdFiles) {
        const content = readFileSync(join(dir, f), "utf-8");
        if (content.startsWith("mdenc:v1")) {
          console.log(`    ${f}  [encrypted — needs smudge]`);
        } else {
          console.log(`    ${f}  [plaintext]`);
        }
      }

      if (mdFiles.length === 0) {
        console.log("    (no .md files)");
      }

      // Check .gitattributes health
      const gitattrsPath = join(dir, ".gitattributes");
      if (!existsSync(gitattrsPath)) {
        console.log("    WARNING: no .gitattributes in this directory");
      } else {
        const content = readFileSync(gitattrsPath, "utf-8");
        if (!content.includes("filter=mdenc")) {
          console.log("    WARNING: .gitattributes missing filter=mdenc pattern");
        }
      }

      console.log();
    }
  }

  // Password status
  if (!password) {
    console.log("Password: NOT AVAILABLE");
    console.log("  Set MDENC_PASSWORD env var or create .mdenc-password file");
  } else {
    console.log("Password: available");
  }

  // Filter config status
  const config = getFilterConfig(repoRoot);
  if (!config.process && !config.clean) {
    console.log("Filter: NOT CONFIGURED");
    console.log('  Run "mdenc init" to configure');
  } else {
    console.log("Filter: configured");
    if (!config.required) {
      console.log("  WARNING: filter.mdenc.required is not set to true");
    }
  }
}
