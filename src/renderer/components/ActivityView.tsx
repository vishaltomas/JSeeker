import { useExtensionActivity } from "../hooks/useExtensionActivity";
import type { ExtensionActivity } from "../types";
import { cx, viewSection } from "../ui";

interface ActivityViewProps {
  visible: boolean;
}

type Level = "ok" | "warn" | "error";

const DOT_COLOR: Record<Level, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  error: "bg-status-error",
};

/** What the app can say about one attempt, and how alarmed to look about it.
 * "Filled 0" is deliberately a warning rather than a success: the run worked
 * but the user got nothing, and that's the case worth noticing. */
function describe(entry: ExtensionActivity): { level: Level; text: string } {
  if (entry.state === "error") {
    return { level: "error", text: entry.message || "Something went wrong." };
  }
  if (entry.state === "reading") {
    const fields = entry.fields ?? 0;
    return { level: "warn", text: `Reading ${fields} ${fields === 1 ? "field" : "fields"}…` };
  }
  if (entry.applied === undefined) {
    const planned = entry.planned ?? 0;
    return planned
      ? { level: "ok", text: `Answered ${planned} of ${entry.fields ?? 0} fields` }
      : { level: "warn", text: "Nothing here the model could answer" };
  }
  return entry.applied
    ? { level: "ok", text: `Filled ${entry.applied} of ${entry.fields ?? 0} fields` }
    : { level: "warn", text: "Nothing filled" };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function ActivityRow({ entry }: { entry: ExtensionActivity }) {
  const { level, text } = describe(entry);
  const running = entry.state === "reading";

  return (
    <li className="flex items-baseline gap-3 border-b border-line-subtle py-3 last:border-b-0">
      <span
        className={cx(
          "relative top-[-1px] h-2 w-2 flex-shrink-0 rounded-full",
          DOT_COLOR[level],
          running && "animate-pulse"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">{text}</p>
        {(entry.title || entry.url) && (
          <p className="mt-0.5 truncate text-xs text-ink-faint">
            {entry.title}
            {entry.title && entry.url && " · "}
            {entry.url && (
              <button
                className="cursor-pointer hover:text-accent-light hover:underline"
                onClick={() => window.api.openExternal(entry.url!)}
                title={entry.url}
              >
                {hostOf(entry.url)}
              </button>
            )}
          </p>
        )}
      </div>
      <span className="flex-shrink-0 text-[11px] text-ink-faint">
        {new Date(entry.at).toLocaleTimeString()}
      </span>
    </li>
  );
}

/** What the browser extension has been doing: one row per autofill attempt,
 * newest first. The work itself happens while the user is over in their
 * browser, so this is where they can come back and see whether it landed —
 * and, when it didn't, why. In memory for the current session only. */
export function ActivityView({ visible }: ActivityViewProps) {
  const activity = useExtensionActivity();

  return (
    <section className={viewSection(visible)}>
      <div className="border-b border-line-subtle px-6 py-4">
        <h1 className="text-xl font-bold">Auto Tracker</h1>
        <p className="mt-0.5 text-xs text-ink-faint">
          Form fills run from the browser extension, this session.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-4">
        {activity.length === 0 ? (
          <p className="max-w-lg text-[13px] text-ink-faint">
            Nothing yet. With JSeeker running, click the extension's icon on a job
            application page — it sends the page here, the model works out what each field
            is asking for, and every attempt is tracked in this list. Set the extension up
            in Settings → Extension.
          </p>
        ) : (
          <ul className="max-w-2xl">
            {activity.map((entry) => (
              <ActivityRow entry={entry} key={entry.id} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
