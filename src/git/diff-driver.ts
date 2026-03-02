import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Custom git diff driver. Shows the encrypted diff first (so you can confirm
 * ciphertext is what's stored), then appends a decrypted plaintext diff.
 *
 * Git calls: command path old-file old-hex old-mode new-file new-hex new-mode
 *
 * Git smudge-decrypts the temp files it passes us, so old-file/new-file
 * contain plaintext. To get the raw encrypted content we read the git
 * objects via the hex hashes.
 */
export async function diffDriverCommand(args: string[]): Promise<void> {
  const [path, oldFile, oldHex, , newFile, newHex] = args;

  if (!path || !oldFile || !newFile) {
    process.stderr.write("mdenc diff-driver: insufficient arguments\n");
    process.exit(1);
  }

  const oldEnc = catBlob(oldHex);
  const newEnc = catBlob(newHex);

  // Show encrypted diff when both sides are in git (e.g. git diff --cached)
  // Skip when one side is the worktree (no blob to read)
  if (oldEnc !== null || newEnc !== null) {
    const tmp = mkdtempSync(join(tmpdir(), "mdenc-diff-"));
    try {
      const oldTmp = join(tmp, "old");
      const newTmp = join(tmp, "new");
      writeFileSync(oldTmp, oldEnc ?? "");
      writeFileSync(newTmp, newEnc ?? "");

      const encDiff = unifiedDiff(oldTmp, newTmp, `a/${path}`, `b/${path}`);
      if (encDiff) process.stdout.write(encDiff);
    } finally {
      rmSync(tmp, { recursive: true });
    }
  }

  // Plaintext diff (git already smudge-decrypted the files for us)
  const plainDiff = unifiedDiff(oldFile, newFile, `a/${path}`, `b/${path}`);
  if (plainDiff) {
    // Annotate hunk headers — text after the second @@ is shown by most diff viewers
    const annotated = plainDiff.replace(
      /^(@@ .+ @@)(.*)/gm,
      "$1 decrypted — not stored in repository",
    );
    process.stdout.write(annotated);
  }
}

/** Read a blob from git by its object hash. Returns null for null/zero hashes. */
function catBlob(hex: string | undefined): string | null {
  if (!hex || hex === "." || /^0+$/.test(hex)) return null;
  try {
    return execFileSync("git", ["cat-file", "blob", hex], { encoding: "utf-8" });
  } catch {
    return null;
  }
}

function unifiedDiff(
  oldFile: string,
  newFile: string,
  oldLabel: string,
  newLabel: string,
): string | null {
  try {
    return (
      execFileSync("diff", ["-u", "--label", oldLabel, "--label", newLabel, oldFile, newFile], {
        encoding: "utf-8",
      }) || null
    );
  } catch (e: unknown) {
    // diff exits 1 when files differ (normal)
    const err = e as { status?: number; stdout?: string };
    if (err.status === 1 && err.stdout) return err.stdout;
    return null;
  }
}
