import Anthropic from "@anthropic-ai/sdk";
import type { Store } from "../main/store";
import type { AgentAction, AutopilotSnapshot, ChatMessage, FieldDescriptor, FieldMapping } from "./types";
import {
  buildAutofillPrompt,
  buildNextActionPrompt,
  buildSystemPrompt,
  parseAgentAction,
  parseFieldMappings,
} from "./prompts";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

/**
 * Ask Claude to map leftover, unrecognized form fields to values from the
 * active profile, using structured outputs so the response is always a
 * schema-valid mapping list.
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

/** Ask Claude what the autopilot loop should do next on the current page,
 * using structured outputs so the response always matches AgentAction. */
export async function planNextActionWithClaude(
  store: Store,
  snapshot: AutopilotSnapshot,
  recentSteps: string[]
): Promise<AgentAction> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) {
    return { action: "blocked", index: -1, note: "No Claude API key set. Add one in Settings → Assistant." };
  }
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: buildNextActionPrompt(store, snapshot, recentSteps) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["click", "confirm_submit", "done", "blocked"] },
            index: { type: "integer" },
            note: { type: "string" },
          },
          required: ["action", "index", "note"],
          additionalProperties: false,
        },
      },
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    return { action: "blocked", index: -1, note: "Claude returned no response." };
  }
  return parseAgentAction(block.text);
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
