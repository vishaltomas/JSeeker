import Anthropic from "@anthropic-ai/sdk";
import type { Store } from "../main/store";
import type {
  ChatMessage,
  ChatOptions,
  ChatSink,
  ProgressSink,
  ResumeExtraction,
} from "./types";
import { RESUME_ANCHOR_KEYS, RESUME_STRUCTURE_KEYS, RESUME_STRUCTURE_SCHEMA_PROPERTIES } from "./types";
import { claudeTools, createToolCache, MAX_TOOL_STEPS, runReportedTool } from "./toolDefs";
import {
  buildResumeExtractionPrompt,
  buildSystemPrompt,
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

// Streamed chat via the Claude API: same system prompt, but the system role
// is a top-level field rather than a message, and streaming comes from the
// Anthropic SDK's text-delta events.
//
// With `tools` on, this is a loop rather than one request: the model answers,
// and if it asked for a tool the results go back as a new turn and it answers
// again. Text streams to the user throughout, so a reply that pauses to read a
// job posting still arrives a piece at a time.
export async function chatWithClaude(
  sink: ChatSink,
  store: Store,
  history: ChatMessage[],
  pageContext?: string,
  options: ChatOptions = {}
): Promise<void> {
  const apiKey = store.settings.anthropicApiKey;
  if (!apiKey) {
    sink.error("No Claude API key set. Add one in Settings → Assistant.");
    return;
  }
  const model = store.settings.anthropicModel || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey });
  const useTools = options.tools !== false;

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));
  // One turn's worth of read results, so asking for the same page twice costs
  // one fetch. Discarded when this call returns.
  const cache = createToolCache();

  try {
    let full = "";

    for (let step = 0; ; step++) {
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system: buildSystemPrompt(store, pageContext, { tools: useTools }),
        messages,
        ...(useTools ? { tools: claudeTools() } : {}),
      });

      stream.on("text", (delta) => {
        full += delta;
        sink.delta(delta);
      });

      const response = await stream.finalMessage();
      const calls = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );
      if (!calls.length) break;

      // The assistant turn has to go back verbatim, tool_use blocks and all —
      // a tool_result with no matching tool_use in the history is rejected.
      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        // Every tool_use block needs its own tool_result, even a repeat of one
        // already answered — an id left unanswered is rejected. The cache is
        // what keeps a duplicate from costing a second fetch.
        const outcome = await runReportedTool(call.name, call.input, sink, cache);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
      }
      messages.push({ role: "user", content: results });

      if (step + 1 >= MAX_TOOL_STEPS) {
        // Out of steps with the model still asking for tools. Stopping here
        // and saying so beats looping until the context (or the bill) runs
        // out — and the user still has whatever was written along the way.
        sink.tool?.({
          name: "",
          detail: `Stopped after ${MAX_TOOL_STEPS} tool steps`,
          status: "error",
          message: "The assistant kept reaching for tools without finishing an answer.",
        });
        break;
      }
    }

    sink.done(full);
  } catch (err) {
    sink.error(err instanceof Error ? err.message : String(err));
  }
}
