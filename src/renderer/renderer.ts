// NOTE: Compiled as a plain browser script (no import/export) — see the build
// notes; CommonJS output breaks in the renderer and ESM is blocked over file://.
type ProfileData = Record<string, string>;
type ChatMessage = { role: "user" | "assistant"; content: string };

interface Job {
  title: string;
  company: string;
  location: string;
  url: string;
  tags: string[];
  source: string;
  date: string;
  description: string;
}

interface ProfileRecord {
  id: string;
  name: string;
  data: ProfileData;
}
interface Settings {
  provider: string;
  ollamaModel: string;
  ollamaHost: string;
  anthropicApiKey: string;
  anthropicModel: string;
  adzunaAppId: string;
  adzunaAppKey: string;
  adzunaCountry: string;
  serpApiKey: string;
}
interface Store {
  activeId: string;
  profiles: ProfileRecord[];
  settings: Settings;
}

/** A form field the heuristic matcher below couldn't confidently label,
 * described for the local model as a fallback. */
interface FieldDescriptor {
  index: number;
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  label?: string;
  context?: string;
  options?: string[];
  required?: boolean;
}

interface FieldMapping {
  index: number;
  value: string;
}

interface Window {
  api: {
    versions: { node: string; chrome: string; electron: string };
    loadStore: () => Promise<Store>;
    saveStore: (store: Store) => Promise<boolean>;
    searchJobs: (query: string, location: string) => Promise<Job[]>;
    pickResume: () => Promise<string | null>;
    attachResume: (webContentsId: number, filePath: string) => Promise<number>;
    planAutofillLLM: (fields: FieldDescriptor[]) => Promise<FieldMapping[]>;
    chat: {
      send: (history: ChatMessage[]) => void;
      onDelta: (cb: (text: string) => void) => void;
      onDone: (cb: (full: string) => void) => void;
      onError: (cb: (message: string) => void) => void;
    };
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

/** The editable profile fields, in display order. */
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

// --- Element refs ---
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsBack = document.getElementById("settings-back") as HTMLButtonElement;
const mainView = document.getElementById("main-view") as HTMLElement;
const settingsView = document.getElementById("settings-view") as HTMLElement;
const jobsView = document.getElementById("jobs-view") as HTMLElement;

const profileSelect = document.getElementById("profile-select") as HTMLSelectElement;
const urlInput = document.getElementById("url-input") as HTMLInputElement;
const openBtn = document.getElementById("open-btn") as HTMLButtonElement;
const autofillBtn = document.getElementById("autofill-btn") as HTMLButtonElement;
const autoToggle = document.getElementById("auto-toggle") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLElement;
const placeholderEl = document.getElementById("placeholder") as HTMLElement;
const view = document.getElementById("view") as WebviewElement;

// Settings — profiles
const profilesList = document.getElementById("profiles-list") as HTMLElement;
const addProfileBtn = document.getElementById("add-profile") as HTMLButtonElement;
const deleteProfileBtn = document.getElementById("delete-profile") as HTMLButtonElement;
const profileNameInput = document.getElementById("profile-name") as HTMLInputElement;
const profileForm = document.getElementById("profile-form") as HTMLFormElement;
const resumeBtn = document.getElementById("resume-btn") as HTMLButtonElement;
const resumeName = document.getElementById("resume-name") as HTMLElement;
const saveProfileBtn = document.getElementById("save-profile") as HTMLButtonElement;
const settingsStatus = document.getElementById("settings-status") as HTMLElement;

// Settings — assistant
const setProvider = document.getElementById("set-provider") as HTMLSelectElement;
const setModel = document.getElementById("set-model") as HTMLInputElement;
const setHost = document.getElementById("set-host") as HTMLInputElement;
const setClaudeKey = document.getElementById("set-claude-key") as HTMLInputElement;
const setClaudeModel = document.getElementById("set-claude-model") as HTMLInputElement;
const saveSettingsBtn = document.getElementById("save-settings") as HTMLButtonElement;
const settingsGeneralStatus = document.getElementById(
  "settings-general-status"
) as HTMLElement;

// Settings — job search (SerpApi + Adzuna)
const setSerpApiKey = document.getElementById("set-serpapi-key") as HTMLInputElement;
const setAdzunaId = document.getElementById("set-adzuna-id") as HTMLInputElement;
const setAdzunaKey = document.getElementById("set-adzuna-key") as HTMLInputElement;
const setAdzunaCountry = document.getElementById("set-adzuna-country") as HTMLInputElement;
const saveJobSearchBtn = document.getElementById("save-jobsearch") as HTMLButtonElement;
const settingsJobSearchStatus = document.getElementById(
  "settings-jobsearch-status"
) as HTMLElement;

// --- State ---
let store: Store = {
  activeId: "default",
  profiles: [{ id: "default", name: "Default", data: {} }],
  settings: {
    provider: "ollama",
    ollamaModel: "",
    ollamaHost: "",
    anthropicApiKey: "",
    anthropicModel: "",
    adzunaAppId: "",
    adzunaAppKey: "",
    adzunaCountry: "us",
    serpApiKey: "",
  },
};
let pageReady = false;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function newId(): string {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function activeProfile(): ProfileRecord {
  return (
    store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0]
  );
}

function persist(): void {
  window.api.saveStore(store);
}

// --- Main view: active-profile selector ---
function renderProfileSelect(): void {
  profileSelect.innerHTML = "";
  for (const p of store.profiles) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || "(unnamed)";
    profileSelect.appendChild(opt);
  }
  profileSelect.value = store.activeId;
}

profileSelect.addEventListener("change", () => {
  store.activeId = profileSelect.value;
  persist();
});

// --- Settings: profiles ---
function renderProfilesList(): void {
  profilesList.innerHTML = "";
  for (const p of store.profiles) {
    const li = document.createElement("li");
    li.className = "profile-item" + (p.id === store.activeId ? " active" : "");
    li.textContent = p.name || "(unnamed)";
    li.addEventListener("click", () => {
      store.activeId = p.id;
      persist();
      renderProfilesList();
      renderProfileEditor();
    });
    profilesList.appendChild(li);
  }
}

function renderProfileEditor(): void {
  const profile = activeProfile();
  profileNameInput.value = profile.name;

  profileForm.innerHTML = "";
  for (const { key, label } of FIELDS) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const lbl = document.createElement("label");
    lbl.textContent = label;
    lbl.htmlFor = `f-${key}`;

    const input = document.createElement("input");
    input.id = `f-${key}`;
    input.dataset.key = key;
    input.value = profile.data[key] ?? "";

    wrap.appendChild(lbl);
    wrap.appendChild(input);
    profileForm.appendChild(wrap);
  }

  const resumePath = profile.data.resumePath ?? "";
  resumeName.textContent = resumePath ? basename(resumePath) : "No file selected";
  settingsStatus.textContent = "";
}

function saveProfileFromEditor(): void {
  const profile = activeProfile();
  profile.name = profileNameInput.value.trim() || "Untitled";
  profileForm.querySelectorAll<HTMLInputElement>("input[data-key]").forEach((el) => {
    profile.data[el.dataset.key as string] = el.value.trim();
  });
  persist();
  renderProfilesList();
  renderProfileSelect();
  settingsStatus.textContent = "Profile saved.";
}

addProfileBtn.addEventListener("click", () => {
  const record: ProfileRecord = { id: newId(), name: "New profile", data: {} };
  store.profiles.push(record);
  store.activeId = record.id;
  persist();
  renderProfilesList();
  renderProfileEditor();
  renderProfileSelect();
  profileNameInput.focus();
  profileNameInput.select();
});

deleteProfileBtn.addEventListener("click", () => {
  if (store.profiles.length <= 1) {
    // Keep at least one profile — reset the last one instead of removing it.
    store.profiles = [{ id: "default", name: "Default", data: {} }];
    store.activeId = "default";
  } else {
    store.profiles = store.profiles.filter((p) => p.id !== store.activeId);
    store.activeId = store.profiles[0].id;
  }
  persist();
  renderProfilesList();
  renderProfileEditor();
  renderProfileSelect();
});

saveProfileBtn.addEventListener("click", saveProfileFromEditor);

resumeBtn.addEventListener("click", async () => {
  const picked = await window.api.pickResume();
  if (picked) {
    activeProfile().data.resumePath = picked;
    resumeName.textContent = basename(picked);
    persist();
    settingsStatus.textContent = "Resume selected.";
  }
});

// --- Settings: assistant ---
function renderAssistantSettings(): void {
  setProvider.value = store.settings.provider === "claude" ? "claude" : "ollama";
  setModel.value = store.settings.ollamaModel ?? "";
  setHost.value = store.settings.ollamaHost ?? "";
  setClaudeKey.value = store.settings.anthropicApiKey ?? "";
  setClaudeModel.value = store.settings.anthropicModel ?? "";
  settingsGeneralStatus.textContent = "";
}

saveSettingsBtn.addEventListener("click", () => {
  store.settings.provider = setProvider.value === "claude" ? "claude" : "ollama";
  store.settings.ollamaModel = setModel.value.trim();
  store.settings.ollamaHost = setHost.value.trim();
  store.settings.anthropicApiKey = setClaudeKey.value.trim();
  store.settings.anthropicModel = setClaudeModel.value.trim();
  persist();
  settingsGeneralStatus.textContent = "Settings saved.";
});

function renderJobSearchSettings(): void {
  setSerpApiKey.value = store.settings.serpApiKey ?? "";
  setAdzunaId.value = store.settings.adzunaAppId ?? "";
  setAdzunaKey.value = store.settings.adzunaAppKey ?? "";
  setAdzunaCountry.value = store.settings.adzunaCountry ?? "us";
  settingsJobSearchStatus.textContent = "";
}

saveJobSearchBtn.addEventListener("click", () => {
  store.settings.serpApiKey = setSerpApiKey.value.trim();
  store.settings.adzunaAppId = setAdzunaId.value.trim();
  store.settings.adzunaAppKey = setAdzunaKey.value.trim();
  store.settings.adzunaCountry = setAdzunaCountry.value.trim() || "us";
  persist();
  settingsJobSearchStatus.textContent = "Saved.";
});

// --- View switching ---
function hideAllViews(): void {
  mainView.classList.add("hidden");
  settingsView.classList.add("hidden");
  jobsView.classList.add("hidden");
}

function showSettings(): void {
  renderProfilesList();
  renderProfileEditor();
  renderAssistantSettings();
  renderJobSearchSettings();
  hideAllViews();
  settingsView.classList.remove("hidden");
}

function showMain(): void {
  renderProfileSelect();
  hideAllViews();
  mainView.classList.remove("hidden");
}

function showJobs(): void {
  hideAllViews();
  jobsView.classList.remove("hidden");
  jobsQuery.focus();
}

settingsBtn.addEventListener("click", showSettings);
settingsBack.addEventListener("click", showMain);

// Settings section navigation (sidebar).
const settingsNavItems = document.querySelectorAll<HTMLButtonElement>(
  ".settings-nav-item"
);
function showSection(name: string): void {
  settingsNavItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.section === name);
  });
  document.querySelectorAll<HTMLElement>(".settings-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `section-${name}`);
  });
}
settingsNavItems.forEach((item) => {
  item.addEventListener("click", () => showSection(item.dataset.section ?? "profiles"));
});

// --- Jobs search ---
const jobsBtn = document.getElementById("jobs-btn") as HTMLButtonElement;
const jobsBack = document.getElementById("jobs-back") as HTMLButtonElement;
const jobsForm = document.getElementById("jobs-form") as HTMLFormElement;
const jobsQuery = document.getElementById("jobs-query") as HTMLInputElement;
const jobsLocation = document.getElementById("jobs-location") as HTMLInputElement;
const jobsStatus = document.getElementById("jobs-status") as HTMLElement;
const jobsResults = document.getElementById("jobs-results") as HTMLElement;

/** Load a listing into the webview and jump to the main view to autofill it. */
function openJob(url: string): void {
  urlInput.value = url;
  showMain();
  openUrl();
}

// Build cards with DOM APIs (textContent) — never innerHTML — since the job
// data comes from external sites.
function renderJobs(jobs: Job[]): void {
  jobsResults.innerHTML = "";
  for (const job of jobs) {
    const card = document.createElement("div");
    card.className = "job-card";

    const top = document.createElement("div");
    top.className = "job-card-top";

    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "job-title";
    title.textContent = job.title || "(untitled)";
    const meta = document.createElement("p");
    meta.className = "job-meta";
    const dateStr = job.date ? new Date(job.date).toLocaleDateString() : "";
    meta.textContent = [job.company, job.location, dateStr]
      .filter(Boolean)
      .join(" · ");
    info.appendChild(title);
    info.appendChild(meta);

    const open = document.createElement("button");
    open.className = "btn btn-primary job-open";
    open.textContent = "Open & fill";
    open.addEventListener("click", () => openJob(job.url));

    top.appendChild(info);
    top.appendChild(open);
    card.appendChild(top);

    if (job.description) {
      const desc = document.createElement("p");
      desc.className = "job-desc";
      desc.textContent = job.description;
      card.appendChild(desc);
    }

    if (job.tags.length) {
      const tags = document.createElement("div");
      tags.className = "job-tags";
      for (const t of job.tags) {
        const tag = document.createElement("span");
        tag.className = "job-tag";
        tag.textContent = t;
        tags.appendChild(tag);
      }
      card.appendChild(tags);
    }

    const src = document.createElement("div");
    src.className = "job-source";
    src.textContent = "via " + job.source;
    card.appendChild(src);

    jobsResults.appendChild(card);
  }
}

async function runJobSearch(): Promise<void> {
  const query = jobsQuery.value.trim();
  const location = jobsLocation.value.trim();
  jobsStatus.textContent = "Searching…";
  jobsResults.innerHTML = "";
  try {
    const jobs = await window.api.searchJobs(query, location);
    if (!jobs.length) {
      jobsStatus.textContent = "No jobs found. Try a different search.";
      return;
    }
    jobsStatus.textContent = `${jobs.length} result${jobs.length === 1 ? "" : "s"}.`;
    renderJobs(jobs);
  } catch (err) {
    jobsStatus.textContent = "Search failed: " + (err as Error).message;
  }
}

jobsBtn.addEventListener("click", showJobs);
jobsBack.addEventListener("click", showMain);
jobsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  runJobSearch();
});

// --- URL / webview ---
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
 * page. It installs persistent fill/extract/apply routines on `window`,
 * optionally a MutationObserver that re-fills fields added later (multi-step /
 * dynamic forms), then runs the heuristic matcher once.
 *
 * Returns `{ filled, unfilled }`: how many fields the heuristic matched by
 * name/label/placeholder, and a list of leftover fields (tag, label, nearby
 * text, select options, …) it couldn't confidently label — the caller sends
 * those to the local model as a fallback.
 */
function buildAutofillScript(profile: ProfileData, installObserver: boolean): string {
  const enriched: ProfileData = { ...profile };
  enriched.fullName = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .join(" ");

  return `(function () {
  window.__jseekerProfile = ${JSON.stringify(enriched)};

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

  const SKIP_TYPES = ["password", "hidden", "file", "submit", "button", "checkbox", "radio", "image", "reset"];

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
    return text.replace(/\\s+/g, " ").trim();
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

  function candidates() {
    return Array.from(document.querySelectorAll("input, textarea, select")).filter((el) => {
      if (el.tagName === "INPUT" && SKIP_TYPES.includes((el.type || "").toLowerCase())) return false;
      if (el.disabled || el.readOnly) return false;
      return true;
    });
  }

  window.__jseekerRun = function () {
    const profile = window.__jseekerProfile || {};
    let filled = 0;

    candidates().forEach((el) => {
      if (el.dataset.jseekerFilled === "1") return;
      if (el.value && el.value.trim()) return; // don't clobber existing values

      const hay = haystack(el);
      if (!hay) return;

      for (const spec of SPECS) {
        const value = profile[spec.key];
        if (!value) continue;
        if (spec.match.some((m) => hay.includes(m))) {
          if (el.tagName === "SELECT") {
            if (setSelect(el, value)) { el.dataset.jseekerFilled = "1"; filled++; }
          } else {
            setValue(el, value);
            el.dataset.jseekerFilled = "1";
            filled++;
          }
          break;
        }
      }
    });

    return filled;
  };

  // Fields the heuristic above couldn't confidently label, described for the
  // local model. Capped so the prompt stays a reasonable size on huge forms.
  window.__jseekerCollectUnfilled = function () {
    if (!window.__jseekerIdxSeq) window.__jseekerIdxSeq = 0;
    const out = [];

    for (const el of candidates()) {
      if (el.dataset.jseekerFilled === "1") continue;
      if (el.value && el.value.trim()) continue;
      if (out.length >= 40) break;

      if (!el.dataset.jseekerIdx) el.dataset.jseekerIdx = String(window.__jseekerIdxSeq++);

      const context = el.closest("label, fieldset, .field, .form-group") || el.parentElement;
      const descriptor = {
        index: Number(el.dataset.jseekerIdx),
        tag: el.tagName.toLowerCase(),
        type: el.type || undefined,
        name: el.name || undefined,
        id: el.id || undefined,
        placeholder: el.placeholder || undefined,
        ariaLabel: el.getAttribute("aria-label") || undefined,
        autocomplete: el.getAttribute("autocomplete") || undefined,
        label: labelText(el) || undefined,
        context: context ? context.textContent.replace(/\\s+/g, " ").trim().slice(0, 160) : undefined,
        required: el.required || undefined,
      };
      if (el.tagName === "SELECT") {
        descriptor.options = Array.from(el.options).map((o) => o.text).slice(0, 25);
      }
      out.push(descriptor);
    }

    return out;
  };

  // Applies an { index, value }[] mapping (from the local model) back onto
  // the elements tagged with data-jseeker-idx by __jseekerCollectUnfilled.
  window.__jseekerApplyMapping = function (mapping) {
    let applied = 0;
    for (const item of mapping) {
      const el = document.querySelector('[data-jseeker-idx="' + item.index + '"]');
      if (!el || (el.value && el.value.trim())) continue;
      if (el.tagName === "SELECT") {
        if (setSelect(el, item.value)) { el.dataset.jseekerFilled = "1"; applied++; }
      } else {
        setValue(el, item.value);
        el.dataset.jseekerFilled = "1";
        applied++;
      }
    }
    return applied;
  };

  if (${installObserver ? "true" : "false"} && !window.__jseekerObserver) {
    let timer;
    window.__jseekerObserver = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { window.__jseekerRun(); } catch (e) {} }, 400);
    });
    window.__jseekerObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  return { filled: window.__jseekerRun(), unfilled: window.__jseekerCollectUnfilled() };
})();`;
}

/** Applies a model-produced field mapping inside the page via the routine
 * `buildAutofillScript` installed on `window.__jseekerApplyMapping`. */
function buildApplyMappingScript(mapping: FieldMapping[]): string {
  return `window.__jseekerApplyMapping(${JSON.stringify(mapping)});`;
}

async function runFill(): Promise<{ filled: number; unfilled: FieldDescriptor[] }> {
  const result = await view.executeJavaScript(
    buildAutofillScript(activeProfile().data, autoToggle.checked),
    true
  );
  return result as { filled: number; unfilled: FieldDescriptor[] };
}

async function autofill(): Promise<void> {
  if (!pageReady) return;
  setStatus("Filling fields…");
  try {
    const { filled, unfilled } = await runFill();
    let llmFilled = 0;

    if (unfilled.length) {
      setStatus(
        `Filled ${filled} field${filled === 1 ? "" : "s"}. Asking assistant about ${unfilled.length} more…`
      );
      try {
        const mapping = await window.api.planAutofillLLM(unfilled);
        if (mapping.length) {
          llmFilled = (await view.executeJavaScript(
            buildApplyMappingScript(mapping),
            true
          )) as number;
        }
      } catch (err) {
        // Best-effort: the local model may be unavailable or misconfigured.
        // The heuristic pass above already ran, so don't fail autofill over it.
        console.error("LLM autofill step failed:", err);
      }
    }

    const total = filled + llmFilled;
    let msg =
      `Filled ${total} field${total === 1 ? "" : "s"}` +
      (llmFilled ? ` (${llmFilled} via assistant)` : "") +
      ".";
    const resumePath = activeProfile().data.resumePath;
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

view.addEventListener("did-navigate-in-page", () => {
  if (autoToggle.checked && pageReady) autofill();
});

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

// --- Chat with a local model ---
const chatToggle = document.getElementById("chat-toggle") as HTMLButtonElement;
const chatPanel = document.getElementById("chat-panel") as HTMLElement;
const chatMessages = document.getElementById("chat-messages") as HTMLElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement;

const chatHistory: ChatMessage[] = [];
let streamingBubble: HTMLElement | null = null;
let streamingText = "";

function addChatBubble(text: string, kind: "user" | "assistant" | "error"): HTMLElement {
  const bubble = document.createElement("div");
  bubble.className = `chat-msg ${kind}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

chatToggle.addEventListener("click", () => {
  chatPanel.classList.toggle("hidden");
  if (!chatPanel.classList.contains("hidden")) chatInput.focus();
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || streamingBubble) return;

  addChatBubble(text, "user");
  chatHistory.push({ role: "user", content: text });
  chatInput.value = "";

  streamingText = "";
  streamingBubble = addChatBubble("…", "assistant");
  window.api.chat.send(chatHistory);
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

window.api.chat.onDelta((text) => {
  if (!streamingBubble) return;
  streamingText += text;
  streamingBubble.textContent = streamingText;
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

window.api.chat.onDone((full) => {
  if (!streamingBubble) return;
  const finalText = full || streamingText;
  streamingBubble.textContent = finalText;
  chatHistory.push({ role: "assistant", content: finalText });
  streamingBubble = null;
  streamingText = "";
});

window.api.chat.onError((message) => {
  if (streamingBubble) {
    streamingBubble.className = "chat-msg error";
    streamingBubble.textContent = message;
    streamingBubble = null;
    streamingText = "";
    if (chatHistory[chatHistory.length - 1]?.role === "user") chatHistory.pop();
  } else {
    addChatBubble(message, "error");
  }
});

// --- Init ---
async function init(): Promise<void> {
  store = await window.api.loadStore();
  renderProfileSelect();
}

init();
