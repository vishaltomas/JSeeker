import { useState } from "react";
import type { Job } from "../types";

export function useJobs() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("Search to find open roles.");
  const [jobs, setJobs] = useState<Job[]>([]);

  async function search(): Promise<void> {
    const q = query.trim();
    const loc = location.trim();
    setStatus("Searching…");
    setJobs([]);
    try {
      const results = await window.api.searchJobs(q, loc);
      if (!results.length) {
        setStatus("No jobs found. Try a different search.");
        return;
      }
      setStatus(`${results.length} result${results.length === 1 ? "" : "s"}.`);
      setJobs(results);
    } catch (err) {
      setStatus("Search failed: " + (err as Error).message);
    }
  }

  return { query, setQuery, location, setLocation, status, jobs, search };
}
