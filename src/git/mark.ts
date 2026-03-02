import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { findGitRoot, gitAdd } from "./utils.js";

const MARKER_FILE = ".mdenc.conf";
const MARKER_CONTENT = "# mdenc: .md files in this directory are automatically encrypted\n";
const GITATTR_PATTERN = "*.md filter=mdenc diff=mdenc";

export function markCommand(dirArg: string): void {
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
}
