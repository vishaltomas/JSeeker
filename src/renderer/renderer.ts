// NOTE: This file is compiled as a plain browser script (no import/export), so
// it must stay module-free — CommonJS output breaks in the renderer ("exports
// is not defined") and ES modules are blocked over file://. Global `interface`
// augmentation below works precisely because this is a script, not a module.
type Profile = Record<string, string>;

interface Window {
  api: {
    versions: { node: string; chrome: string; electron: string };
    loadProfile: () => Promise<Profile>;
    saveProfile: (profile: Profile) => Promise<boolean>;
    pickResume: () => Promise<string | null>;
    attachResume: (webContentsId: number, filePath: string) => Promise<number>;
  };
}

/** An Electron <webview> exposes methods the DOM lib doesn't know about. */
interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  getWebContentsId(): number;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

/** The editable text profile fields, in display order. */
const FIELDS: { key: string; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "zip", label: "ZIP / Postal code" },
  { key: "country", label: "Country" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "github", label: "GitHub URL" },
  { key: "website", label: "Website / Portfolio" },
  { key: "currentTitle", label: "Current title" },
  { key: "currentCompany", label: "Current company" },
];

const urlInput = document.getElementById("url-input") as HTMLInputElement;
const openBtn = document.getElementById("open-btn") as HTMLButtonElement;
const autofillBtn = document.getElementById("autofill-btn") as HTMLButtonElement;
const autoToggle = document.getElementById("auto-toggle") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const resumeBtn = document.getElementById("resume-btn") as HTMLButtonElement;
const resumeName = document.getElementById("resume-name") as HTMLElement;
const formEl = document.getElementById("profile-form") as HTMLFormElement;
const statusEl = document.getElementById("status") as HTMLElement;
const placeholderEl = document.getElementById("placeholder") as HTMLElement;
const view = document.getElementById("view") as WebviewElement;

let resumePath = "";
let pageReady = false;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** Build the sidebar inputs and populate them from the saved profile. */
async function initProfileForm(): Promise<void> {
  const profile = await window.api.loadProfile();
  for (const { key, label } of FIELDS) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const lbl = document.createElement("label");
    lbl.textContent = label;
    lbl.htmlFor = `f-${key}`;

    const input = document.createElement("input");
    input.id = `f-${key}`;
    input.dataset.key = key;
    input.value = profile[key] ?? "";

    wrap.appendChild(lbl);
    wrap.appendChild(input);
    formEl.appendChild(wrap);
  }

  resumePath = profile.resumePath ?? "";
  if (resumePath) resumeName.textContent = basename(resumePath);
}

function getProfile(): Profile {
  const profile: Profile = {};
  formEl.querySelectorAll<HTMLInputElement>("input[data-key]").forEach((el) => {
    profile[el.dataset.key as string] = el.value.trim();
  });
  profile.resumePath = resumePath;
  return profile;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function openUrl(): void {
  const url = normalizeUrl(urlInput.value);
  if (!url) return;
  placeholderEl.style.display = "none";
  pageReady = false;
  view.src = url;
  setStatus("Loading page…");
}

/**
 * Returns a self-contained script (as a string) that runs inside the loaded
 * page. It installs a persistent fill routine on `window`, optionally a
 * MutationObserver that re-fills fields added later (multi-step / dynamic
 * forms), then runs once and returns the number of fields filled.
 */
function buildAutofillScript(profile: Profile, installObserver: boolean): string {
  const enriched: Profile = { ...profile };
  enriched.fullName = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .join(" ");

  return `(function () {
  window.__jseekerProfile = ${JSON.stringify(enriched)};

  window.__jseekerRun = function () {
    const profile = window.__jseekerProfile || {};

    // Each spec maps a profile key to substrings that identify the field.
    // Order matters: more specific specs come first.
    const SPECS = [
      { key: "email", match: ["email", "e-mail"] },
      { key: "phone", match: ["phone", "mobile", "telephone", "tel"] },
      { key: "firstName", match: ["first name", "firstname", "first-name", "fname", "given name", "given-name", "givenname"] },
      { key: "lastName", match: ["last name", "lastname", "last-name", "lname", "surname", "family name", "family-name", "familyname"] },
      { key: "fullName", match: ["full name", "fullname", "your name", "full-name"] },
      { key: "linkedin", match: ["linkedin"] },
      { key: "github", match: ["github"] },
      { key: "website", match: ["website", "portfolio", "personal site"] },
      { key: "address", match: ["street", "address line", "address"] },
      { key: "city", match: ["city", "town"] },
      { key: "state", match: ["state", "province", "region"] },
      { key: "zip", match: ["zip", "postal", "postcode", "post code"] },
      { key: "country", match: ["country"] },
      { key: "currentTitle", match: ["current title", "job title", "position", "role", "title"] },
      { key: "currentCompany", match: ["current company", "employer", "company", "organization", "organisation"] },
    ];

    function labelText(el) {
      let text = "";
      if (el.labels) { for (const l of el.labels) text += " " + l.textContent; }
      const labelledby = el.getAttribute("aria-labelledby");
      if (labelledby) {
        for (const id of labelledby.split(/\\s+/)) {
          const ref = document.getElementById(id);
          if (ref) text += " " + ref.textContent;
        }
      }
      return text;
    }

    function haystack(el) {
      return [
        el.name, el.id, el.placeholder,
        el.getAttribute("aria-label"),
        el.getAttribute("autocomplete"),
        labelText(el),
      ].filter(Boolean).join(" ").toLowerCase();
    }

    function setValue(el, value) {
      const proto = el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function setSelect(el, value) {
      const wanted = value.toLowerCase();
      for (const opt of el.options) {
        if (opt.value.toLowerCase() === wanted || opt.text.toLowerCase().includes(wanted)) {
          el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    const SKIP_TYPES = ["password", "hidden", "file", "submit", "button", "checkbox", "radio", "image", "reset"];
    const elements = document.querySelectorAll("input, textarea, select");
    let filled = 0;

    elements.forEach((el) => {
      if (el.tagName === "INPUT" && SKIP_TYPES.includes((el.type || "").toLowerCase())) return;
      if (el.disabled || el.readOnly) return;
      if (el.value && el.value.trim()) return; // don't clobber existing values

      const hay = haystack(el);
      if (!hay) return;

      for (const spec of SPECS) {
        const value = profile[spec.key];
        if (!value) continue;
        if (spec.match.some((m) => hay.includes(m))) {
          if (el.tagName === "SELECT") {
            if (setSelect(el, value)) filled++;
          } else {
            setValue(el, value);
            filled++;
          }
          break;
        }
      }
    });

    return filled;
  };

  if (${installObserver ? "true" : "false"} && !window.__jseekerObserver) {
    let timer;
    window.__jseekerObserver = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { window.__jseekerRun(); } catch (e) {} }, 400);
    });
    window.__jseekerObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  return window.__jseekerRun();
})();`;
}

async function runFill(): Promise<number> {
  const profile = getProfile();
  const count = await view.executeJavaScript(
    buildAutofillScript(profile, autoToggle.checked),
    true
  );
  return count as number;
}

async function autofill(): Promise<void> {
  if (!pageReady) return;
  setStatus("Filling fields…");
  try {
    const count = await runFill();
    let msg = `Filled ${count} field${count === 1 ? "" : "s"}.`;
    if (resumePath) {
      const attached = await window.api.attachResume(
        view.getWebContentsId(),
        resumePath
      );
      msg += ` Attached resume to ${attached} upload${attached === 1 ? "" : "s"}.`;
    }
    setStatus(msg);
  } catch (err) {
    setStatus("Autofill failed: " + (err as Error).message);
  }
}

// --- Events ---
openBtn.addEventListener("click", openUrl);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") openUrl();
});

view.addEventListener("did-start-loading", () => {
  setStatus("Loading page…");
});

view.addEventListener("did-finish-load", () => {
  pageReady = true;
  autofillBtn.disabled = false;
  if (autoToggle.checked) {
    autofill();
  } else {
    setStatus("Page loaded. Click Autofill.");
  }
});

// In-page navigations (SPA route changes / multi-step forms) don't re-fire
// did-finish-load, so re-fill on those too when Auto is on.
view.addEventListener("did-navigate-in-page", () => {
  if (autoToggle.checked && pageReady) autofill();
});

// Only surface *main-frame* failures, and ignore ERR_ABORTED (-3), which is the
// normal signal for a redirect or a superseded navigation — not a real error.
view.addEventListener("did-fail-load", (event) => {
  const e = event as {
    errorCode: number;
    errorDescription: string;
    isMainFrame: boolean;
  };
  if (!e.isMainFrame || e.errorCode === -3) return;
  setStatus(`Load failed (${e.errorCode}): ${e.errorDescription}`);
});

view.addEventListener("render-process-gone", () => {
  setStatus("The page's process crashed. Try reloading.");
});

autofillBtn.addEventListener("click", autofill);

saveBtn.addEventListener("click", async () => {
  await window.api.saveProfile(getProfile());
  setStatus("Info saved.");
});

resumeBtn.addEventListener("click", async () => {
  const picked = await window.api.pickResume();
  if (picked) {
    resumePath = picked;
    resumeName.textContent = basename(picked);
    setStatus("Resume selected. Save to remember it.");
  }
});

initProfileForm();
