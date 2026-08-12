/**
 * The typefaces a resume can be set in.
 *
 * Every stack is families the machine already has — a resume is a document
 * people print and email, and a web font that failed to load would silently
 * reflow the page the user just proof-read. Each entry ends in a generic
 * family so an unlucky machine still lands on the right kind of face.
 *
 * This is deliberately its own module, free of React: the main process reads
 * the default from here, and importing it from compile.ts would pull the whole
 * renderer into a build that has no JSX configured.
 */
export const FONTS = [
    { id: "georgia", label: "Georgia", stack: `Georgia, "Times New Roman", serif` },
    { id: "cambria", label: "Cambria", stack: `Cambria, Georgia, serif` },
    { id: "garamond", label: "Garamond", stack: `Garamond, "EB Garamond", Georgia, serif` },
    { id: "times", label: "Times New Roman", stack: `"Times New Roman", Times, serif` },
    { id: "palatino", label: "Palatino", stack: `"Palatino Linotype", Palatino, Georgia, serif` },
    { id: "calibri", label: "Calibri", stack: `Calibri, Candara, "Segoe UI", sans-serif` },
    { id: "segoe", label: "Segoe UI", stack: `"Segoe UI", Tahoma, sans-serif` },
    { id: "arial", label: "Arial", stack: `Arial, Helvetica, sans-serif` },
    { id: "verdana", label: "Verdana", stack: `Verdana, Geneva, sans-serif` },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

export const DEFAULT_FONT: FontId = "georgia";

/** The CSS font-family for a stored id, falling back to the default for an id
 *  this build no longer offers. */
export function fontStack(id?: string): string {
    return (FONTS.find((font) => font.id === id) ?? FONTS[0]).stack;
}
