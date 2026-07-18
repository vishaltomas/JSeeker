export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/** A form field the renderer's heuristic matcher couldn't confidently label,
 * sent to the local model as a fallback. */
export interface FieldDescriptor {
  index: number;
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  label?: string;
  context?: string;
  options?: string[];
  required?: boolean;
}

export interface FieldMapping {
  index: number;
  value: string;
}
