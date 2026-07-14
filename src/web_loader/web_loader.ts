// Job search "web loader": pulls listings from free public job APIs, normalizes
// them into a common shape, and merges them. Runs in the main process (Node
// fetch). Sources are pluggable — add a function that returns Job[] and include
// it in SOURCES. We deliberately use structured JSON endpoints rather than
// scraping protected boards (LinkedIn/Indeed), which block bots and forbid it.

export interface Job {
  title: string;
  company: string;
  location: string;
  url: string;
  tags: string[];
  source: string;
  date: string; // ISO 8601 (or "" if unknown)
  description: string;
}

export interface AdzunaConfig {
  appId: string;
  appKey: string;
  country: string; // ISO country code, e.g. "us", "gb", "in"
}

export interface SearchOptions {
  location?: string;
  adzuna?: AdzunaConfig;
  serpApiKey?: string;
}

const USER_AGENT = "JSeeker/1.0 (+https://localhost) job-search";

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;|&#0*38;/g, "&")
    .replace(/&lt;|&#0*60;/g, "<")
    .replace(/&gt;|&#0*62;/g, ">")
    .replace(/&#0*39;|&rsquo;|&lsquo;|&apos;/g, "'")
    .replace(/&quot;|&#0*34;|&ldquo;|&rdquo;/g, '"');
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Relevance score for a job against the query terms. Title matches weigh most,
 * then tags. Descriptions are deliberately ignored — matching body text is what
 * lets unrelated jobs (e.g. a sales role that merely mentions "software") slip
 * through. A score of 0 means the job is not relevant and should be dropped.
 */
function relevanceScore(job: Job, terms: string[]): number {
  const title = job.title.toLowerCase();
  const tags = job.tags.join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 5;
    else if (tags.includes(term)) score += 2;
  }
  return score;
}

// --- Sources ---

// Remotive — remote jobs, supports server-side search.
async function fromRemotive(query: string): Promise<Job[]> {
  const search = query ? `&search=${encodeURIComponent(query)}` : "";
  const data = await fetchJson(
    `https://remotive.com/api/remote-jobs?limit=50${search}`
  );
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j: any) => ({
    title: j.title ?? "",
    company: j.company_name ?? "",
    location: j.candidate_required_location || "Remote",
    url: j.url ?? "",
    tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : [],
    source: "Remotive",
    date: j.publication_date ?? "",
    description: truncate(stripHtml(j.description ?? ""), 280),
  }));
}

// Arbeitnow — returns recent jobs (no server-side search). We normalize them
// all; the relevance filter in searchJobs handles matching.
async function fromArbeitnow(_query: string): Promise<Job[]> {
  const data = await fetchJson("https://www.arbeitnow.com/api/job-board-api");
  const jobs = Array.isArray(data?.data) ? data.data : [];
  return jobs.map((j: any) => ({
    title: j.title ?? "",
    company: j.company_name ?? "",
    location: j.location || (j.remote ? "Remote" : ""),
    url: j.url ?? "",
    tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : [],
    source: "Arbeitnow",
    date: j.created_at ? new Date(j.created_at * 1000).toISOString() : "",
    description: truncate(stripHtml(j.description ?? ""), 280),
  }));
}

// RemoteOK — every job carries a rich `tags` array (python, react, design…),
// which makes it the best source for skill/keyword matching. The first array
// element is a legal notice (no `position`), so we skip it.
async function fromRemoteOK(_query: string): Promise<Job[]> {
  const data = await fetchJson("https://remoteok.com/api");
  const list = Array.isArray(data) ? data : [];
  return list
    .filter((j: any) => j && j.position && j.url)
    .map((j: any) => ({
      title: j.position ?? "",
      company: j.company ?? "",
      location: j.location || "Remote",
      url: j.url ?? "",
      tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : [],
      source: "RemoteOK",
      date: j.date ?? "",
      description: truncate(stripHtml(j.description ?? ""), 280),
    }));
}

// Jobicy — supports real server-side keyword search via `tag`, so results are
// already relevant. This is the primary source for keyword queries.
async function fromJobicy(query: string): Promise<Job[]> {
  const tag = query ? `&tag=${encodeURIComponent(query)}` : "";
  const data = await fetchJson(
    `https://jobicy.com/api/v2/remote-jobs?count=50${tag}`
  );
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j: any) => ({
    title: j.jobTitle ?? "",
    company: j.companyName ?? "",
    location: j.jobGeo || "Remote",
    url: j.url ?? "",
    tags: Array.isArray(j.jobIndustry) ? j.jobIndustry.slice(0, 6) : [],
    source: "Jobicy",
    date: j.pubDate ?? "",
    description: truncate(stripHtml(j.jobExcerpt ?? ""), 280),
  }));
}

// Adzuna — real keyword + location search (includes on-site jobs), but needs a
// free app id/key. Enabled only when credentials are supplied in Settings.
async function fromAdzuna(
  query: string,
  location: string,
  cfg: AdzunaConfig
): Promise<Job[]> {
  const country = (cfg.country || "us").toLowerCase();
  const params = new URLSearchParams({
    app_id: cfg.appId,
    app_key: cfg.appKey,
    results_per_page: "50",
    "content-type": "application/json",
  });
  if (query) params.set("what", query);
  if (location) params.set("where", location);

  const data = await fetchJson(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`
  );
  const jobs = Array.isArray(data?.results) ? data.results : [];
  return jobs.map((j: any) => ({
    title: j.title ?? "",
    company: j.company?.display_name ?? "",
    location: j.location?.display_name ?? "",
    url: j.redirect_url ?? "",
    tags: j.category?.label ? [j.category.label] : [],
    source: "Adzuna",
    date: j.created ?? "",
    description: truncate(stripHtml(j.description ?? ""), 280),
  }));
}

// SerpApi "Google Jobs" engine — taps Google for Jobs, which aggregates
// LinkedIn, Indeed, Glassdoor and company boards into structured JSON. Needs a
// SerpApi key (free tier available). Enabled only when a key is supplied.
async function fromSerpApi(
  query: string,
  location: string,
  apiKey: string
): Promise<Job[]> {
  const params = new URLSearchParams({
    engine: "google_jobs",
    q: query || "jobs",
    api_key: apiKey,
  });
  if (location) params.set("location", location);

  const data = await fetchJson(
    `https://serpapi.com/search.json?${params.toString()}`
  );
  const results = Array.isArray(data?.jobs_results) ? data.jobs_results : [];
  return results.map((j: any) => {
    const apply =
      Array.isArray(j.apply_options) && j.apply_options.length
        ? j.apply_options[0]
        : null;
    const ext = j.detected_extensions ?? {};
    const board = (j.via ?? "").replace(/^via\s+/i, "").trim();
    return {
      title: j.title ?? "",
      company: j.company_name ?? "",
      location: j.location || location || "",
      url: apply?.link || j.share_link || "",
      tags: [board, ext.schedule_type].filter(Boolean),
      source: "Google Jobs",
      // posted_at is relative ("3 days ago"), not ISO — keep it out of sorting.
      date: "",
      description: truncate(stripHtml(j.description ?? ""), 280),
    };
  });
}

// Sources that keyword-search server-side — their results are trusted as-is.
const SEARCH_SOURCES: Array<(query: string) => Promise<Job[]>> = [fromJobicy];

// Sources that only expose recent jobs (no search) — filtered client-side by
// relevance so unrelated roles are dropped.
const RECENT_SOURCES: Array<(query: string) => Promise<Job[]>> = [
  fromRemoteOK,
  fromRemotive,
  fromArbeitnow,
];

/**
 * Search all sources in parallel, merge, de-duplicate by URL, then filter and
 * rank by relevance to the query (title/tag matches only) so unrelated jobs are
 * dropped. With no query, returns the most recent jobs. A failing source is
 * skipped rather than failing the whole search.
 */
export async function searchJobs(
  query: string,
  options: SearchOptions = {},
  limit = 60
): Promise<Job[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  // Server-side keyword sources. Adzuna is added only when configured.
  const searchFns: Array<() => Promise<Job[]>> = SEARCH_SOURCES.map(
    (fn) => () => fn(query)
  );
  const adz = options.adzuna;
  if (adz && adz.appId && adz.appKey) {
    searchFns.push(() => fromAdzuna(query, options.location ?? "", adz));
  }
  if (options.serpApiKey) {
    const key = options.serpApiKey;
    searchFns.push(() => fromSerpApi(query, options.location ?? "", key));
  }

  const [searchSettled, recentSettled] = await Promise.all([
    Promise.allSettled(searchFns.map((fn) => fn())),
    Promise.allSettled(RECENT_SOURCES.map((fn) => fn(query))),
  ]);

  const collect = (settled: PromiseSettledResult<Job[]>[]): Job[] => {
    const out: Job[] = [];
    for (const r of settled) if (r.status === "fulfilled") out.push(...r.value);
    return out;
  };

  const searched = collect(searchSettled); // already keyword-matched, trusted
  let recent = collect(recentSettled);

  // Recent-only sources aren't keyword-searched — filter + rank by relevance.
  if (terms.length) {
    recent = recent
      .map((job) => ({ job, score: relevanceScore(job, terms) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.job);
  }

  // Server-matched results first, then the best recent matches.
  const merged = [...searched, ...recent];

  const seen = new Set<string>();
  const deduped = merged.filter((j) => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  if (!terms.length) {
    deduped.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  // Decode HTML entities that appear in titles/companies from some sources.
  return deduped.slice(0, limit).map((j) => ({
    ...j,
    title: decodeEntities(j.title),
    company: decodeEntities(j.company),
  }));
}
