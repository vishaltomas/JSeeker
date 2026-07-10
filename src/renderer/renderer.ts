// NOTE: Compiled as a plain browser script (no import/export) — see the build
// notes; CommonJS output breaks in the renderer and ESM is blocked over file://.
type ProfileData = Record<string, string>;
type ChatMessage = { role: "user" | "assistant"; content: string };

interface ProfileRecord {
  id: string;
  name: string;
  data: ProfileData;
}
interface Settings {
  ollamaModel: string;
  ollamaHost: string;
}
interface Store {
  activeId: string;
  profiles: ProfileRecord[];
  settings: Settings;
}

interface Window {
  api: {
    versions: { node: string; chrome: string; electron: string };
    loadStore: () => Promise<Store>;
    saveStore: (store: Store) => Promise<boolean>;
    pickResume: () => Promise<string | null>;
    attachResume: (webContentsId: number, filePath: string) => Promise<number>;
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
const setModel = document.getElementById("set-model") as HTMLInputElement;
const setHost = document.getElementById("set-host") as HTMLInputElement;
const saveSettingsBtn = document.getElementById("save-settings") as HTMLButtonElement;
const settingsGeneralStatus = document.getElementById(
  "settings-general-status"
) as HTMLElement;

// --- State ---
let store: Store = {
  activeId: "default",
  profiles: [{ id: "default", name: "Default", data: {} }],
  settings: { ollamaModel: "", ollamaHost: "" },
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
  setModel.value = store.settings.ollamaModel ?? "";
  setHost.value = store.settings.ollamaHost ?? "";
  settingsGeneralStatus.textContent = "";
}

saveSettingsBtn.addEventListener("click", () => {
  store.settings.ollamaModel = setModel.value.trim();
  store.settings.ollamaHost = setHost.value.trim();
  persist();
  settingsGeneralStatus.textContent = "Settings saved.";
});

// --- View switching ---
function showSettings(): void {
  renderProfilesList();
  renderProfileEditor();
  renderAssistantSettings();
  mainView.classList.add("hidden");
  settingsView.classList.remove("hidden");
}

function showMain(): void {
  renderProfileSelect();
  settingsView.classList.add("hidden");
  mainView.classList.remove("hidden");
}

settingsBtn.addEventListener("click", showSettings);
settingsBack.addEventListener("click", showMain);

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
 * page. It installs a persistent fill routine on `window`, optionally a
 * MutationObserver that re-fills fields added later (multi-step / dynamic
 * forms), then runs once and returns the number of fields filled.
 */
function buildAutofillScript(profile: ProfileData, installObserver: boolean): string {
  const enriched: ProfileData = { ...profile };
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
  const count = await view.executeJavaScript(
    buildAutofillScript(activeProfile().data, autoToggle.checked),
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
