import { encrypt, decrypt } from "mdenc";
import type { ScryptParams } from "mdenc";
import "./style.css";

// --- Color palette (vibrant, distinct on dark bg) ---
const PALETTE = [
  "#f87171", // red
  "#34d399", // emerald
  "#fbbf24", // amber
  "#60a5fa", // blue
  "#a78bfa", // violet
  "#f472b6", // pink
  "#2dd4bf", // teal
  "#fb923c", // orange
];

// --- DOM refs ---
const $ = (id: string) => document.getElementById(id)!;
const $plain = $("plaintext") as HTMLTextAreaElement;
const $plainHl = $("plaintext-hl") as HTMLPreElement;
const $enc = $("encrypted") as HTMLTextAreaElement;
const $encHl = $("encrypted-hl") as HTMLPreElement;
const $password = $("password") as HTMLInputElement;
const $togglePw = $("toggle-password") as HTMLButtonElement;
const $scrypt = $("scrypt-preset") as HTMLSelectElement;
const $direction = $("direction") as HTMLSpanElement;
const $plainErr = $("plaintext-error") as HTMLSpanElement;
const $encErr = $("encrypted-error") as HTMLSpanElement;
const $statusText = $("status-text") as HTMLSpanElement;
const $paneP = $("pane-plaintext") as HTMLDivElement;
const $paneE = $("pane-encrypted") as HTMLDivElement;
const $helpOverlay = $("help-overlay") as HTMLDivElement;
const $helpToggle = $("help-toggle") as HTMLButtonElement;
const $helpClose = $("help-close") as HTMLButtonElement;

// --- State ---
type Direction = "encrypt" | "decrypt";
let direction: Direction = "encrypt";
let previousFile: string | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let processing = false;

const FAST_SCRYPT: ScryptParams = { N: 1024, r: 1, p: 1 };
const PROD_SCRYPT: ScryptParams = { N: 16384, r: 8, p: 1 };

function getScryptParams(): ScryptParams {
  return $scrypt.value === "fast" ? FAST_SCRYPT : PROD_SCRYPT;
}

// --- HTML escaping ---
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Colorize plaintext by paragraph ---
function colorizePlaintext(text: string): string {
  if (!text) return "\n";
  // Split but keep separators (sequences of 2+ newlines)
  const parts = text.split(/(\n\n+)/);
  let idx = 0;
  const html = parts
    .map((part) => {
      if (/^\n\n+$/.test(part)) return esc(part); // separator
      if (part === "") return "";
      const color = PALETTE[idx++ % PALETTE.length];
      return `<span style="color:${color}">${esc(part)}</span>`;
    })
    .join("");
  return html + "\n"; // trailing newline for scroll-height parity
}

// --- Colorize encrypted output (header/seal dim, chunks colored) ---
function colorizeEncrypted(text: string): string {
  if (!text) return "\n";
  const lines = text.split("\n");
  // Remove trailing empty line
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  let chunkIdx = 0;
  const html = lines
    .map((line) => {
      const isMeta =
        line.startsWith("mdenc:") ||
        line.startsWith("hdrauth") ||
        line.startsWith("seal");
      if (isMeta) {
        return `<span class="meta">${esc(line)}</span>`;
      }
      const color = PALETTE[chunkIdx++ % PALETTE.length];
      return `<span style="color:${color}">${esc(line)}</span>`;
    })
    .join("\n");
  return html + "\n";
}

// --- Update highlight overlays ---
function updatePlaintextHl() {
  $plainHl.innerHTML = colorizePlaintext($plain.value);
}

function updateEncryptedHl() {
  $encHl.innerHTML = colorizeEncrypted($enc.value);
}

// --- Scroll sync (textarea → pre) ---
function syncScroll(ta: HTMLTextAreaElement, pre: HTMLPreElement) {
  ta.addEventListener("scroll", () => {
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  });
}
syncScroll($plain, $plainHl);
syncScroll($enc, $encHl);

// --- UI helpers ---
function setStatus(text: string) {
  $statusText.textContent = text;
}

function showError(target: "plaintext" | "encrypted", msg: string) {
  (target === "plaintext" ? $plainErr : $encErr).textContent = msg;
}

function clearErrors() {
  $plainErr.textContent = "";
  $encErr.textContent = "";
}

function updateDirection() {
  $direction.textContent = direction === "encrypt" ? "▶" : "◀";
  $paneP.classList.toggle("active", direction === "encrypt");
  $paneE.classList.toggle("active", direction === "decrypt");
}

// --- Core logic ---
async function doEncrypt() {
  const text = $plain.value;
  const pw = $password.value;

  if (!text) {
    $enc.value = "";
    updateEncryptedHl();
    return;
  }
  if (!pw) {
    showError("encrypted", "enter a password");
    return;
  }

  setStatus("encrypting\u2026");
  await new Promise((r) => setTimeout(r, 0));

  try {
    const result = await encrypt(text, pw, {
      scrypt: getScryptParams(),
      previousFile,
    });
    $enc.value = result;
    previousFile = result;
    updateEncryptedHl();
    clearErrors();
    setStatus("");
  } catch (e) {
    showError("encrypted", e instanceof Error ? e.message : String(e));
    setStatus("");
  }
}

async function doDecrypt() {
  const ciphertext = $enc.value;
  const pw = $password.value;

  if (!ciphertext) {
    $plain.value = "";
    updatePlaintextHl();
    return;
  }
  if (!pw) {
    showError("plaintext", "enter a password");
    return;
  }

  setStatus("decrypting\u2026");
  await new Promise((r) => setTimeout(r, 0));

  try {
    const result = await decrypt(ciphertext, pw);
    $plain.value = result;
    updatePlaintextHl();
    clearErrors();
    setStatus("");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showError(
      "plaintext",
      msg.includes("tag") ? "wrong password or corrupted data" : msg,
    );
    setStatus("");
  }
}

function scheduleUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (processing) return;
    processing = true;
    try {
      if (direction === "encrypt") await doEncrypt();
      else await doDecrypt();
    } finally {
      processing = false;
    }
  }, 300);
}

// --- Event listeners ---
$plain.addEventListener("input", () => {
  direction = "encrypt";
  updateDirection();
  updatePlaintextHl();
  clearErrors();
  scheduleUpdate();
});

$plain.addEventListener("focus", () => {
  direction = "encrypt";
  updateDirection();
});

$enc.addEventListener("input", () => {
  direction = "decrypt";
  updateDirection();
  updateEncryptedHl();
  clearErrors();
  scheduleUpdate();
});

$enc.addEventListener("focus", () => {
  direction = "decrypt";
  updateDirection();
});

$password.addEventListener("input", () => {
  previousFile = undefined;
  clearErrors();
  scheduleUpdate();
});

$scrypt.addEventListener("change", () => {
  previousFile = undefined;
  scheduleUpdate();
});

// Password toggle
$togglePw.addEventListener("click", () => {
  const showing = $password.type === "text";
  $password.type = showing ? "password" : "text";
  $togglePw.textContent = showing ? "[show]" : "[hide]";
});

// Help overlay
$helpToggle.addEventListener("click", () =>
  $helpOverlay.classList.remove("hidden"),
);
$helpClose.addEventListener("click", () =>
  $helpOverlay.classList.add("hidden"),
);
$helpOverlay.addEventListener("click", (e) => {
  if (e.target === $helpOverlay) $helpOverlay.classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $helpOverlay.classList.add("hidden");
});

// --- Sample content ---
const SAMPLE = `# Meeting Notes

Discussed the Q3 roadmap and assigned owners for each deliverable.

## Action Items

- Alice: finalize the API design by Friday
- Bob: set up staging environment
- Carol: write integration tests

## Budget

Total approved budget is $45,000 for infrastructure upgrades.

---

*Next meeting: Monday 10am*`;

async function init() {
  $plain.value = SAMPLE;
  updateDirection();
  updatePlaintextHl();
  await doEncrypt();
}

init();
