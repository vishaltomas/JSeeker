import type { FormEvent } from "react";
import { useJobs } from "../hooks/useJobs";
import { JobCard } from "./JobCard";

interface JobsViewProps {
  visible: boolean;
  onBack: () => void;
  onOpenJob: (url: string) => void;
}

export function JobsView({ visible, onBack, onOpenJob }: JobsViewProps) {
  const { query, setQuery, location, setLocation, status, jobs, search } = useJobs();

  function submit(e: FormEvent): void {
    e.preventDefault();
    search();
  }

  return (
    <section className={visible ? "view" : "view hidden"}>
      <div className="jobs-head">
        <button className="btn" onClick={onBack}>
          ← Back
        </button>
        <form className="jobs-search" onSubmit={submit}>
          <input
            className="url-input"
            placeholder="Search jobs — e.g. frontend, python, product designer…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <input
            className="url-input jobs-location"
            placeholder="Location (needs Adzuna)"
            autoComplete="off"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
      </div>
      <div className="jobs-status">{status}</div>
      <div className="jobs-results">
        {jobs.map((job) => (
          <JobCard key={job.url} job={job} onOpen={onOpenJob} />
        ))}
      </div>
    </section>
  );
}
