import { app, ipcMain } from "electron";
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

/** A question this application asked and the answer that was given, pulled
 * out of the conversation so it can be added to the profile and reused. The
 * point of the whole feature: answer "why do you want this role" once, and
 * have it available the next time a form asks. */
export interface SessionAnswer {
  key: string;
  value: string;
  /** Whether the user has accepted this into their profile. Kept so the
   * History view can show what's already been reused rather than offering
   * the same answer forever. */
  saved: boolean;
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
  answers: SessionAnswer[];
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
    answers: [],
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

/** Replaces a session's extracted answers, preserving the `saved` flag for
 * any the user has already accepted — re-running extraction shouldn't offer
 * back something they've already put in their profile. */
export function setAnswers(id: string, answers: { key: string; value: string }[]): void {
  const session = getSession(id);
  if (!session) return;
  const alreadySaved = new Set(session.answers.filter((a) => a.saved).map((a) => a.key));
  session.answers = answers.map((a) => ({ ...a, saved: alreadySaved.has(a.key) }));
  save();
}

export function markAnswersSaved(id: string, keys: string[]): void {
  const session = getSession(id);
  if (!session) return;
  const accepted = new Set(keys);
  for (const answer of session.answers) {
    if (accepted.has(answer.key)) answer.saved = true;
  }
  save();
}

export function deleteSession(id: string): void {
  const all = load();
  const index = all.findIndex((s) => s.id === id);
  if (index >= 0) {
    all.splice(index, 1);
    save();
  }
}

ipcMain.handle("sessions:list", () => listSessions());
ipcMain.handle("sessions:delete", (_event, id: string) => {
  deleteSession(id);
  return listSessions();
});
ipcMain.handle("sessions:markAnswersSaved", (_event, args: { id: string; keys: string[] }) => {
  markAnswersSaved(args.id, args.keys);
  return listSessions();
});
