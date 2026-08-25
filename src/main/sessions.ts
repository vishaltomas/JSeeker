import { app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";

/**
 * A record of applying for one job through the browser extension.
 *
 * Kept in its own file rather than in store.json: a profile is small and
 * rewritten on every keystroke in the Profile view, while this grows with
 * every conversation and every drafted document. Mixing them would mean
 * rewriting every cover letter you've ever drafted each time you fix a typo
 * in your phone number.
 *
 * Nothing in the desktop UI reads this any more — it is written by the
 * extension server as the user works a posting, and read back by the
 * assistant's `search_applications` / `read_application` tools (see
 * agents/tools.ts) when it needs to remember what was said on one.
 */

/** One turn of the in-page conversation. */
export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  at: number;
}

/** Something the session produced that the user can keep — drafted in the
 * panel, downloadable from there and from the app. */
export interface SessionArtifact {
  id: string;
  kind: "cover-letter" | "resume";
  content: string;
  createdAt: number;
}

export interface ApplicationSession {
  id: string;
  /** The posting's URL, normalized — the identity of the session. */
  url: string;
  host: string;
  title: string;
  startedAt: number;
  updatedAt: number;
  messages: SessionMessage[];
  artifacts: SessionArtifact[];
}

/** Sessions are cheap to keep and useful to look back on, but not unbounded
 * — this is roughly a year of steady applying. */
const MAX_SESSIONS = 300;
/** Long conversations get trimmed from the front; the recent turns are what
 * a person scrolls back to, and the artifacts are kept separately anyway. */
const MAX_MESSAGES = 200;

let sessions: ApplicationSession[] | null = null;

function sessionsPath(): string {
  return path.join(app.getPath("userData"), "sessions.json");
}

function load(): ApplicationSession[] {
  if (sessions) return sessions;
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionsPath(), "utf-8"));
    sessions = Array.isArray(parsed) ? (parsed as ApplicationSession[]) : [];
  } catch {
    // No file yet, or it's unreadable. An unreadable history is worth
    // starting over from — it isn't the user's data of record.
    sessions = [];
  }
  return sessions;
}

function save(): void {
  if (!sessions) return;
  try {
    fs.writeFileSync(sessionsPath(), JSON.stringify(sessions, null, 2), "utf-8");
  } catch (error) {
    console.error("JSeeker: couldn't write sessions.json —", error);
  }
}

/** The identity of a session is the posting, so two visits to the same page
 * continue one session rather than starting a second. The fragment is
 * dropped (it's in-page navigation) but the query string is kept — plenty of
 * job boards put the posting id there. */
function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}

/** Finds the session for a page, or starts one. Called on every message from
 * the panel, so the user never has to declare that they're applying. */
export function openSession(rawUrl: string, title: string): ApplicationSession {
  const all = load();
  const url = normalizeUrl(rawUrl);

  const existing = all.find((s) => s.url === url);
  if (existing) {
    // A page's title can change as a single-page app navigates within it;
    // the most recent non-empty one is the most useful label.
    if (title) existing.title = title;
    existing.updatedAt = Date.now();
    return existing;
  }

  const session: ApplicationSession = {
    id: randomUUID(),
    url,
    host: hostOf(url),
    title: title || hostOf(url) || "Untitled page",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    artifacts: [],
  };
  all.unshift(session);
  if (all.length > MAX_SESSIONS) all.length = MAX_SESSIONS;
  return session;
}

export function recordExchange(
  rawUrl: string,
  title: string,
  question: string,
  answer: string
): void {
  const session = openSession(rawUrl, title);
  const at = Date.now();
  session.messages.push({ role: "user", content: question, at });
  session.messages.push({ role: "assistant", content: answer, at });
  if (session.messages.length > MAX_MESSAGES) {
    session.messages.splice(0, session.messages.length - MAX_MESSAGES);
  }
  session.updatedAt = at;
  save();
}

export function recordArtifact(
  rawUrl: string,
  title: string,
  kind: SessionArtifact["kind"],
  content: string
): SessionArtifact {
  const session = openSession(rawUrl, title);
  const artifact: SessionArtifact = {
    id: randomUUID(),
    kind,
    content,
    createdAt: Date.now(),
  };
  session.artifacts.push(artifact);
  session.updatedAt = artifact.createdAt;
  save();
  return artifact;
}

export function listSessions(): ApplicationSession[] {
  return load();
}

export function getSession(id: string): ApplicationSession | undefined {
  return load().find((s) => s.id === id);
}
