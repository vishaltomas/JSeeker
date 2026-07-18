import { useState } from "react";
import type { Store } from "../../types";
import {
  btnPrimary,
  cx,
  fieldGroup,
  fieldInput,
  fieldLabel,
  panelH2,
  sectionHint,
  statusText,
} from "../../ui";

interface JobSearchPanelProps {
  store: Store;
  persist: (next: Store) => void;
}

export function JobSearchPanel({ store, persist }: JobSearchPanelProps) {
  const [serpApiKey, setSerpApiKey] = useState(store.settings.serpApiKey);
  const [adzunaId, setAdzunaId] = useState(store.settings.adzunaAppId);
  const [adzunaKey, setAdzunaKey] = useState(store.settings.adzunaAppKey);
  const [adzunaCountry, setAdzunaCountry] = useState(store.settings.adzunaCountry || "us");
  const [status, setStatus] = useState("");

  function save(): void {
    persist({
      ...store,
      settings: {
        ...store.settings,
        serpApiKey: serpApiKey.trim(),
        adzunaAppId: adzunaId.trim(),
        adzunaAppKey: adzunaKey.trim(),
        adzunaCountry: adzunaCountry.trim() || "us",
      },
    });
    setStatus("Saved.");
  }

  return (
    <section>
      <h2 className={panelH2}>Job Search — Google Jobs (SerpApi)</h2>
      <p className={sectionHint}>
        Recommended. A SerpApi key taps Google for Jobs, which aggregates LinkedIn, Indeed,
        Glassdoor and company boards into one search. Get a free key at serpapi.com. Honors
        the location field.
      </p>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-serpapi-key">
          SerpApi key
        </label>
        <input
          className={fieldInput}
          id="set-serpapi-key"
          autoComplete="off"
          value={serpApiKey}
          onChange={(e) => setSerpApiKey(e.target.value)}
        />
      </div>

      <h2 className={cx(panelH2, "mt-[22px]")}>Adzuna</h2>
      <p className={sectionHint}>
        Optional. Free Adzuna credentials add keyword + location search (including on-site
        jobs). Get them at developer.adzuna.com. Without any keys here, search uses
        remote-only sources and the location field is ignored.
      </p>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-adzuna-id">
          App ID
        </label>
        <input
          className={fieldInput}
          id="set-adzuna-id"
          autoComplete="off"
          value={adzunaId}
          onChange={(e) => setAdzunaId(e.target.value)}
        />
      </div>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-adzuna-key">
          App Key
        </label>
        <input
          className={fieldInput}
          id="set-adzuna-key"
          autoComplete="off"
          value={adzunaKey}
          onChange={(e) => setAdzunaKey(e.target.value)}
        />
      </div>
      <div className={fieldGroup}>
        <label className={fieldLabel} htmlFor="set-adzuna-country">
          Country code
        </label>
        <input
          className={fieldInput}
          id="set-adzuna-country"
          placeholder="us"
          autoComplete="off"
          value={adzunaCountry}
          onChange={(e) => setAdzunaCountry(e.target.value)}
        />
      </div>
      <button className={btnPrimary} onClick={save}>
        Save
      </button>
      <p className={statusText}>{status}</p>
    </section>
  );
}
