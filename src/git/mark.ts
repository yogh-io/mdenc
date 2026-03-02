import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { findGitRoot, gitAdd } from "./utils.js";

const MARKER_FILE = ".mdenc.conf";
const MARKER_CONTENT = "# mdenc: .md files in this directory are automatically encrypted\n";
const GITATTR_PATTERN = "*.md filter=mdenc diff=mdenc";

function isFilterConfigured(repoRoot: string): boolean {
  try {
    const val = execFileSync("git", ["config", "--get", "filter.mdenc.process"], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return val.length > 0;
  } catch {
    return false;
  }
}

function markUsage(): never {
  console.error(`Usage: mdenc mark <directory>

Mark a directory so that all *.md files inside it are automatically
encrypted when staged (git add) and decrypted when checked out.

What it does:
  1. Creates <directory>/.mdenc.conf       Marker file for mdenc to discover
  2. Creates <directory>/.gitattributes    Assigns the mdenc filter to *.md files
  3. Stages both files in git

Prerequisites:
  Run "mdenc init" first to configure the git filter in this clone.
  Run "mdenc genpass" to generate a password (or set MDENC_PASSWORD).

Example:
  mdenc init
  mdenc genpass
  mdenc mark docs/private
  echo "# Secret" > docs/private/notes.md
  git add docs/private/notes.md   # encrypted automatically`);
  process.exit(1);
}

export function markCommand(dirArg: string): void {
  if (dirArg === "--help" || dirArg === "-h") {
    markUsage();
  }

  const repoRoot = findGitRoot();
  const dir = resolve(dirArg);

  if (!existsSync(dir)) {
    console.error(`Error: directory "${dirArg}" does not exist`);
    process.exit(1);
  }

  const rel = relative(repoRoot, dir);
  if (rel.startsWith("..")) {
    console.error(`Error: directory "${dirArg}" is outside the git repository`);
    process.exit(1);
  }

  const relDir = rel || ".";
  const filterReady = isFilterConfigured(repoRoot);

  // Create .mdenc.conf
  const confPath = join(dir, MARKER_FILE);
  if (!existsSync(confPath)) {
    writeFileSync(confPath, MARKER_CONTENT);
    console.log(`Created ${relDir}/${MARKER_FILE}`);
  } else {
    console.log(`${relDir}/${MARKER_FILE} already exists (skipped)`);
  }

  // Create/update .gitattributes
  const gitattrsPath = join(dir, ".gitattributes");
  if (existsSync(gitattrsPath)) {
    const content = readFileSync(gitattrsPath, "utf-8");
    if (content.includes("filter=mdenc")) {
      console.log(`${relDir}/.gitattributes already has filter=mdenc (skipped)`);
    } else {
      writeFileSync(gitattrsPath, `${content.trimEnd()}\n${GITATTR_PATTERN}\n`);
      console.log(`Updated ${relDir}/.gitattributes`);
    }
  } else {
    writeFileSync(gitattrsPath, `${GITATTR_PATTERN}\n`);
    console.log(`Created ${relDir}/.gitattributes`);
  }

  // Stage .mdenc.conf and .gitattributes
  const toStage = [relative(repoRoot, confPath), relative(repoRoot, gitattrsPath)];
  gitAdd(repoRoot, toStage);

  console.log(`Marked ${relDir}/ for mdenc encryption`);

  if (!filterReady) {
    console.log(`\nWarning: git filter not configured yet. Run "mdenc init" to enable encryption.`);
  }
}
