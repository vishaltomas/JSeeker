import type { Store } from "../main/store";
import { activeProfileData } from "../main/store";
import type { FieldDescriptor, FieldMapping } from "./types";

/** System prompt seeded with the active profile so the model can help fill applications. */
export function buildSystemPrompt(store: Store): string {
  const record = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
  const data = activeProfileData(store);
  const lines = Object.entries(data)
    .filter(([key, value]) => value && key !== "resumePath")
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = lines.length ? lines.join("\n") : "(no info saved yet)";
  return [
    "You are JSeeker's assistant, helping the user complete job applications.",
    "Be concise and practical. Help draft and tailor answers to application questions,",
    "and use the user's saved info below when it is relevant.",
    "",
    `Active profile: ${record ? record.name : "Default"}`,
    "The user's saved info:",
    profileText,
  ].join("\n");
}

/** Builds the shared prompt asking a model to map leftover fields to profile values. */
export function buildAutofillPrompt(store: Store, fields: FieldDescriptor[]): string {
  const data = activeProfileData(store);
  const profileLines = Object.entries(data)
    .filter(([key, value]) => value && key !== "resumePath")
    .map(([key, value]) => `- ${key}: ${value}`);
  const profileText = profileLines.length ? profileLines.join("\n") : "(no info saved)";

  return [
    "You are filling out a job application form for the applicant described below.",
    "Here is a JSON list of form fields a rule-based matcher could not label with confidence.",
    "",
    "Applicant profile:",
    profileText,
    "",
    "Form fields:",
    JSON.stringify(fields),
    "",
    "Only include a field when the profile clearly supports the value.",
    "For a field with an `options` list, the value must be one of those option strings verbatim.",
    "Never invent information (employer names, dates, numbers, etc.) that isn't in the profile.",
    "Omit any field you're unsure about.",
  ].join("\n");
}

/** Parse a model's JSON-mode response into field mappings, tolerating either a
 * bare array or an object wrapping one. */
export function parseFieldMappings(content: string): FieldMapping[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Object.values(parsed as Record<string, unknown>).find(Array.isArray) ?? [];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (x): x is FieldMapping =>
      !!x &&
      typeof x === "object" &&
      typeof (x as FieldMapping).index === "number" &&
      typeof (x as FieldMapping).value === "string" &&
      (x as FieldMapping).value.trim() !== ""
  );
}
