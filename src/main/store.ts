import { app, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";

/** Open key-value bag — no fixed schema. Some conventional keys (see
 * agents/types.ts RESUME_ANCHOR_KEYS) are used by the browser extension's
 * heuristic form matcher, but anything else the user or resume extraction
 * adds lives here too. */
export type ProfileData = Record<string, string>;

export interface ResumeExperience {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ResumeEducation {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

export interface LanguageEntry {
  id: string;
  name: string;
  proficiency: string;
}

/** The structured parts of a resume that don't fit the flat `ProfileData`
 * bag (arrays of entries, not single strings) — edited in ProfileView.tsx,
 * pre-populated (best-effort) from onboarding's document extraction. */
export interface StructuredResume {
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  languages: LanguageEntry[];
}

export type Provider = "ollama" | "claude";

export interface Settings {
  provider: Provider;
  ollamaModel: string;
  ollamaHost: string;
  anthropicApiKey: string;
  anthropicModel: string;
  /** Bearer token the browser extension's local requests must present — see
   * src/main/extensionServer.ts. Generated once and kept stable; not a
   * secret protecting against filesystem access (store.json is plaintext
   * like everything else here), just enough to stop other local processes
   * or web pages from silently reading profile data or triggering fills. */
  extensionSyncToken: string;
}

/** A single source of truth — no more named/switchable profiles. One set of
 * contact/misc info, one resume, one list of uploaded documents. */
export interface Store {
  data: ProfileData;
  resume: StructuredResume;
  /** Paths of resume/CV/supporting documents the user has uploaded (for
   * onboarding extraction and future reference — see ProfileView.tsx). */
  resumeFiles: string[];
  settings: Settings;
  /** Whether the user has been through the first-run document-upload flow. */
  onboarded: boolean;
}

function normalizeSettings(s?: Partial<Settings>): Settings {
  return {
    provider: s?.provider === "claude" ? "claude" : "ollama",
    ollamaModel: s?.ollamaModel ?? "",
    ollamaHost: s?.ollamaHost ?? "",
    anthropicApiKey: s?.anthropicApiKey ?? "",
    anthropicModel: s?.anthropicModel ?? "",
    extensionSyncToken: s?.extensionSyncToken || randomBytes(16).toString("hex"),
  };
}

export function emptyStructuredResume(): StructuredResume {
  return { summary: "", experience: [], education: [], skills: [], languages: [] };
}

function defaultStore(): Store {
  return {
    data: {},
    resume: emptyStructuredResume(),
    resumeFiles: [],
    settings: normalizeSettings(),
    onboarded: false,
  };
}

function storePath(): string {
  return path.join(app.getPath("userData"), "store.json");
}

/** Shape of anything that might already be on disk — spans every schema
 * version this app has ever written, so `loadStore()` can migrate forward
 * from whichever one it finds. */
interface OnDiskStore extends Partial<Store> {
  // Pre-single-profile shape (multiple named profiles + an active one).
  activeId?: string;
  profiles?: { id: string; name: string; data?: ProfileData; resume?: Partial<StructuredResume> }[];
  // Pre-removal-of-login shape.
  account?: { onboarded?: boolean };
}

export function loadStore(): Store {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf-8")) as OnDiskStore;
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");

    const hadToken = !!parsed.settings?.extensionSyncToken;
    const settings = normalizeSettings(parsed.settings);
    const onboarded =
      typeof parsed.onboarded === "boolean" ? parsed.onboarded : !!parsed.account?.onboarded;

    let data: ProfileData;
    let resume: StructuredResume;
    let resumeFiles: string[];
    let needsResave = !hadToken || !!parsed.account;

    if (Array.isArray(parsed.profiles) && parsed.profiles.length) {
      // Migrate the old multi-profile shape: keep whichever was active,
      // drop the rest. This app only ever had one real profile in practice
      // (multi-profile switching wasn't the direction it went), so this is
      // a collapse, not a merge.
      const active = parsed.profiles.find((p) => p.id === parsed.activeId) ?? parsed.profiles[0];
      data = { ...(active.data ?? {}) };
      const legacyResumePath = data.resumePath;
      delete data.resumePath;
      resumeFiles = legacyResumePath ? [legacyResumePath] : [];
      resume = { ...emptyStructuredResume(), ...(active.resume ?? {}) };
      needsResave = true;
    } else {
      data = parsed.data && typeof parsed.data === "object" ? parsed.data : {};
      resume = { ...emptyStructuredResume(), ...(parsed.resume ?? {}) };
      resumeFiles = Array.isArray(parsed.resumeFiles) ? parsed.resumeFiles : [];
    }

    const store: Store = { data, resume, resumeFiles, settings, onboarded };
    if (needsResave) saveStore(store);
    return store;
  } catch {
    /* fall through to migration / default */
  }

  // Migrate a legacy pre-profiles single profile.json, if it exists.
  try {
    const legacy = JSON.parse(
      fs.readFileSync(path.join(app.getPath("userData"), "profile.json"), "utf-8")
    ) as ProfileData;
    const store = defaultStore();
    store.data = { ...legacy };
    delete store.data.resumePath;
    return store;
  } catch {
    return defaultStore();
  }
}

export function saveStore(store: Store): void {
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), "utf-8");
}

ipcMain.handle("store:load", () => loadStore());
ipcMain.handle("store:save", (_event, store: Store) => {
  saveStore(store);
  return true;
});
