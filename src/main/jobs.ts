import { ipcMain } from "electron";
import { searchJobs } from "../web_loader/web_loader";
import { loadStore } from "./store";

// Job search via the web loader. Adzuna credentials (if any) come from settings.
ipcMain.handle(
  "jobs:search",
  (_event, args: { query: string; location?: string }) => {
    const s = loadStore().settings;
    return searchJobs(args.query, {
      location: args.location,
      adzuna: {
        appId: s.adzunaAppId,
        appKey: s.adzunaAppKey,
        country: s.adzunaCountry,
      },
      serpApiKey: s.serpApiKey,
    });
  }
);
