/**
 * Colour for the rendered resume.
 *
 * A document has one accent — picked in the builder, the way the typeface is —
 * and the source refers to it by name rather than repeating a hex code at every
 * heading. Changing the accent then restyles the whole page from one control.
 *
 * Like fonts.ts this stays free of React so the main process can read the
 * default without pulling the renderer into a build with no JSX configured.
 */

/** The accents on offer. Muted rather than bright: this is print, and a resume
 *  read on paper or through an applicant tracking system wants contrast more
 *  than colour. */
export const ACCENTS = [
    { id: "ink", label: "Ink", hex: "#111111" },
    { id: "slate", label: "Slate", hex: "#334155" },
    { id: "navy", label: "Navy", hex: "#1e3a8a" },
    { id: "teal", label: "Teal", hex: "#0f766e" },
    { id: "forest", label: "Forest", hex: "#166534" },
    { id: "burgundy", label: "Burgundy", hex: "#881337" },
    { id: "rust", label: "Rust", hex: "#9a3412" },
    { id: "violet", label: "Violet", hex: "#5b21b6" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export const DEFAULT_ACCENT: AccentId = "ink";

/** The hex for a stored id, falling back to the default for one this build no
 *  longer offers. */
export function accentHex(id?: string): string {
    return (ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[0]).hex;
}

/** Greys a document can name without reaching for a hex code. */
const NAMED_COLORS: Record<string, string> = {
    ink: "#111111",
    muted: "#444444",
    faint: "#6b7280",
    white: "#ffffff",
};

/**
 * Turns a `color:` or `bg:` value from the source into CSS.
 *
 * `'accent'` resolves to a custom property rather than to the hex itself, so
 * the accent lives in one place in the compiled document and every element
 * that referred to it follows a change of accent without recompiling.
 * Anything unrecognised returns undefined, which leaves the element inheriting
 * — a typo shifts nothing rather than painting the page an unintended colour.
 */
export function resolveColor(value?: string | number): string | undefined {
    if (typeof value !== "string") return undefined;
    const wanted = value.trim();
    if (wanted === "accent") return "var(--accent)";
    if (NAMED_COLORS[wanted.toLowerCase()]) return NAMED_COLORS[wanted.toLowerCase()];
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(wanted)) return wanted;
    return undefined;
}
