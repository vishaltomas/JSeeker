import Anthropic from "@anthropic-ai/sdk";
import type { Store } from "../main/store";
import type { ChatMessage, ChatSink, FieldFill, PageSnapshot, ResumeExtraction } from "./types";
import { RESUME_ANCHOR_KEYS, RESUME_STRUCTURE_KEYS, RESUME_STRUCTURE_SCHEMA_PROPERTIES } from "./types";
import {
  buildPageAutofillPrompt,
  buildResumeExtractionPrompt,
  buildSystemPrompt,
  parseFieldFills,
  parseResumeExtraction,
} from "./prompts";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

/**
 * Ask Claude to read a whole page and decide what to type into it, using
 * structured outputs so the response is always a schema-valid fill list —
 * the browser extension hands over a snapshot of the page (via
 * src/main/extensionServer.ts) and the model picks out the fields itself.
 */
export async function planPageAutofillWithClaude(
  store: Store,
  snapshot: PageSnapshot
): Promise<FieldFill[]> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) return [];
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    // Enough headroom for a long form's worth of fills, including a couple
    // of written-out answers to open questions.
    max_tokens: 4096,
    messages: [{ role: "user", content: buildPageAutofillPrompt(store, snapshot) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            fills: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  value: { type: "string" },
                },
                required: ["id", "value"],
                additionalProperties: false,
              },
            },
          },
          required: ["fills"],
          additionalProperties: false,
        },
      },
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return [];
  return parseFieldFills(block.text);
}

/** Ask Claude to extract a profile — anchor fields, open extraFields, and
 * structured resume sections — from one or more uploaded documents at once,
 * using structured outputs so the response always matches ResumeExtraction. */
export async function parseResumeWithClaude(
  store: Store,
  documents: { filename: string; text: string }[]
): Promise<ResumeExtraction> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) throw new Error("No Claude API key set. Add one in Settings → Assistant.");
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 3072,
    messages: [{ role: "user", content: buildResumeExtractionPrompt(documents) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            ...Object.fromEntries(RESUME_ANCHOR_KEYS.map((k) => [k, { type: "string" }])),
            ...RESUME_STRUCTURE_SCHEMA_PROPERTIES,
          },
          required: [...RESUME_ANCHOR_KEYS, ...RESUME_STRUCTURE_KEYS],
          additionalProperties: false,
        },
      },
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude returned no response.");
  return parseResumeExtraction(block.text);
}

// Streamed chat via the Claude API: same system prompt, but the system role
// is a top-level field rather than a message, and streaming comes from the
// Anthropic SDK's text-delta events.
export async function chatWithClaude(
  sink: ChatSink,
  store: Store,
  history: ChatMessage[],
  pageContext?: string
): Promise<void> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) {
    sink.error("No Claude API key set. Add one in Settings → Assistant.");
    return;
  }
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(store, pageContext),
      messages: history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    });

    let full = "";
    stream.on("text", (delta) => {
      full += delta;
      sink.delta(delta);
    });

    await stream.finalMessage();
    sink.done(full);
  } catch (err) {
    sink.error(err instanceof Error ? err.message : String(err));
  }
}
