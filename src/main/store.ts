import { app, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";

export type ProfileData = Record<string, string>;

export interface ProfileRecord {
  id: string;
  name: string;
  data: ProfileData;
}

export type Provider = "ollama" | "claude";

export interface Settings {
  provider: Provider;
  ollamaModel: string;
  ollamaHost: string;
  anthropicApiKey: string;
  anthropicModel: string;
  adzunaAppId: string;
  adzunaAppKey: string;
  adzunaCountry: string;
  serpApiKey: string;
}

export interface Store {
  activeId: string;
  profiles: ProfileRecord[];
  settings: Settings;
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
    adzunaAppId: s?.adzunaAppId ?? "",
    adzunaAppKey: s?.adzunaAppKey ?? "",
    adzunaCountry: s?.adzunaCountry ?? "us",
    serpApiKey: s?.serpApiKey ?? "",
  };
}

function emptyProfileData(): ProfileData {
  const data: ProfileData = {};
  for (const key of FIELD_KEYS) data[key] = "";
  return data;
}

function defaultStore(): Store {
  return {
    activeId: "default",
    profiles: [{ id: "default", name: "Default", data: emptyProfileData() }],
    settings: normalizeSettings(),
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
      for (const p of parsed.profiles) p.data = { ...emptyProfileData(), ...p.data };
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

ipcMain.handle("store:load", () => loadStore());
ipcMain.handle("store:save", (_event, store: Store) => {
  saveStore(store);
  return true;
});
