/**
 * The tools as the model sees them.
 *
 * agents/tools.ts holds the actions themselves — typed functions that know
 * nothing about models. This file is the other half: a JSON schema per tool, a
 * one-line summary for the UI to show while it runs, and a dispatcher that
 * turns a model's call into text to hand back.
 *
 * Kept apart from tools.ts because the two change for different reasons. A
 * tool's behaviour changes when the app does; its schema and description change
 * when a model keeps misusing it, which is prompt work rather than programming.
 *
 * Both providers get the same list, converted to their own shape at the bottom.
 *
 * On the input schemas: every parameter is a named property with a flat type,
 * and lists of pairs are arrays of `{key, value}` objects rather than open
 * dictionaries — the same restriction agents/types.ts already works around for
 * structured output, and for the same reason. Neither provider's strict schema
 * mode handles genuinely open `additionalProperties`.
 */

import * as actions from "./tools";
import { getSkill, listSkills, type SkillName } from "./skills";
import type { ToolActivity } from "./types";

/** A tool result is a prompt the model reads. Past this it is mostly filler,
 *  and on a local model with an 8k context it is actively harmful. */
const MAX_RESULT_CHARS = 6000;

export interface ToolDefinition {
    name: string;
    description: string;
    /** JSON Schema for the tool's input. */
    schema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
    /**
     * True when calling this twice with the same arguments means the same
     * thing as calling it once — reads, in other words. Those get cached for
     * the length of a turn (see `runReportedTool`), because a model that has
     * already been given a job posting and asks for it again does not need it
     * fetched a second time.
     *
     * Writes are not cached: `write_resume` called twice is two documents, and
     * whether that's what the user wanted is not this layer's guess to make.
     */
    readOnly: boolean;
    /** What to show the user while this runs — "Reading jobs.example.com". */
    summarize(input: Record<string, unknown>): string;
    run(input: Record<string, unknown>): Promise<unknown> | unknown;
}

function str(input: Record<string, unknown>, key: string): string | undefined {
    const value = input?.[key];
    return typeof value === "string" && value.trim() ? value : undefined;
}

function strList(input: Record<string, unknown>, key: string): string[] | undefined {
    const value = input?.[key];
    if (!Array.isArray(value)) return undefined;
    const list = value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    return list.length ? list : undefined;
}

export const TOOLS: ToolDefinition[] = [
    {
        name: "read_profile",
        readOnly: true,
        description:
            "Read everything saved about the applicant: contact details and any other saved " +
            "answers, plus the structured resume — summary, work experience with its bullet " +
            "points, education, skills and languages. Call this before writing a resume, a " +
            "cover letter, or any answer that draws on the applicant's history. The system " +
            "prompt lists only the flat fields, so this is the only way to see their actual " +
            "work history.",
        schema: { type: "object", properties: {} },
        summarize: () => "Reading your profile",
        run: () => actions.ReadProfile(),
    },
    {
        name: "update_profile",
        readOnly: false,
        description:
            "Save facts about the applicant for reuse on the next application — notice period, " +
            "work authorization, salary expectations, and so on. Only save what the applicant " +
            "actually told you about themselves; never save something you drafted and they " +
            "haven't confirmed. An existing value is left alone unless `overwrite` is true.",
        schema: {
            type: "object",
            properties: {
                fields: {
                    type: "array",
                    description: "The facts to save.",
                    items: {
                        type: "object",
                        properties: {
                            key: { type: "string", description: "A short human-readable label." },
                            value: { type: "string" },
                        },
                        required: ["key", "value"],
                    },
                },
                overwrite: { type: "boolean" },
            },
            required: ["fields"],
        },
        summarize: (input) => {
            const fields = Array.isArray(input.fields) ? input.fields : [];
            const keys = fields
                .map((f) => (f as { key?: string })?.key)
                .filter(Boolean)
                .join(", ");
            return keys ? `Saving ${keys}` : "Saving to your profile";
        },
        run: (input) => {
            const pairs = Array.isArray(input.fields) ? input.fields : [];
            const fields: Record<string, string> = {};
            for (const pair of pairs) {
                const { key, value } = (pair ?? {}) as { key?: unknown; value?: unknown };
                if (typeof key === "string" && typeof value === "string") fields[key] = value;
            }
            return actions.UpdateProfile(fields, { overwrite: input.overwrite === true });
        },
    },
    {
        name: "search_applications",
        readOnly: true,
        description:
            "Search past job applications — the postings, the conversations held about them, and " +
            "the answers extracted from those conversations. Use it when the applicant refers to " +
            "a job they applied for, or when an answer they have already worked out would save " +
            "writing a new one.",
        schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "A company, a role, or a topic." },
                limit: { type: "number" },
            },
            required: ["query"],
        },
        summarize: (input) => `Searching past applications for “${str(input, "query") ?? ""}”`,
        run: (input) =>
            actions.SearchSessions(
                str(input, "query") ?? "",
                typeof input.limit === "number" ? input.limit : undefined
            ),
    },
    {
        name: "read_application",
        readOnly: true,
        description:
            "Read one past application in full — every message and every answer given. Get the " +
            "id from search_applications first.",
        schema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
        },
        summarize: () => "Reading a past application",
        run: (input) => actions.ReadSession(str(input, "id") ?? ""),
    },
    {
        name: "list_documents",
        readOnly: true,
        description: "List the resume and cover-letter documents in the builder's workspace.",
        schema: { type: "object", properties: {} },
        summarize: () => "Listing your documents",
        run: () => actions.ListResumeDocuments(),
    },
    {
        name: "read_document",
        readOnly: true,
        description:
            "Read one `.resb` document from the builder's workspace — use it to see how an " +
            "existing resume is laid out before writing a new one.",
        schema: {
            type: "object",
            properties: { name: { type: "string", description: "From list_documents." } },
            required: ["name"],
        },
        summarize: (input) => `Reading ${str(input, "name") ?? "a document"}`,
        run: (input) => actions.ReadResumeDocument(str(input, "name") ?? ""),
    },
    {
        name: "load_skill",
        readOnly: true,
        description:
            `Load the instructions for a task this assistant knows how to do. Available: ` +
            `${listSkills()
                .map((s) => `"${s.name}" — ${s.description}`)
                .join("; ")}. ` +
            "Load the matching skill before writing a `.resb` document by hand: it is this " +
            "app's own language and guessing at the syntax will not compile.",
        schema: {
            type: "object",
            properties: {
                name: { type: "string", enum: listSkills().map((s) => s.name) },
            },
            required: ["name"],
        },
        summarize: (input) => `Loading the ${str(input, "name") ?? ""} skill`,
        run: (input) => {
            const name = str(input, "name") ?? "";
            const skill = getSkill(name);
            if (!skill) {
                throw new actions.ToolError(
                    `No skill called "${name}". Available: ${listSkills().map((s) => s.name).join(", ")}.`
                );
            }
            return skill.instructions;
        },
    },
    {
        name: "write_resume",
        readOnly: false,
        description:
            "Write a resume into the builder as a `.resb` document. Called with no arguments it " +
            "builds one from the saved profile exactly as it stands — accurate, but not tailored " +
            "to any posting. To tailor one, first load the `resb-resume` skill, then pass the " +
            "whole document as `source`. A document that doesn't compile is rejected and " +
            "nothing is saved, so read the error and fix it rather than trying again unchanged.",
        schema: {
            type: "object",
            properties: {
                source: {
                    type: "string",
                    description: "A complete .resb document. Omit to generate from the profile.",
                },
                name: { type: "string", description: "File name, defaults to \"resume\"." },
            },
        },
        summarize: (input) =>
            str(input, "source") ? "Writing a tailored resume" : "Building a resume from your profile",
        run: (input) => {
            const result = actions.ResumeWriter({
                source: str(input, "source"),
                name: str(input, "name"),
            });
            return {
                saved: result.file?.name,
                path: result.file?.path,
                generatedFromProfile: result.generated,
                warnings: result.warnings,
                note: "The document is now in the builder, where the applicant can edit it and export a PDF.",
            };
        },
    },
    {
        name: "write_cover_letter",
        readOnly: false,
        description:
            "Write a cover letter into the builder as a `.resb` document. Supply the paragraphs " +
            "as `body` — the letterhead, date and signature are filled in from the profile. " +
            "Write the paragraphs from the applicant's real experience only. Alternatively load " +
            "the `resb-cover-letter` skill and pass a whole document as `source`.",
        schema: {
            type: "object",
            properties: {
                body: {
                    type: "array",
                    items: { type: "string" },
                    description: "The paragraphs, in order. Three or four is a letter.",
                },
                recipient: { type: "string" },
                address: { type: "array", items: { type: "string" } },
                greeting: { type: "string" },
                closing: { type: "string" },
                source: { type: "string", description: "A complete .resb document instead of `body`." },
                name: { type: "string" },
            },
        },
        summarize: () => "Writing a cover letter",
        run: (input) => {
            const result = actions.CoverLetterWriter({
                source: str(input, "source"),
                body: strList(input, "body") ?? [],
                recipient: str(input, "recipient"),
                address: strList(input, "address"),
                greeting: str(input, "greeting"),
                closing: str(input, "closing"),
                name: str(input, "name"),
            });
            return {
                saved: result.file?.name,
                path: result.file?.path,
                warnings: result.warnings,
                note: "The letter is now in the builder, where the applicant can edit it and export a PDF.",
            };
        },
    },
    {
        name: "read_web_page",
        readOnly: true,
        description:
            "Read a web page as text — a job posting, a company page. Use it whenever the " +
            "applicant gives a link, rather than guessing at what the page says.",
        schema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
        },
        summarize: (input) => {
            const url = str(input, "url") ?? "";
            try {
                const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
                // Host and path, not just the host: a job board serves the
                // listing, the description and the application form all off
                // one hostname, and three identical lines reading "Reading
                // apply.careers.microsoft.com" look like the same call
                // repeated rather than three different pages.
                const tail = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
                const path = tail.length > 32 ? `${tail.slice(0, 31)}…` : tail;
                return `Reading ${parsed.hostname}${path}`;
            } catch {
                return "Reading a page";
            }
        },
        run: (input) => actions.WebLinkReader(str(input, "url") ?? ""),
    },
    {
        name: "read_pdf",
        readOnly: true,
        description:
            "Read the text of a PDF, given a file path on this computer or a URL. Postings and " +
            "job descriptions are often circulated this way.",
        schema: {
            type: "object",
            properties: { path_or_url: { type: "string" } },
            required: ["path_or_url"],
        },
        summarize: () => "Reading a PDF",
        run: (input) => actions.PDFReader(str(input, "path_or_url") ?? ""),
    },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function getTool(name: string): ToolDefinition | undefined {
    return BY_NAME.get(name);
}

/** What the model gets back from a call. */
export interface ToolOutcome {
    /** Text to hand back as the tool's result. */
    content: string;
    /** True when the tool failed. The message goes back as the content rather
     *  than ending the turn — a model that called `read_document` with a name
     *  that doesn't exist can list the documents and try again, which is a
     *  better outcome than the conversation stopping. */
    isError: boolean;
}

function asText(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * Runs one tool call.
 *
 * Never throws. Everything that can go wrong here — an unknown name, bad
 * arguments, a site that won't answer — is something the model can react to,
 * and it can only react to what it is told.
 */
export async function runTool(name: string, input: unknown): Promise<ToolOutcome> {
    const tool = getTool(name);
    if (!tool) {
        return {
            content: `No tool called "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}.`,
            isError: true,
        };
    }

    const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    try {
        const result = await tool.run(args);
        const text = asText(result);
        return {
            content:
                text.length > MAX_RESULT_CHARS
                    ? `${text.slice(0, MAX_RESULT_CHARS)}\n…[truncated]`
                    : text,
            isError: false,
        };
    } catch (err) {
        return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
}

/**
 * How many rounds of "model asks for tools, tools answer" one turn may take.
 *
 * Reading a posting, checking the profile and writing a document is three.
 * Past six the model is not converging, and each round costs a whole request
 * with the conversation so far attached.
 */
export const MAX_TOOL_STEPS = 6;

/**
 * Results of the read-only calls made so far in one turn.
 *
 * Scoped to a single turn and thrown away after: a page can change between
 * messages, and the profile certainly does once `update_profile` has run.
 * Within one turn, though, a model that asks for the same page twice — which
 * small models do constantly, having lost track of what they were already
 * given — should not cost a second fetch.
 */
export type ToolCache = Map<string, ToolOutcome>;

export function createToolCache(): ToolCache {
    return new Map();
}

/** Key for the cache: the call, with object keys ordered so that the same
 *  arguments written in a different order still count as the same call. */
function cacheKey(name: string, input: unknown): string {
    const stable = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(stable);
        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => [k, stable(v)])
            );
        }
        return value;
    };
    try {
        return `${name}:${JSON.stringify(stable(input))}`;
    } catch {
        return `${name}:?`;
    }
}

/**
 * Runs a tool and narrates it to whoever is watching the chat.
 *
 * Both providers' loops go through here so that a tool call looks the same in
 * the app and in the extension's panel, and so the start/done pairing can't
 * drift between them.
 *
 * A cached repeat is served without a word: nothing happened that the user
 * needs to watch, and a second identical line under the message reads as the
 * assistant doing the work twice when it didn't.
 */
export async function runReportedTool(
    name: string,
    input: unknown,
    sink: { tool?(activity: ToolActivity): void },
    cache?: ToolCache
): Promise<ToolOutcome> {
    const cacheable = cache && getTool(name)?.readOnly;
    const key = cacheable ? cacheKey(name, input) : "";
    if (cacheable) {
        const hit = cache.get(key);
        if (hit) return hit;
    }

    const detail = summarizeCall(name, input);
    sink.tool?.({ name, detail, status: "start" });

    const outcome = await runTool(name, input);

    sink.tool?.(
        outcome.isError
            ? { name, detail, status: "error", message: outcome.content }
            : { name, detail, status: "done" }
    );

    // Failures aren't cached — a site that timed out may answer on a retry,
    // and a model correcting itself deserves the attempt.
    if (cacheable && !outcome.isError) cache.set(key, outcome);
    return outcome;
}

/** One line describing a call, for the UI. Falls back to the bare name if a
 *  summariser trips over unexpected arguments — a label is not worth failing a
 *  turn for. */
export function summarizeCall(name: string, input: unknown): string {
    const tool = getTool(name);
    if (!tool) return name;
    try {
        return tool.summarize((input ?? {}) as Record<string, unknown>);
    } catch {
        return name;
    }
}

/** The tool list in Anthropic's shape. */
export function claudeTools(): {
    name: string;
    description: string;
    input_schema: ToolDefinition["schema"];
}[] {
    return TOOLS.map(({ name, description, schema }) => ({
        name,
        description,
        input_schema: schema,
    }));
}

/** The tool list in Ollama's (OpenAI-style) shape. */
export function ollamaTools(): {
    type: "function";
    function: { name: string; description: string; parameters: ToolDefinition["schema"] };
}[] {
    return TOOLS.map(({ name, description, schema }) => ({
        type: "function" as const,
        function: { name, description, parameters: schema },
    }));
}

export type { SkillName };
