import type { FormEvent } from "react";
import { useJobs } from "../hooks/useJobs";
import { JobCard } from "./JobCard";
import { btn, btnPrimary, cx, urlInput, viewSection } from "../ui";

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
    <section className={viewSection(visible)}>
      <div className="flex items-center gap-3 border-b border-line-subtle px-6 py-3.5">
        <button className={btn} onClick={onBack}>
          ← Back
        </button>
        <form className="flex flex-1 gap-2" onSubmit={submit}>
          <input
            className={cx(urlInput, "flex-1")}
            placeholder="Search jobs — e.g. frontend, python, product designer…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <input
            className={cx(urlInput, "w-[200px] flex-none")}
            placeholder="Location (needs Adzuna)"
            autoComplete="off"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button type="submit" className={btnPrimary}>
            Search
          </button>
        </form>
      </div>
      <div className="px-6 py-2.5 text-xs text-ink-muted">{status}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-6">
        {jobs.map((job) => (
          <JobCard key={job.url} job={job} onOpen={onOpenJob} />
        ))}
      </div>
    </section>
  );
}
