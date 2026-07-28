import Anthropic from "@anthropic-ai/sdk";
import type { Store } from "../main/store";
import type { ChatMessage, FieldDescriptor, FieldMapping, ResumeExtraction } from "./types";
import { RESUME_FIELD_KEYS, RESUME_STRUCTURE_KEYS, RESUME_STRUCTURE_SCHEMA_PROPERTIES } from "./types";
import {
  buildAutofillPrompt,
  buildResumeExtractionPrompt,
  buildSystemPrompt,
  parseFieldMappings,
  parseResumeExtraction,
} from "./prompts";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

/**
 * Ask Claude to map leftover, unrecognized form fields to values from the
 * active profile, using structured outputs so the response is always a
 * schema-valid mapping list — the fallback the browser extension calls (via
 * src/main/extensionServer.ts) for fields its own heuristic matcher
 * couldn't confidently label.
 */
export async function planAutofillWithClaude(
  store: Store,
  fields: FieldDescriptor[]
): Promise<FieldMapping[]> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) return [];
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: buildAutofillPrompt(store, fields) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            mappings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer" },
                  value: { type: "string" },
                },
                required: ["index", "value"],
                additionalProperties: false,
              },
            },
          },
          required: ["mappings"],
          additionalProperties: false,
        },
      },
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return [];
  return parseFieldMappings(block.text);
}

/** Ask Claude to extract profile fields and structured resume sections from
 * resume text during onboarding, using structured outputs so the response
 * always matches ResumeExtraction. */
export async function parseResumeWithClaude(store: Store, resumeText: string): Promise<ResumeExtraction> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) throw new Error("No Claude API key set. Add one in Settings → Assistant.");
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: buildResumeExtractionPrompt(resumeText) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            ...Object.fromEntries(RESUME_FIELD_KEYS.map((k) => [k, { type: "string" }])),
            ...RESUME_STRUCTURE_SCHEMA_PROPERTIES,
          },
          required: [...RESUME_FIELD_KEYS, ...RESUME_STRUCTURE_KEYS],
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
  event: Electron.IpcMainEvent,
  store: Store,
  history: ChatMessage[]
): Promise<void> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) {
    event.sender.send("chat:error", "No Claude API key set. Add one in Settings → Assistant.");
    return;
  }
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(store),
      messages: history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    });

    let full = "";
    stream.on("text", (delta) => {
      full += delta;
      event.sender.send("chat:delta", delta);
    });

    await stream.finalMessage();
    event.sender.send("chat:done", full);
  } catch (err) {
    event.sender.send("chat:error", err instanceof Error ? err.message : String(err));
  }
}
