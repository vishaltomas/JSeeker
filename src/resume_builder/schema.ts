/**
 * The argument allowlist for the `.resb` keywords.
 *
 * An argument name has to appear in one of these tables to be legal — the
 * renderer throws on anything else rather than ignoring it (see
 * uiRenderer.ts's `NodeBuilder`), so this is the language's vocabulary rather
 * than a convenience list.
 *
 * It lives here, apart from uiRenderer.ts, because three places need it and
 * only one of them can load React: the renderer maps a name to a component
 * prop, agents/tools.ts checks a generated document before saving it, and
 * agents/skills.ts builds the reference a model writes from. Importing
 * uiRenderer.ts for the names would pull `ui/Components.tsx` — and with it JSX
 * — into the main process build, which has no `jsx` compiler option.
 *
 * Each entry maps a name written in source to the prop it sets. Canonical
 * names map to themselves so both spellings are accepted, and `as const` keeps
 * the prop names literal, which is what lets uiRenderer.ts type-check these
 * against `CellProps`/`BlockProps` at the point it adopts them.
 */

export const CELL_ARGS = {
    // shorthand
    fw: "fontWeight",
    fs: "fontSize",
    fst: "fontStyle",
    al: "align",
    pd: "padding",
    ps: "paddingSize",
    txt: "text",
    cls: "className",
    ta: "textAlign",
    mt: "marginTop",
    mb: "marginBottom",
    c: "color",
    bg: "background",
    // canonical spellings
    fontWeight: "fontWeight",
    fontSize: "fontSize",
    fontStyle: "fontStyle",
    align: "align",
    textAlign: "textAlign",
    padding: "padding",
    paddingSize: "paddingSize",
    text: "text",
    className: "className",
    marginTop: "marginTop",
    marginBottom: "marginBottom",
    rule: "rule",
    bullet: "bullet",
    grow: "grow",
    nowrap: "nowrap",
    font: "font",
    color: "color",
    background: "background",
} as const;

export const BLOCK_ARGS = {
    // `Block` takes its cells positionally; the rest are named args.
    // `children` and `numChildren` are derived from the parsed args, so they
    // are deliberately absent — not settable from source.
    name: "name",
    dir: "direction",
    gap: "gap",
    mt: "marginTop",
    mb: "marginBottom",
    c: "color",
    bg: "background",
    direction: "direction",
    spread: "spread",
    marginTop: "marginTop",
    marginBottom: "marginBottom",
    font: "font",
    color: "color",
    background: "background",
} as const;

/** The keywords, and the arguments each one accepts. */
export const KEYWORD_ARGS: Record<string, Readonly<Record<string, string>>> = {
    Cell: CELL_ARGS,
    Block: BLOCK_ARGS,
};

/** Names the tokenizer reads as keywords, so a layout can't be called one —
 *  the parser would take the definition's own name for the keyword. */
export const RESERVED_NAMES = Object.keys(KEYWORD_ARGS);

/** Whether `name` is a legal argument for `keyword`. */
export function isLegalArg(keyword: string, name: string): boolean {
    return Object.prototype.hasOwnProperty.call(KEYWORD_ARGS[keyword] ?? {}, name);
}

/**
 * The argument names of a keyword, grouped by the prop they set and each
 * group ordered shorthand-first — `["fs", "fontSize"]`, `["rule"]`.
 *
 * Documentation generated from the allowlist itself rather than kept beside
 * it, so a name added below can't go unmentioned in what a model is told.
 */
export function argSpellings(keyword: string): string[][] {
    const table = KEYWORD_ARGS[keyword] ?? {};
    const byProp = new Map<string, string[]>();
    for (const [name, prop] of Object.entries(table)) {
        const spellings = byProp.get(prop) ?? [];
        spellings.push(name);
        byProp.set(prop, spellings);
    }
    // Shortest first puts the shorthand ahead of the canonical spelling; a
    // prop with only one name (`rule`, `bullet`) comes back as a single entry.
    return [...byProp.values()].map((names) => [...names].sort((a, b) => a.length - b.length));
}
