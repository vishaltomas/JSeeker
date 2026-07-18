import type { Job } from "../types";
import { btnPrimary, cx } from "../ui";

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
    <div className="rounded-[10px] border border-line bg-surface-2 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{job.title || "(untitled)"}</h3>
          <p className="mt-[3px] text-xs text-ink-muted">{meta}</p>
        </div>
        <button className={cx(btnPrimary, "flex-shrink-0")} onClick={() => onOpen(job.url)}>
          Open &amp; fill
        </button>
      </div>

      {job.description && (
        <p className="mt-2.5 text-[12.5px] leading-normal text-[#b8bcc4]">{job.description}</p>
      )}

      {job.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {job.tags.map((tag, i) => (
            <span
              className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-ink-muted"
              key={i}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 text-[11px] text-ink-faint">via {job.source}</div>
    </div>
  );
}
