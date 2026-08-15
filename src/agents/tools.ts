/**
 * The actions an agent can take, as plain functions.
 *
 * Four groups, in order below:
 *
 *   Store      — the profile (store.json), the application history
 *                (sessions.json) and the builder's documents (resumes/*.resb),
 *                each reached separately rather than through one "read the
 *                store" call, so a tool that only needs the profile can't walk
 *                off with the conversation history.
 *   Documents  — ResumeWriter and CoverLetterWriter, which produce `.resb`
 *                source and refuse to save anything that doesn't parse.
 *   Web        — reading a page or a PDF off the internet, which is how a job
 *                posting gets in front of the model.
 *
 * Every function throws `ToolError` on failure with a message written to be
 * read by whoever called it — a model included. Nothing here is silent: a tool
 * that can't do the thing says which thing and why, rather than returning
 * something empty that reads like an answer.
 *
 * These run in the main process, where the filesystem and the store already
 * live. Nothing in here is exposed over IPC: the renderer has its own handlers
 * for the same data, with the same guards.
 */

import { readFileSync } from "fs";
import * as fs from "fs";
import * as path from "path";
import { PDFParse } from "pdf-parse";

import type { ProfileData, StructuredResume } from "../main/store";
import { loadStore, saveStore } from "../main/store";
import type { ApplicationSession, SessionAnswer } from "../main/sessions";
import { getSession, listSessions } from "../main/sessions";
import type { BuilderFile } from "../main/builderWorkspace";
import {
    EXTENSION,
    freePath,
    inWorkspace,
    listFiles,
    safeStem,
    seedWorkspace,
    workspaceDir,
} from "../main/builderWorkspace";
import { Parser } from "../resume_builder/parser";
import type { ASTNode } from "../resume_builder/types";
import { isLegalArg, KEYWORD_ARGS } from "../resume_builder/schema";
import { joinSections, splitSections } from "../resume_builder/sections";

/** Cap on returned PDF text — a job description or resume fits well inside
 * this, and an unbounded document would otherwise blow up the prompt. */
const MAX_PDF_CHARS = 6000;

/** Same cap for a web page, and for the same reason. It matches what the
 * browser extension already sends as page context (see extension/widget.js),
 * so a posting read through either route arrives the same size. */
const MAX_PAGE_CHARS = 6000;

/** How long to wait on a site before giving up. A job board that hasn't
 * answered in fifteen seconds isn't going to. */
const FETCH_TIMEOUT_MS = 15000;

// create a custom Tool Error
class ToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export { ToolError };

// ---------------------------------------------------------------------------
// Store access
// ---------------------------------------------------------------------------

/**
 * The profile as a tool sees it: what the applicant knows about themselves.
 *
 * Deliberately not the whole `Store`. `settings` holds the Anthropic API key
 * and the extension's sync token, and a tool result is one paste away from a
 * prompt — so the secrets never leave `loadStore()`. Anything a tool can read
 * here is something the model is already told in its system prompt.
 */
export interface ProfileSnapshot {
    /** The open key-value bag: contact details and whatever else was extracted. */
    fields: ProfileData;
    /** Summary, experience, education, skills, languages. */
    resume: StructuredResume;
    /** Paths of the documents the profile was built from. */
    documents: string[];
    onboarded: boolean;
}

/** Reads the profile out of store.json. */
export function ReadProfile(): ProfileSnapshot {
    const store = loadStore();
    return {
        fields: store.data,
        resume: store.resume,
        documents: store.resumeFiles,
        onboarded: store.onboarded,
    };
}

/**
 * Adds to the profile's flat key-value bag.
 *
 * Merges rather than replaces, and — unless `overwrite` is set — leaves any
 * key that already has a value alone. The user's own answer outranks anything
 * a tool worked out about them, which is the same rule the document merge
 * follows (see agents/reconcile.ts). Returns the keys that actually changed,
 * so a caller can report "added notice period" rather than claiming a save
 * that overwrote nothing.
 */
export function UpdateProfile(
    fields: Record<string, string>,
    options: { overwrite?: boolean } = {}
): { updated: string[]; skipped: string[] } {
    const store = loadStore();
    const updated: string[] = [];
    const skipped: string[] = [];

    for (const [rawKey, rawValue] of Object.entries(fields)) {
        const key = rawKey.trim();
        const value = typeof rawValue === "string" ? rawValue.trim() : "";
        if (!key || !value) continue;
        if (store.data[key]?.trim() && !options.overwrite) {
            skipped.push(key);
            continue;
        }
        store.data[key] = value;
        updated.push(key);
    }

    if (updated.length) saveStore(store);
    return { updated, skipped };
}

/** One application, without its message log — enough to pick one out of a
 *  list before reading it in full. */
export interface SessionSummary {
    id: string;
    url: string;
    host: string;
    title: string;
    startedAt: number;
    updatedAt: number;
    messageCount: number;
    artifactCount: number;
    answers: SessionAnswer[];
}

function summarize(session: ApplicationSession): SessionSummary {
    return {
        id: session.id,
        url: session.url,
        host: session.host,
        title: session.title,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        artifactCount: session.artifacts.length,
        answers: session.answers,
    };
}

/**
 * The application history from sessions.json, most recently touched first.
 *
 * Summaries rather than transcripts: the file holds up to 300 sessions of 200
 * messages each, and handing all of that back would bury whatever the caller
 * was actually looking for. Read one in full with `ReadSession`.
 */
export function ReadSessions(limit = 25): SessionSummary[] {
    return [...listSessions()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.max(0, limit))
        .map(summarize);
}

/** One application in full — every message, artifact and extracted answer. */
export function ReadSession(id: string): ApplicationSession {
    const session = getSession(id);
    if (!session) throw new ToolError(`${ReadSession.name} : no session with id ${id}.`);
    return session;
}

/**
 * Finds past applications matching `query`.
 *
 * Searches the posting's title, host and URL, then the conversation and the
 * answers extracted from it — so "notice period" finds the application where
 * that came up, and "stripe" finds the one at Stripe. Plain
 * case-insensitive substring matching: this is a lookup over a few hundred
 * records, not a search engine.
 */
export function SearchSessions(query: string, limit = 10): SessionSummary[] {
    const needle = query.trim().toLowerCase();
    if (!needle) throw new ToolError(`${SearchSessions.name} : nothing to search for.`);

    return listSessions()
        .filter((session) => {
            const haystack = [
                session.title,
                session.host,
                session.url,
                ...session.messages.map((m) => m.content),
                ...session.answers.flatMap((a) => [a.key, a.value]),
            ];
            return haystack.some((text) => text.toLowerCase().includes(needle));
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.max(0, limit))
        .map(summarize);
}

/**
 * Resolves a document name to a path inside the builder's workspace.
 *
 * A caller may name a document either way — `resume`, `resume.resb`, or the
 * absolute path a listing gave it — but everything ends up through
 * `inWorkspace`, the same guard the renderer's handlers use. A name that
 * escapes the folder is refused rather than corrected.
 */
function resolveDocument(name: string): string {
    if (typeof name !== "string" || !name.trim()) {
        throw new ToolError("Which document? Give a name from ListResumeDocuments.");
    }
    const candidate = path.isAbsolute(name)
        ? name
        : path.join(workspaceDir(), name.toLowerCase().endsWith(EXTENSION) ? name : `${name}${EXTENSION}`);
    const resolved = inWorkspace(candidate);
    if (!resolved) {
        throw new ToolError(
            `"${name}" isn't a ${EXTENSION} document in the resume workspace (${workspaceDir()}).`
        );
    }
    return resolved;
}

/** The builder's documents, most recently edited first. */
export function ListResumeDocuments(): { dir: string; files: BuilderFile[] } {
    seedWorkspace();
    return { dir: workspaceDir(), files: listFiles() };
}

/** Reads one `.resb` document. */
export function ReadResumeDocument(name: string): { name: string; path: string; content: string } {
    const resolved = resolveDocument(name);
    try {
        return {
            name: path.basename(resolved),
            path: resolved,
            content: fs.readFileSync(resolved, "utf-8"),
        };
    } catch (e) {
        throw new ToolError(
            `${ReadResumeDocument.name} : cannot read ${name} — ${e instanceof Error ? e.message : String(e)}`
        );
    }
}

/**
 * Writes a `.resb` document into the workspace.
 *
 * The source is parsed first and rejected if it doesn't compile. A document
 * that doesn't parse shows the user an empty preview and a syntax error, and
 * they didn't write it — so a broken one never reaches the folder in the first
 * place. Pass `validate: false` only when deliberately saving a work in
 * progress.
 *
 * `overwrite` off (the default) means an existing name is stepped around
 * rather than replaced: `resume.resb` becomes `resume-2.resb`. Nothing here
 * silently destroys work the user did by hand in the builder.
 */
export function WriteResumeDocument(
    name: string,
    source: string,
    options: { overwrite?: boolean; validate?: boolean } = {}
): BuilderFile {
    if (typeof source !== "string" || !source.trim()) {
        throw new ToolError(`${WriteResumeDocument.name} : nothing to write.`);
    }

    if (options.validate !== false) {
        const check = ValidateResb(source);
        if (!check.ok) {
            throw new ToolError(
                `${WriteResumeDocument.name} : the document doesn't compile, so it wasn't saved.\n` +
                    check.errors.map((e) => `  - ${e}`).join("\n")
            );
        }
    }

    const stem = safeStem(name);
    const target = options.overwrite
        ? path.join(workspaceDir(), `${stem}${EXTENSION}`)
        : freePath(stem);

    try {
        fs.mkdirSync(workspaceDir(), { recursive: true });
        fs.writeFileSync(target, source, "utf-8");
    } catch (e) {
        throw new ToolError(
            `${WriteResumeDocument.name} : cannot write ${target} — ${e instanceof Error ? e.message : String(e)}`
        );
    }

    let modified = 0;
    try {
        modified = fs.statSync(target).mtimeMs;
    } catch {
        /* freshly written; a listing will pick up the real time */
    }
    return { name: path.basename(target), path: target, modified };
}

// ---------------------------------------------------------------------------
// Writing .resb documents
// ---------------------------------------------------------------------------

/**
 * Quotes a value for `.resb` source.
 *
 * The tokenizer has no escape sequences at all — a string runs to the next
 * quote of the kind that opened it, full stop (see resume_builder/tokenizer.ts).
 * So the quote character is chosen to suit the text rather than the text being
 * escaped to suit the quote:
 *
 *   no apostrophe            'plain single quotes'
 *   an apostrophe            "a developer's resume"   — kept exactly as typed
 *   both kinds               'she said “hi”, it’s fine'
 *
 * Only the last case changes the text, and it changes a typewriter apostrophe
 * to a typographic one, which is what a printed resume wants anyway.
 *
 * Newlines are folded to spaces: legal inside a string, but a value spread over
 * several lines makes the generated source unreadable, and `.resb` has no
 * multi-line text anyway — a paragraph is one value.
 */
function resbString(text: string): string {
    const clean = String(text ?? "")
        .replace(/\r/g, "")
        .replace(/\s*\n\s*/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim();

    if (!clean.includes("'")) return `'${clean}'`;
    if (!clean.includes('"')) return `"${clean}"`;
    return `'${clean.replace(/'/g, "’")}'`;
}

/** Past this, a statement is easier to read broken over several lines. */
const WRAP_AT = 96;

/**
 * One statement: `Points: 'first' | 'second'`.
 *
 * Short ones stay on a line — a job title and its dates read as the pair they
 * are. A long one gets a value per line, continuation marker first, the way
 * the samples set a list of bullets. The generated file is opened and edited
 * by hand in the builder, so this is worth the few lines it costs.
 */
function resbValues(name: string, values: string[], indent = "    "): string {
    const quoted = values.map(resbString);
    const oneLine = `${indent}${name}: ${quoted.join(" | ")}`;
    if (quoted.length < 2 || oneLine.length <= WRAP_AT) return oneLine;

    const [first, ...rest] = quoted;
    return `${indent}${name}: ${first}${rest.map((v) => `\n${indent}    | ${v}`).join("")}`;
}

/**
 * Finishes a block's statements: a comma after each one, none after the last.
 *
 * Blank lines separating sections aren't statements, so they take no comma —
 * and the leading indentation is left alone, since `joinSections` supplies the
 * `main:(` around this and the body should sit inside it.
 */
function finishBlock(lines: string[]): string {
    const out = lines.map((line, index) => {
        const isLast = lines.slice(index + 1).every((rest) => !rest.trim());
        return line.trim() && !isLast ? `${line},` : line;
    });
    while (out.length && !out[0].trim()) out.shift();
    while (out.length && !out[out.length - 1].trim()) out.pop();
    return out.join("\n");
}

/** `March 2021 – Present`, or whichever half exists. */
function dateRange(start: string, end: string): string {
    const from = start?.trim();
    const to = end?.trim();
    if (from && to) return `${from} – ${to}`;
    return from || to || "";
}

function fullName(fields: ProfileData): string {
    const joined = [fields.firstName, fields.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");
    return joined || fields.name?.trim() || "Your Name";
}

/** The contact lines under the name — a first with the essentials, a second
 *  for the links if there are enough of them to crowd the first. */
function contactLines(fields: ProfileData): string[] {
    const place = [fields.city, fields.state, fields.country]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(", ");

    const primary = [place, fields.email, fields.phone, fields.linkedin]
        .map((part) => part?.trim())
        .filter(Boolean);
    const secondary = [fields.github, fields.website]
        .map((part) => part?.trim())
        .filter(Boolean);

    const lines: string[] = [];
    if (primary.length) lines.push(primary.join(" | "));
    if (secondary.length) lines.push(secondary.join(" | "));
    return lines;
}

/** The layout half of a generated resume — the sample's, which is known to
 *  compile and to sit properly on an A4 page. */
const RESUME_MACRO = [
    "    Name: Cell(fw : 700, fs : 30, ta : 'Center', ps : 0, c : 'accent'),",
    "    Contact: Cell(fs : 12, ta : 'Center', ps : 0, mt : 3, c : 'muted'),",
    "    Summary: Cell(fs : 12, ps : 0, mt : 11),",
    "    Heading: Cell(fw : 700, fs : 15, ps : 0, mt : 16, mb : 3, rule : 1, c : 'accent'),",
    "    Role: Block(spread : 'Between', gap : 16, mt : 6,",
    "        Cell(fs : 13, ps : 0, grow : 1),",
    "        Cell(fs : 13, ps : 0, nowrap : 1)",
    "    ),",
    "    Points: Block(dir : 'Column', gap : 3, mt : 3, mb : 7,",
    "        Cell(fs : 12, ps : 0, bullet : 1)",
    "    ),",
    "    Line: Cell(fs : 12, ps : 0, mt : 3)",
].join("\n");

/**
 * Builds a resume's `main:` block from the profile.
 *
 * Every value comes from something the user saved. Sections with nothing in
 * them are left out entirely rather than printed empty — a resume with a bare
 * "Languages" heading under it looks like a mistake, because it is one.
 */
function buildResumeMain(profile: ProfileSnapshot): string {
    const { fields, resume } = profile;
    const lines: string[] = [];

    lines.push(resbValues("Name", [fullName(fields)]));
    for (const contact of contactLines(fields)) lines.push(resbValues("Contact", [contact]));

    if (resume.summary.trim()) {
        lines.push("");
        lines.push(resbValues("Summary", [resume.summary]));
    }

    const experience = resume.experience.filter((e) => e.title.trim() || e.company.trim());
    if (experience.length) {
        lines.push("");
        lines.push(resbValues("Heading", ["Experience"]));
        for (const entry of experience) {
            const title = [entry.title.trim() && `**${entry.title.trim()}**`, entry.company.trim()]
                .filter(Boolean)
                .join(", ");
            lines.push(resbValues("Role", [title, dateRange(entry.startDate, entry.endDate)]));
            const bullets = entry.bullets.filter((b) => b.trim());
            if (bullets.length) lines.push(resbValues("Points", bullets));
        }
    }

    const education = resume.education.filter((e) => e.school.trim() || e.degree.trim());
    if (education.length) {
        lines.push("");
        lines.push(resbValues("Heading", ["Education"]));
        for (const entry of education) {
            const qualification = [entry.degree.trim(), entry.field.trim()].filter(Boolean).join(" in ");
            const title = [entry.school.trim() && `**${entry.school.trim()}**`, qualification]
                .filter(Boolean)
                .join(", ");
            lines.push(resbValues("Role", [title, dateRange(entry.startDate, entry.endDate)]));
        }
    }

    const skills = resume.skills.filter((s) => s.trim());
    if (skills.length) {
        lines.push("");
        lines.push(resbValues("Heading", ["Skills"]));
        lines.push(resbValues("Line", [skills.join(", ")]));
    }

    const languages = resume.languages.filter((l) => l.name.trim());
    if (languages.length) {
        lines.push("");
        lines.push(resbValues("Heading", ["Languages"]));
        lines.push(
            resbValues("Line", [
                languages
                    .map((l) => (l.proficiency.trim() ? `${l.name} (${l.proficiency})` : l.name))
                    .join(", "),
            ])
        );
    }

    return finishBlock(lines);
}

/** The layout half of a generated cover letter — the sample letter's. */
const COVER_LETTER_MACRO = [
    "    Name: Cell(fw : 700, fs : 26, ps : 0, c : 'accent'),",
    "    Contact: Cell(fs : 12, ps : 0, mt : 3, c : 'muted'),",
    "    Rule: Cell(fs : 1, ps : 0, mt : 10, rule : 1, c : 'accent'),",
    "    Meta: Block(spread : 'Between', gap : 16, mt : 20,",
    "        Cell(fs : 12, ps : 0, grow : 1),",
    "        Cell(fs : 12, ps : 0, nowrap : 1)",
    "    ),",
    "    Address: Cell(fs : 12, ps : 0, mt : 2),",
    "    Greeting: Cell(fs : 12, ps : 0, mt : 18),",
    "    Body: Cell(fs : 12, ps : 0, mt : 11, ta : 'Justify'),",
    "    Closing: Cell(fs : 12, ps : 0, mt : 18),",
    "    Sign: Cell(fs : 12, fw : 700, ps : 0, mt : 2, c : 'accent')",
].join("\n");

function buildCoverLetterMain(profile: ProfileSnapshot, letter: CoverLetterContent): string {
    const { fields } = profile;
    const name = fullName(fields);
    const lines: string[] = [];

    lines.push(resbValues("Name", [name]));
    for (const contact of contactLines(fields)) lines.push(resbValues("Contact", [contact]));
    lines.push(resbValues("Rule", [""]));

    lines.push("");
    const recipient = letter.recipient?.trim() || "Hiring Manager";
    const date =
        letter.date?.trim() ||
        new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    lines.push(resbValues("Meta", [`**${recipient}**`, date]));
    for (const line of letter.address ?? []) {
        if (line.trim()) lines.push(resbValues("Address", [line]));
    }

    lines.push("");
    lines.push(resbValues("Greeting", [letter.greeting?.trim() || `Dear ${recipient},`]));

    for (const paragraph of letter.body) {
        if (!paragraph.trim()) continue;
        lines.push("");
        lines.push(resbValues("Body", [paragraph]));
    }

    lines.push("");
    lines.push(resbValues("Closing", [letter.closing?.trim() || "Sincerely,"]));
    lines.push(resbValues("Sign", [name]));

    return finishBlock(lines);
}

export interface ResbValidation {
    ok: boolean;
    /** Why it wouldn't compile. Empty when `ok`. */
    errors: string[];
    /** Things that parse but probably aren't meant — a layout defined and
     *  never used, content that will render nothing. */
    warnings: string[];
}

/** Walks a `Cell( … )` / `Block( … )` argument list, checking each name against
 *  the allowlist the renderer enforces. */
function checkKeywordArgs(node: ASTNode, errors: string[]): void {
    if (node.type !== "Keyword") return;
    const keyword = String(node.value);
    if (!KEYWORD_ARGS[keyword]) {
        errors.push(`\`${keyword}\` isn't a keyword — only Cell and Block are.`);
        return;
    }
    if (node.args.type !== "BlockStatement") return;

    for (const item of node.args.body) {
        // a positional child cell: Block( … , Cell( … ) )
        if (item.type === "Keyword") {
            checkKeywordArgs(item, errors);
            continue;
        }
        if (item.type !== "Statement") continue;
        const name = String(item.identifier.value);
        if (!isLegalArg(keyword, name)) {
            errors.push(
                `\`${name}\` isn't an argument of ${keyword}. Legal names: ` +
                    `${Object.keys(KEYWORD_ARGS[keyword]).join(", ")}.`
            );
        }
        checkKeywordArgs(item.initializer, errors);
    }
}

/**
 * Checks that `.resb` source will compile, without compiling it.
 *
 * Three passes, cheapest first: the document is two blocks in the right order
 * (sections.ts), it parses (parser.ts), and every name it uses is one the
 * renderer will accept. The last pass is the reason this exists — a syntax
 * error is loud, but `Cell(size : 12)` parses perfectly and then throws at
 * render time, by which point the file is already on disk.
 *
 * It stops short of rendering, so it can run in the main process: compile.ts
 * pulls in React and JSX, which the main build has no compiler option for.
 * What it doesn't catch is a document that parses and renders but looks wrong
 * — that's what the preview is for.
 */
export function ValidateResb(source: string): ResbValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    const split = splitSections(source);
    if (!split.ok) return { ok: false, errors: [split.error], warnings };

    let ast: ASTNode;
    try {
        ast = new Parser().parse(source);
    } catch (e) {
        return { ok: false, errors: [e instanceof Error ? e.message : String(e)], warnings };
    }
    if (ast.type !== "Program") return { ok: false, errors: ["Not a document."], warnings };

    const defined = new Set<string>();
    const used = new Set<string>();
    let macroBlock: ASTNode | null = null;
    let mainBlock: ASTNode | null = null;

    for (const statement of ast.body) {
        if (statement.type !== "Statement") {
            errors.push(`Only macro:( … ) and main:( … ) can sit at the top of a document.`);
            continue;
        }
        const name = String(statement.identifier.value);
        if (name === "macro") macroBlock = statement.initializer;
        else if (name === "main") mainBlock = statement.initializer;
        else errors.push(`\`${name}:\` sits outside macro:( … ) and main:( … ).`);
    }

    if (macroBlock?.type === "BlockStatement") {
        for (const item of macroBlock.body) {
            if (item.type === "Keyword") {
                errors.push(
                    `A layout in macro:( … ) is named ${item.value}, which is a keyword — ` +
                        `name it for the part of the page it draws instead (Heading, Role, Points).`
                );
                checkKeywordArgs(item, errors);
                continue;
            }
            if (item.type !== "Statement") continue;
            const name = String(item.identifier.value);
            if (defined.has(name)) {
                warnings.push(`macro:( … ) defines \`${name}\` twice; the second definition wins.`);
            }
            defined.add(name);
            if (item.initializer.type === "Keyword") checkKeywordArgs(item.initializer, errors);
            else {
                errors.push(`\`${name}\` must be defined as a Cell( … ) or a Block( … ).`);
            }
        }
    }

    if (mainBlock?.type === "BlockStatement") {
        for (const item of mainBlock.body) {
            if (item.type === "Keyword") {
                warnings.push(
                    `main:( … ) uses ${item.value}( … ) directly; only named layouts render, ` +
                        `so this draws nothing.`
                );
                checkKeywordArgs(item, errors);
                continue;
            }
            if (item.type !== "Statement") continue;
            const name = String(item.identifier.value);
            used.add(name);
            if (!defined.has(name)) {
                errors.push(`main:( … ) uses \`${name}\`, which macro:( … ) doesn't define.`);
            }
        }
        if (!used.size) warnings.push("main:( … ) is empty, so the document renders a blank page.");
    }

    for (const name of defined) {
        if (!used.has(name)) warnings.push(`macro:( … ) defines \`${name}\`, which main:( … ) never uses.`);
    }

    return { ok: errors.length === 0, errors, warnings };
}

/** What a writer produced, and where it went. */
export interface WrittenDocument {
    /** The `.resb` source. Always returned, saved or not. */
    source: string;
    /** Set when `save` was left on. */
    file?: BuilderFile;
    /** Parse warnings — the document compiles, but something looks unintended. */
    warnings: string[];
    /** Whether this was generated from the profile or supplied as source. */
    generated: boolean;
}

export interface ResumeWriterOptions {
    /**
     * `.resb` source to validate and save — what a model returns after being
     * given the `resb-resume` skill (agents/skills.ts). Left unset, the resume
     * is generated from the profile instead, which invents nothing but also
     * tailors nothing.
     */
    source?: string;
    /** Defaults to the saved profile. */
    profile?: ProfileSnapshot;
    /** File name in the workspace; `.resb` is added if missing. */
    name?: string;
    /** Off to get the source back without touching the workspace. */
    save?: boolean;
    overwrite?: boolean;
}

/**
 * Writes a resume as a `.resb` document.
 *
 * Two ways in. With `source`, it validates what a model wrote and saves it —
 * that's the tailoring path, where the resume is reordered and reworded for a
 * posting. Without, it generates one from the profile: every line traceable to
 * something the user saved, no model involved, and therefore nothing invented.
 *
 * A generated document is validated too. It is built from templates that are
 * known to compile, so a failure there means the profile contains something
 * the generator mishandled — worth failing loudly rather than writing a broken
 * file and finding out in the preview.
 */
export function ResumeWriter(options: ResumeWriterOptions = {}): WrittenDocument {
    const generated = !options.source?.trim();
    const profile = options.profile ?? ReadProfile();

    const source = generated
        ? joinSections({ macro: RESUME_MACRO, main: buildResumeMain(profile), trailer: "" })
        : (options.source as string);

    const check = ValidateResb(source);
    if (!check.ok) {
        throw new ToolError(
            `${ResumeWriter.name} : the resume doesn't compile.\n` +
                check.errors.map((e) => `  - ${e}`).join("\n")
        );
    }

    const result: WrittenDocument = { source, warnings: check.warnings, generated };
    if (options.save !== false) {
        // Already validated above; no reason to parse the same text twice.
        result.file = WriteResumeDocument(options.name ?? "resume", source, {
            overwrite: options.overwrite,
            validate: false,
        });
    }
    return result;
}

/** The prose of a letter. Everything here has to be written — none of it can
 *  be derived from the profile, which is why `body` is required. */
export interface CoverLetterContent {
    /** The paragraphs, in order. Three or four is a letter. */
    body: string[];
    /** Who it's addressed to; defaults to "Hiring Manager". */
    recipient?: string;
    /** The company's address, a line per entry. */
    address?: string[];
    /** Defaults to today, written out long. */
    date?: string;
    /** Defaults to "Dear <recipient>,". */
    greeting?: string;
    /** Defaults to "Sincerely,". */
    closing?: string;
}

export interface CoverLetterWriterOptions extends Partial<CoverLetterContent> {
    /** `.resb` source to validate and save, as with `ResumeWriter`. */
    source?: string;
    profile?: ProfileSnapshot;
    name?: string;
    save?: boolean;
    overwrite?: boolean;
}

/**
 * Writes a cover letter as a `.resb` document.
 *
 * The letterhead, the date, the greeting and the signature come from the
 * profile and from convention — but the paragraphs are the letter, and there
 * is no honest way to derive those from stored fields. So either `source` or
 * `body` has to be supplied: this tool sets a letter, it doesn't write one.
 * Ask the model for the paragraphs first (with the `resb-cover-letter` skill
 * if it should produce the whole document), then call this.
 */
export function CoverLetterWriter(options: CoverLetterWriterOptions = {}): WrittenDocument {
    const generated = !options.source?.trim();
    const profile = options.profile ?? ReadProfile();

    if (generated && !options.body?.some((p) => p.trim())) {
        throw new ToolError(
            `${CoverLetterWriter.name} : a letter needs its paragraphs — pass \`body\`, or pass ` +
                `\`source\` with a complete .resb document. Nothing here can be inferred from the profile.`
        );
    }

    const source = generated
        ? joinSections({
              macro: COVER_LETTER_MACRO,
              main: buildCoverLetterMain(profile, {
                  body: options.body ?? [],
                  recipient: options.recipient,
                  address: options.address,
                  date: options.date,
                  greeting: options.greeting,
                  closing: options.closing,
              }),
              trailer: "",
          })
        : (options.source as string);

    const check = ValidateResb(source);
    if (!check.ok) {
        throw new ToolError(
            `${CoverLetterWriter.name} : the letter doesn't compile.\n` +
                check.errors.map((e) => `  - ${e}`).join("\n")
        );
    }

    const result: WrittenDocument = { source, warnings: check.warnings, generated };
    if (options.save !== false) {
        result.file = WriteResumeDocument(options.name ?? "cover-letter", source, {
            overwrite: options.overwrite,
            validate: false,
        });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Reading the internet
// ---------------------------------------------------------------------------

/** Entities common enough in page text to be worth decoding. Anything rarer
 *  survives as its entity, which is ugly but readable — better than a decoder
 *  that guesses. */
const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    hellip: "…",
    bull: "•",
    middot: "·",
    reg: "®",
    copy: "©",
    trade: "™",
};

function decodeEntities(text: string): string {
    return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
        if (body[0] === "#") {
            const code = body[1]?.toLowerCase() === "x"
                ? parseInt(body.slice(2), 16)
                : parseInt(body.slice(1), 10);
            return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
        }
        return ENTITIES[body.toLowerCase()] ?? whole;
    });
}

/**
 * Turns a page into the text a person would read off it.
 *
 * Markup is not what a model needs from a job posting — it is mostly nav,
 * tracking and styling, and on a job board it can be fifty times the size of
 * the posting itself. Dropping it is the difference between a prompt that
 * fits and one that doesn't.
 *
 * Deliberately regex-based rather than a parser: this extracts readable text,
 * it doesn't build a DOM, and a real HTML parser would be a dependency and a
 * package-size cost for something that reads worse either way on the malformed
 * markup job boards actually serve. Blocks that never contain prose are
 * removed whole, block-level tags become line breaks so paragraphs survive,
 * and everything else goes.
 */
export function htmlToText(html: string): string {
    return decodeEntities(
        html
            // whole subtrees with nothing readable in them
            .replace(/<(script|style|noscript|svg|iframe|template|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
            .replace(/<!--[\s\S]*?-->/g, " ")
            // structure worth keeping as whitespace
            .replace(/<(br|hr)\b[^>]*>/gi, "\n")
            .replace(/<\/(p|div|section|article|h[1-6]|li|tr|ul|ol|table|header|footer|nav)\s*>/gi, "\n")
            .replace(/<li\b[^>]*>/gi, "\n• ")
            .replace(/<t[dh]\b[^>]*>/gi, "\t")
            // everything else
            .replace(/<[^>]+>/g, " ")
    )
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** Rejects anything that isn't an ordinary web address. Other schemes reach
 *  local files and OS handlers, and nothing a job posting needs lives there —
 *  the same line files.ts draws before handing a URL to the browser. */
function webUrl(raw: string, tool: string): URL {
    let url: URL;
    try {
        url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    } catch {
        throw new ToolError(`${tool} : ${raw} isn't a URL.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new ToolError(`${tool} : only http and https addresses can be read, not ${url.protocol}`);
    }
    return url;
}

async function fetchOrThrow(url: URL, tool: string): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url.href, {
            redirect: "follow",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            // Some job boards serve a stub or a block page to a client that
            // doesn't look like a browser.
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
            },
        });
    } catch (e) {
        const reason = e instanceof Error && e.name === "TimeoutError"
            ? `no answer in ${FETCH_TIMEOUT_MS / 1000}s`
            : e instanceof Error
              ? e.message
              : String(e);
        throw new ToolError(`${tool} : couldn't reach ${url.href} — ${reason}`);
    }
    if (!response.ok) {
        throw new ToolError(`${tool} : ${response.status} ${response.statusText} for ${url.href}`);
    }
    return response;
}

export interface WebPage {
    url: string;
    /** The page's `<title>`, when it has one. */
    title: string;
    /** Readable text, capped at `maxChars`. */
    text: string;
    /** Whether the cap cut it short. */
    truncated: boolean;
}

/**
 * Reads a web page — a job posting, a company page — as text.
 *
 * A PDF served at the URL is handed to `PDFReader` rather than being run
 * through the HTML stripper, since plenty of postings are linked that way and
 * the caller has no way to know before fetching.
 */
export async function WebLinkReader(
    url: string,
    options: { maxChars?: number; raw?: boolean } = {}
): Promise<WebPage> {
    const maxChars = options.maxChars ?? MAX_PAGE_CHARS;
    const target = webUrl(url, WebLinkReader.name);
    const response = await fetchOrThrow(target, WebLinkReader.name);

    const contentType = response.headers.get("content-type") ?? "";
    if (/application\/pdf/i.test(contentType)) {
        const text = await readPdfBuffer(
            Buffer.from(await response.arrayBuffer()),
            target.href,
            maxChars
        );
        return { url: target.href, title: "", text, truncated: text.length >= maxChars };
    }

    const html = await response.text();
    // `raw` hands back the markup for a caller that wants to pick at it —
    // a link list, an embedded JSON blob — rather than read the page.
    const body = options.raw ? html : htmlToText(html);
    const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "");

    return {
        url: target.href,
        title,
        text: body.slice(0, maxChars),
        truncated: body.length > maxChars,
    };
}

/** Shared by the two ways a PDF arrives: a local path, or a fetched body. */
async function readPdfBuffer(data: Buffer, label: string, maxChars: number): Promise<string> {
    const parser = new PDFParse({ data });
    try {
        const result = await parser.getText();
        // Same normalisation as the onboarding extractor: PDF text layers come
        // out with ragged whitespace that only wastes prompt tokens.
        const text = result.text
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        if (!text) {
            throw new ToolError(
                `${PDFReader.name} : no extractable text in ${label} (scanned or image-only PDF?)`
            );
        }
        return text.slice(0, maxChars);
    } catch (e) {
        if (e instanceof ToolError) throw e;
        throw new ToolError(
            `${PDFReader.name} : failed to parse ${label} — ${e instanceof Error ? e.message : String(e)}`
        );
    } finally {
        await parser.destroy();
    }
}

/**
 * Reads the text of a PDF.
 *
 * Takes either a local path or an http(s)/www URL — job postings and resumes
 * arrive both ways, and the agent shouldn't have to know which.
 */
export async function PDFReader(pdf_url: string, maxChars: number = MAX_PDF_CHARS): Promise<string> {
    let data: Buffer;
    if (/^(https?:\/\/|www\.)/i.test(pdf_url)) {
        const target = webUrl(pdf_url, PDFReader.name);
        const response = await fetchOrThrow(target, PDFReader.name);
        data = Buffer.from(await response.arrayBuffer());
    } else {
        try {
            data = readFileSync(pdf_url);
        } catch (e) {
            throw new ToolError(
                `${PDFReader.name} : cannot read ${pdf_url} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }
    return readPdfBuffer(data, pdf_url, maxChars);
}
