import { encrypt, decrypt } from "mdenc";
import type { ScryptParams } from "mdenc";
import "./style.css";

// --- DOM refs ---
const $plaintext = document.getElementById("plaintext") as HTMLTextAreaElement;
const $encrypted = document.getElementById("encrypted") as HTMLTextAreaElement;
const $password = document.getElementById("password") as HTMLInputElement;
const $togglePw = document.getElementById("toggle-password") as HTMLButtonElement;
const $eyeIcon = document.getElementById("eye-icon") as SVGElement;
const $eyeOffIcon = document.getElementById("eye-off-icon") as SVGElement;
const $scryptPreset = document.getElementById("scrypt-preset") as HTMLSelectElement;
const $loading = document.getElementById("loading") as HTMLDivElement;
const $loadingText = document.getElementById("loading-text") as HTMLSpanElement;
const $plaintextError = document.getElementById("plaintext-error") as HTMLDivElement;
const $encryptedError = document.getElementById("encrypted-error") as HTMLDivElement;
const $encryptHint = document.getElementById("encrypt-hint") as HTMLSpanElement;
const $decryptHint = document.getElementById("decrypt-hint") as HTMLSpanElement;

// --- State ---
type Direction = "encrypt" | "decrypt";
let direction: Direction = "encrypt";
let previousFile: string | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let processing = false;

const FAST_SCRYPT: ScryptParams = { N: 1024, r: 1, p: 1 };
const PROD_SCRYPT: ScryptParams = { N: 16384, r: 8, p: 1 };

function getScryptParams(): ScryptParams {
  return $scryptPreset.value === "fast" ? FAST_SCRYPT : PROD_SCRYPT;
}

// --- UI helpers ---
function showLoading(text: string) {
  $loadingText.textContent = text;
  $loading.classList.remove("hidden");
}

function hideLoading() {
  $loading.classList.add("hidden");
}

function showError(target: "plaintext" | "encrypted", msg: string) {
  const el = target === "plaintext" ? $plaintextError : $encryptedError;
  el.textContent = msg;
}

function clearErrors() {
  $plaintextError.textContent = "";
  $encryptedError.textContent = "";
}

function updateHints() {
  $encryptHint.style.opacity = direction === "encrypt" ? "1" : "0.3";
  $decryptHint.style.opacity = direction === "decrypt" ? "1" : "0.3";
}

// --- Core logic ---
async function doEncrypt() {
  const text = $plaintext.value;
  const pw = $password.value;

  if (!text) {
    $encrypted.value = "";
    return;
  }
  if (!pw) {
    showError("encrypted", "Enter a password");
    return;
  }

  showLoading("Encrypting\u2026");

  // Yield to let the DOM repaint before blocking scrypt
  await new Promise((r) => setTimeout(r, 0));

  try {
    const result = await encrypt(text, pw, {
      scrypt: getScryptParams(),
      previousFile,
    });
    $encrypted.value = result;
    previousFile = result;
    clearErrors();
  } catch (e) {
    showError("encrypted", e instanceof Error ? e.message : String(e));
  } finally {
    hideLoading();
  }
}

async function doDecrypt() {
  const ciphertext = $encrypted.value;
  const pw = $password.value;

  if (!ciphertext) {
    $plaintext.value = "";
    return;
  }
  if (!pw) {
    showError("plaintext", "Enter a password");
    return;
  }

  showLoading("Decrypting\u2026");
  await new Promise((r) => setTimeout(r, 0));

  try {
    const result = await decrypt(ciphertext, pw);
    $plaintext.value = result;
    clearErrors();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showError("plaintext", msg.includes("tag") ? "Wrong password or corrupted data" : msg);
  } finally {
    hideLoading();
  }
}

function scheduleUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (processing) return;
    processing = true;
    try {
      if (direction === "encrypt") {
        await doEncrypt();
      } else {
        await doDecrypt();
      }
    } finally {
      processing = false;
    }
  }, 300);
}

// --- Event listeners ---
$plaintext.addEventListener("input", () => {
  direction = "encrypt";
  updateHints();
  clearErrors();
  scheduleUpdate();
});

$plaintext.addEventListener("focus", () => {
  direction = "encrypt";
  updateHints();
});

$encrypted.addEventListener("input", () => {
  direction = "decrypt";
  updateHints();
  clearErrors();
  scheduleUpdate();
});

$encrypted.addEventListener("focus", () => {
  direction = "decrypt";
  updateHints();
});

$password.addEventListener("input", () => {
  previousFile = undefined; // Clear cache on password change
  clearErrors();
  scheduleUpdate();
});

$scryptPreset.addEventListener("change", () => {
  previousFile = undefined;
  scheduleUpdate();
});

// Password visibility toggle
$togglePw.addEventListener("click", () => {
  const isPassword = $password.type === "password";
  $password.type = isPassword ? "text" : "password";
  $eyeIcon.classList.toggle("hidden", isPassword);
  $eyeOffIcon.classList.toggle("hidden", !isPassword);
});

// --- Sample content on load ---
const SAMPLE_MARKDOWN = `# Meeting Notes

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
  $plaintext.value = SAMPLE_MARKDOWN;
  updateHints();
  await doEncrypt();
}

init();
