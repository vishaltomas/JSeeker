import { app, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";

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

/** The structured parts of a resume that don't fit the flat `ProfileData`
 * bag (arrays of entries, not single strings) — edited in ResumeView.tsx,
 * pre-populated (best-effort) from the onboarding PDF extraction. */
export interface StructuredResume {
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
}

export interface ProfileRecord {
  id: string;
  name: string;
  data: ProfileData;
  resume: StructuredResume;
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

/** A local account gate — see src/main/account.ts. Not a security boundary
 * against filesystem access (store.json is plaintext JSON like everything
 * else here); it hashes the password (scrypt + salt) so it's at least never
 * stored/compared in plaintext, and gates casual access to the running app. */
export interface Account {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  onboarded: boolean;
}

export interface Store {
  activeId: string;
  profiles: ProfileRecord[];
  settings: Settings;
  account: Account | null;
}

const FIELD_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "linkedin",
  "github",
  "website",
  "currentTitle",
  "currentCompany",
  "resumePath",
];

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

function emptyProfileData(): ProfileData {
  const data: ProfileData = {};
  for (const key of FIELD_KEYS) data[key] = "";
  return data;
}

export function emptyStructuredResume(): StructuredResume {
  return { summary: "", experience: [], education: [], skills: [] };
}

function defaultStore(): Store {
  return {
    activeId: "default",
    profiles: [
      { id: "default", name: "Default", data: emptyProfileData(), resume: emptyStructuredResume() },
    ],
    settings: normalizeSettings(),
    account: null,
  };
}

function storePath(): string {
  return path.join(app.getPath("userData"), "store.json");
}

export function loadStore(): Store {
  // Preferred: the multi-profile store.
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf-8")) as Store;
    if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length) {
      parsed.settings = normalizeSettings(parsed.settings);
      parsed.account = parsed.account ?? null;
      for (const p of parsed.profiles) {
        p.data = { ...emptyProfileData(), ...p.data };
        p.resume = p.resume ?? emptyStructuredResume();
      }
      if (!parsed.profiles.some((p) => p.id === parsed.activeId)) {
        parsed.activeId = parsed.profiles[0].id;
      }
      return parsed;
    }
  } catch {
    /* fall through to migration / default */
  }

  // Migrate a legacy single profile.json if it exists.
  try {
    const legacy = JSON.parse(
      fs.readFileSync(path.join(app.getPath("userData"), "profile.json"), "utf-8")
    );
    const store = defaultStore();
    store.profiles[0].data = { ...emptyProfileData(), ...legacy };
    return store;
  } catch {
    return defaultStore();
  }
}

export function saveStore(store: Store): void {
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), "utf-8");
}

export function activeProfileData(store: Store): ProfileData {
  const record = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
  return record ? record.data : emptyProfileData();
}

export function activeProfileRecord(store: Store): ProfileRecord {
  return store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
}

ipcMain.handle("store:load", () => loadStore());
ipcMain.handle("store:save", (_event, store: Store) => {
  saveStore(store);
  return true;
});
