import type { Job } from "../types";

interface JobCardProps {
  job: Job;
  onOpen: (url: string) => void;
}

// Job data comes from external sites — JSX text interpolation below renders
// it as plain text nodes (never parsed as markup), the same safety property
// the original DOM version got from using textContent instead of innerHTML.
export function JobCard({ job, onOpen }: JobCardProps) {
  const dateStr = job.date ? new Date(job.date).toLocaleDateString() : "";
  const meta = [job.company, job.location, dateStr].filter(Boolean).join(" · ");

  return (
    <div className="job-card">
      <div className="job-card-top">
        <div>
          <h3 className="job-title">{job.title || "(untitled)"}</h3>
          <p className="job-meta">{meta}</p>
        </div>
        <button className="btn btn-primary job-open" onClick={() => onOpen(job.url)}>
          Open &amp; fill
        </button>
      </div>

      {job.description && <p className="job-desc">{job.description}</p>}

      {job.tags.length > 0 && (
        <div className="job-tags">
          {job.tags.map((tag, i) => (
            <span className="job-tag" key={i}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="job-source">via {job.source}</div>
    </div>
  );
}
