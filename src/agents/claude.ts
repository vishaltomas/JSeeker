import Anthropic from "@anthropic-ai/sdk";
import type { Store } from "../main/store";
import type { ChatMessage, ChatSink, ExtraField, ProgressSink, ResumeExtraction } from "./types";
import { RESUME_ANCHOR_KEYS, RESUME_STRUCTURE_KEYS, RESUME_STRUCTURE_SCHEMA_PROPERTIES } from "./types";
import {
  buildAnswerExtractionPrompt,
  buildResumeExtractionPrompt,
  buildSystemPrompt,
  parseExtractedAnswers,
  parseResumeExtraction,
} from "./prompts";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

/** Ask Claude to extract a profile — anchor fields, open extraFields, and
 * structured resume sections — from one or more uploaded documents at once,
 * using structured outputs so the response always matches ResumeExtraction. */
export async function parseResumeWithClaude(
  store: Store,
  documents: { filename: string; text: string }[],
  onProgress?: ProgressSink
): Promise<ResumeExtraction> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) throw new Error("No Claude API key set. Add one in Settings → Assistant.");
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  let chars = 0;
  let lastReport = 0;
  onProgress?.({ stage: "extracting", model, documents: documents.length, chars: 0 });

  // Streamed so the UI can show the extraction growing; structured outputs
  // work the same either way, and `finalMessage()` yields the whole reply.
  const stream = client.messages.stream({
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

  if (onProgress) {
    stream.on("text", (delta) => {
      chars += delta.length;
      // Throttled — per-token IPC would flood the renderer for no extra clarity.
      if (Date.now() - lastReport > 250) {
        lastReport = Date.now();
        onProgress({ stage: "extracting", model, documents: documents.length, chars });
      }
    });
  }

  const response = await stream.finalMessage();
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude returned no response.");
  return parseResumeExtraction(block.text);
}

/** Reads one session's conversation and returns the facts worth keeping (see
 * main/sessions.ts), using structured outputs so the result is always a
 * key/value list. */
export async function extractAnswersWithClaude(
  store: Store,
  conversation: { role: string; content: string }[]
): Promise<ExtraField[]> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) throw new Error("No Claude API key set. Add one in Settings \u2192 Assistant.");
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: buildAnswerExtractionPrompt(conversation) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            answers: {
              type: "array",
              items: {
                type: "object",
                properties: { key: { type: "string" }, value: { type: "string" } },
                required: ["key", "value"],
                additionalProperties: false,
              },
            },
          },
          required: ["answers"],
          additionalProperties: false,
        },
      },
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return [];
  return parseExtractedAnswers(block.text);
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
