// Text similarity, used to decide whether something a document says is
// already in the profile or is genuinely new (see agents/reconcile.ts).
//
// Exact string comparison is far too strict for resume prose — "Sr. Software
// Engineer, Acme Inc." and "Senior Software Engineer at Acme" are the same
// job. So entries are compared by embedding vector: Ollama's embedding model
// maps each string to a vector, and the cosine of two vectors is how close
// their meanings are.
//
// The embedding model is a separate, small pull from the chat model and may
// not be present (or Ollama may not be running at all, e.g. on a Claude-only
// setup), so every path here degrades to a lexical word/character-overlap
// score instead of failing. The two scales are not comparable, hence the
// per-mode thresholds below.

import type { ProgressSink } from "./types";

/** Small, fast, and the conventional default embedding model on Ollama. */
export const DEFAULT_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

/** Generous: the first call may have to load the model into memory. */
const EMBED_TIMEOUT_MS = 30000;

/** Embedding inputs are identity strings ("title at company"), not documents —
 * anything past this is noise for a same-or-not decision. */
const MAX_EMBED_CHARS = 800;

export type SimilarityMode = "embedding" | "lexical";

/** What counts as "the same thing" per comparison, per mode. Entries are
 * matched loosely (a rephrased job title should still match), while skills
 * and languages are matched strictly — "TypeScript" and "JavaScript" embed
 * closely, and wrongly dropping a skill is worse than listing a near
 * duplicate the user can delete in one click. */
const THRESHOLDS: Record<SimilarityMode, Record<SimilarityKind, number>> = {
  embedding: { entry: 0.8, education: 0.82, bullet: 0.86, summary: 0.8, term: 0.93 },
  lexical: { entry: 0.55, education: 0.55, bullet: 0.62, summary: 0.5, term: 0.85 },
};

export type SimilarityKind = "entry" | "education" | "bullet" | "summary" | "term";

export interface Similarity {
  mode: SimilarityMode;
  /** 0..1, higher is closer. Strings outside the pre-embedded corpus fall
   * back to the lexical score rather than erroring. */
  score(a: string, b: string): number;
  /** True when the two strings should be treated as the same thing. */
  matches(a: string, b: string, kind: SimilarityKind): boolean;
}

function prepare(text: string): string {
  return text.trim().slice(0, MAX_EMBED_CHARS);
}

/** Unit-normalises in place so cosine similarity is a plain dot product. */
function normalizeVector(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const len = Math.sqrt(sum);
  return len > 0 ? vec.map((v) => v / len) : vec;
}

function dot(a: number[], b: number[]): number {
  let out = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) out += a[i] * b[i];
  return out;
}

/** Batch-embeds via Ollama's `/api/embed`. Returns null — never throws — when
 * Ollama is unreachable, the model isn't pulled, or the reply is malformed,
 * which is the caller's signal to fall back to lexical scoring. */
export async function embedTexts(
  host: string,
  model: string,
  texts: string[]
): Promise<number[][] | null> {
  if (!texts.length) return [];
  try {
    const res = await fetch(`${host}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const vectors: unknown = body?.embeddings;
    if (!Array.isArray(vectors) || vectors.length !== texts.length) return null;
    if (!vectors.every((v) => Array.isArray(v) && v.length > 0)) return null;
    return (vectors as number[][]).map(normalizeVector);
  } catch {
    return null;
  }
}

/** Whether the embedding model is already pulled — checked before a merge so
 * the user waits on a comparison, never on a model download. */
export async function embedModelReady(host: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const body = await res.json();
    const names: string[] = Array.isArray(body?.models)
      ? body.models.map((m: { name: string }) => m.name)
      : [];
    const withTag = model.includes(":") ? model : `${model}:latest`;
    return names.includes(model) || names.includes(withTag);
  } catch {
    return false;
  }
}

/** Pulls the embedding model if it's missing. Fire-and-forget from the launch
 * bootstrap: it's a small download next to the chat model, and having it
 * already there is what makes the first document merge a semantic one. */
export async function ensureEmbedModel(host: string, model = DEFAULT_EMBED_MODEL): Promise<void> {
  if (await embedModelReady(host, model)) return;
  try {
    const res = await fetch(`${host}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: false }),
    });
    await res.text().catch(() => "");
  } catch {
    // Nothing to do — merges fall back to lexical comparison.
  }
}

// --- Lexical fallback ---

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function trigrams(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i + 3 <= clean.length; i++) out.add(clean.slice(i, i + 3));
  return out;
}

/** Sørensen–Dice: 2×overlap / combined size. Tolerates the length differences
 * between a terse profile entry and a wordier line in a document. */
function dice<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/** Word overlap and character-trigram overlap, whichever is more generous —
 * the first catches reordering ("Acme, Engineer" vs "Engineer at Acme"), the
 * second catches spelling and abbreviation drift ("B.S." vs "BS"). */
export function lexicalSimilarity(a: string, b: string): number {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return 0;
  if (left === right) return 1;
  return Math.max(
    dice(new Set(words(left)), new Set(words(right))),
    dice(trigrams(left), trigrams(right))
  );
}

/** Embeds the whole corpus in one request up front, so scoring afterwards is
 * pure arithmetic — a merge makes at most one network call regardless of how
 * many pairs get compared. Falls back to lexical scoring if that call can't
 * be made. */
export async function createSimilarity(
  host: string,
  model: string,
  corpus: string[],
  onProgress?: ProgressSink
): Promise<Similarity> {
  const unique = Array.from(new Set(corpus.map(prepare).filter(Boolean)));

  let vectors: Map<string, number[]> | null = null;
  if (unique.length && (await embedModelReady(host, model))) {
    onProgress?.({ stage: "embedding", model, entries: unique.length });
    const embedded = await embedTexts(host, model, unique);
    if (embedded) vectors = new Map(unique.map((text, i) => [text, embedded[i]]));
  }

  const mode: SimilarityMode = vectors ? "embedding" : "lexical";

  function score(a: string, b: string): number {
    const left = prepare(a);
    const right = prepare(b);
    if (!left || !right) return 0;
    if (left.toLowerCase() === right.toLowerCase()) return 1;
    const va = vectors?.get(left);
    const vb = vectors?.get(right);
    if (va && vb) return dot(va, vb);
    return lexicalSimilarity(left, right);
  }

  return {
    mode,
    score,
    matches: (a, b, kind) => score(a, b) >= THRESHOLDS[mode][kind],
  };
}
