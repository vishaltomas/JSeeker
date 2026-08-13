import { Briefcase, GraduationCap } from "lucide-react";
import type { StructuredResume } from "../types";
import { cx } from "../ui";

/** A career milestone — a job or a course of study — placed on the timeline.
 * Derived from the Experience and Education sections rather than stored: the
 * timeline is a view of them, so editing either one moves the entry here. */
interface TimelineEntry {
  id: string;
  kind: "experience" | "education";
  title: string;
  subtitle: string;
  /** Months since year 0, for sorting; null when the date couldn't be read. */
  start: number | null;
  end: number | null;
  /** Whatever the user actually typed, shown as-is. */
  startLabel: string;
  endLabel: string;
  detail: string[];
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const ONGOING = Number.POSITIVE_INFINITY;

/** Dates on a resume are freeform ("Jan 2022", "2022-01", "03/2019", "2020",
 * "Present"), so this reads the common shapes and gives up quietly on
 * anything else — an unreadable date sinks the entry to the bottom instead of
 * breaking the ordering. Returns months since year 0. */
export function parseWhen(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  if (/^(present|current|now|ongoing|to date|till date)$/.test(text)) return ONGOING;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})/);
  if (iso) return Number(iso[1]) * 12 + Math.min(11, Math.max(0, Number(iso[2]) - 1));

  const named = text.match(/([a-z]{3,})\.?\s*,?\s*(\d{4})/);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3));
    if (month >= 0) return Number(named[2]) * 12 + month;
  }

  const numeric = text.match(/^(\d{1,2})[-/](\d{4})$/);
  if (numeric) return Number(numeric[2]) * 12 + Math.min(11, Math.max(0, Number(numeric[1]) - 1));

  const year = text.match(/(\d{4})/);
  return year ? Number(year[1]) * 12 : null;
}

function nowInMonths(): number {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
}

/** "2 yrs 3 mos" — inclusive of both end months, the way resumes count. */
function formatDuration(start: number | null, end: number | null): string {
  if (start === null || end === null || start === ONGOING) return "";
  const finishedAt = end === ONGOING ? nowInMonths() : end;
  const months = finishedAt - start + 1;
  if (months <= 0) return "";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [
    years ? `${years} yr${years === 1 ? "" : "s"}` : null,
    rest ? `${rest} mo${rest === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function rangeLabel(entry: TimelineEntry): string {
  const parts = [entry.startLabel.trim(), entry.endLabel.trim()].filter(Boolean);
  if (!parts.length) return "Date not set";
  return parts.join(" — ");
}

/** Most recent first: ongoing roles lead, then by end date, then by start.
 * Entries with no readable date go last, in the order the user has them. */
function toEntries(resume: StructuredResume): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...resume.experience.map((e) => ({
      id: e.id,
      kind: "experience" as const,
      title: e.title.trim() || "Untitled role",
      subtitle: e.company.trim(),
      start: parseWhen(e.startDate),
      end: parseWhen(e.endDate),
      startLabel: e.startDate,
      endLabel: e.endDate,
      detail: e.bullets.filter((b) => b.trim()),
    })),
    ...resume.education.map((e) => ({
      id: e.id,
      kind: "education" as const,
      title: [e.degree.trim(), e.field.trim()].filter(Boolean).join(", ") || "Studies",
      subtitle: e.school.trim(),
      start: parseWhen(e.startDate),
      end: parseWhen(e.endDate),
      startLabel: e.startDate,
      endLabel: e.endDate,
      detail: [],
    })),
  ];

  // Compared rather than subtracted: an ongoing role's date is Infinity, and
  // Infinity - Infinity is NaN, which would scramble the sort.
  const rank = (entry: TimelineEntry): number => entry.end ?? entry.start ?? -1;
  return entries.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(b) > rank(a) ? 1 : -1;
    const [sa, sb] = [a.start ?? -1, b.start ?? -1];
    if (sa !== sb) return sb > sa ? 1 : -1;
    return 0;
  });
}

interface ProfileTimelineProps {
  resume: StructuredResume;
}

export function ProfileTimeline({ resume }: ProfileTimelineProps) {
  const entries = toEntries(resume);

  if (!entries.length) {
    return (
      <p className="text-xs text-ink-faint">
        Nothing to plot yet — add a role under Work experience or a course under Education and it
        appears here in order.
      </p>
    );
  }

  return (
    <div className="relative py-2">
      {/* The spine. Sits behind the nodes, which punch through it with their
          own background. */}
      <div className="absolute bottom-2 left-[13px] top-2 w-px bg-gradient-to-b from-accent via-accent/40 to-transparent md:left-1/2 md:-translate-x-1/2" />

      {entries.map((entry, index) => {
        // Alternating sides is a wide-window luxury; below `md` everything
        // stacks to the right of a single spine so cards stay readable.
        const onLeft = index % 2 === 0;
        const duration = formatDuration(entry.start, entry.end);
        const Icon = entry.kind === "experience" ? Briefcase : GraduationCap;

        return (
          <div key={`${entry.kind}-${entry.id}`} className="relative mb-4 pl-9 md:grid md:grid-cols-2 md:gap-x-8 md:pl-0">
            <div
              className={cx(
                "md:col-start-1",
                onLeft ? "md:pr-0 md:text-right" : "md:col-start-2 md:row-start-1"
              )}
            >
              <div className="rounded-lg border border-line bg-surface-2 p-3.5">
                <div
                  className={cx(
                    "mb-1.5 flex items-center gap-2",
                    onLeft && "md:flex-row-reverse"
                  )}
                >
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-white">
                    {rangeLabel(entry)}
                  </span>
                  {duration && <span className="text-[11px] text-ink-faint">{duration}</span>}
                </div>
                <h3 className="text-[13px] font-bold leading-snug">{entry.title}</h3>
                {entry.subtitle && <p className="text-xs text-ink-soft">{entry.subtitle}</p>}
                {entry.detail.length > 0 && (
                  <ul
                    className={cx(
                      "mt-2 list-disc space-y-1 pl-4 text-[11px] text-ink-faint",
                      // Right-aligned text needs its markers inside the box,
                      // otherwise they hang off the far side of the card.
                      onLeft && "md:list-inside md:pl-0"
                    )}
                  >
                    {entry.detail.slice(0, 3).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                    {entry.detail.length > 3 && (
                      <li className="italic">+{entry.detail.length - 3} more in Work experience</li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            {/* Node: pinned to the spine, centred on the card's date badge. */}
            <span className="absolute left-0 top-3.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-line bg-surface-5 text-accent md:left-1/2 md:-translate-x-1/2">
              <Icon size={13} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
