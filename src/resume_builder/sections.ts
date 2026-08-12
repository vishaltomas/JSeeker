/**
 * A `.resb` document is exactly two blocks — `macro:( … )` defining the layout,
 * then `main:( … )` supplying the content — so the editor gives each its own
 * tab. This splits a document into those two halves and puts it back together.
 *
 * Anything that isn't that shape is rejected by name rather than guessed at: a
 * file with two `main:` blocks, or none, is a mistake the user wants told about
 * at import time, not something to silently repair.
 */

export type SectionName = "macro" | "main";

export interface Sections {
    /** Body of `macro:( … )`, without the surrounding `macro:(` and `)`. */
    macro: string;
    /** Body of `main:( … )`, likewise. */
    main: string;
    /** Whatever followed the last block — usually notes in a comment. Carried
     *  through a round trip so editing a tab doesn't delete it. */
    trailer: string;
}

export type SplitResult =
    | { ok: true; sections: Sections }
    | { ok: false; error: string };

/** A section header: the name, a colon, an open paren, any spacing between.
 *  The leading class keeps it from matching inside a longer identifier. */
const HEADER = /(?:^|[^A-Za-z0-9_])(macro|main)\s*:\s*\(/g;

/**
 * Index of the `)` closing the block whose body starts at `bodyStart`, or -1.
 *
 * Counts depth so a nested `Cell( … )` doesn't end the block early. It does
 * not know about strings or comments — an unbalanced paren inside either will
 * cut the block in the wrong place, and the parse error that follows is what
 * reports it.
 */
function closingParen(source: string, bodyStart: number): number {
    let depth = 1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")" && --depth === 0) return i;
    }
    return -1;
}

/** Splits a document into its `macro` and `main` bodies, or explains why it
 *  isn't a document. */
export function splitSections(source: string): SplitResult {
    const headers = [...source.matchAll(HEADER)].map((m) => ({
        name: m[1] as SectionName,
        // past the single character the leading class ate, if any
        start: m.index + m[0].indexOf(m[1]),
        bodyStart: m.index + m[0].length,
    }));

    for (const name of ["macro", "main"] as const) {
        const count = headers.filter((h) => h.name === name).length;
        if (count === 0) return { ok: false, error: `Missing a ${name}:( … ) block.` };
        if (count > 1) {
            return {
                ok: false,
                error: `Found ${count} ${name}:( … ) blocks — a resume must have exactly one.`,
            };
        }
    }
    // Only two headers can be left, one of each.
    const [macro, main] = headers;
    if (macro.name !== "macro") {
        return { ok: false, error: "macro:( … ) must come before main:( … )." };
    }

    const macroEnd = closingParen(source, macro.bodyStart);
    if (macroEnd < 0) return { ok: false, error: "The macro:( … ) block is never closed." };
    const mainEnd = closingParen(source, main.bodyStart);
    if (mainEnd < 0) return { ok: false, error: "The main:( … ) block is never closed." };

    if (source.slice(0, macro.start).trim() || source.slice(macroEnd + 1, main.start).trim()) {
        return {
            ok: false,
            error: "Anything outside the macro:( … ) and main:( … ) blocks must come after them.",
        };
    }

    return {
        ok: true,
        sections: {
            // Only the whitespace against the parens goes, so a tab doesn't
            // open on a blank line. Inner indentation is left as typed.
            macro: source.slice(macro.bodyStart, macroEnd).trim(),
            main: source.slice(main.bodyStart, mainEnd).trim(),
            trailer: source.slice(mainEnd + 1).trim(),
        },
    };
}

/** Rebuilds a document from its parts. */
export function joinSections({ macro, main, trailer }: Sections): string {
    const doc = `macro:(\n${macro}\n)\nmain:(\n${main}\n)\n`;
    return trailer ? `${doc}\n${trailer}\n` : doc;
}

/** Seeds a new document so it compiles to something visible rather than a
 *  blank pane. */
const STARTER_SECTIONS: Sections = {
    macro: [
        "Name: Cell(fw : 700, fs : 30, ta : 'Center', ps : 0),",
        "Contact: Cell(fs : 12, ta : 'Center', ps : 0, mt : 6),",
        "Summary: Cell(fs : 12, ps : 0, mt : 12),",
        "Heading: Cell(fw : 700, fs : 15, ps : 0, mt : 14, mb : 5, rule : 1),",
        "Role: Block(spread : 'Between', gap : 16, mt : 8,",
        "    Cell(fs : 13, ps : 0, grow : 1),",
        "    Cell(fs : 13, ps : 0, nowrap : 1)",
        "),",
        "Points: Block(dir : 'Column', gap : 2, mt : 3,",
        "    Cell(fs : 12, ps : 0, bullet : 1)",
        "),",
        "Line: Cell(fs : 12, ps : 0, mt : 4)",
    ].join("\n"),
    main: [
        "Name: 'Your Name',",
        "Contact: 'city, country | you@example.com | github.com/you',",
        "",
        "Summary: 'A sentence or two on what you do and what you are looking for.',",
        "",
        "Heading: 'Experience',",
        "Role: '**Job title**, Employer — City' | 'Month Year – Month Year',",
        "Points: 'What you built, and what it changed.'",
        "    | 'Another point — **bold** and *italic* both work inside a line.'",
        "    | 'Add a value and the block draws another bullet.',",
        "",
        "Heading: 'Education',",
        "Role: '**University**, Degree' | 'Year – Year',",
        "",
        "Heading: 'Skills',",
        "Line: '**Languages:** the ones you would be happy interviewed on'",
    ].join("\n"),
    trailer: "",
};

export const STARTER_SOURCE = joinSections(STARTER_SECTIONS);
