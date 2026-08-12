import type { CSSProperties, ReactNode } from "react";
import { fontStack } from "../fonts";
import { resolveColor } from "../colors";

// Types and Constants
const DEFAULT_PADDING_SIZE = 4 as const;
const DEFAULT_FONT_WEIGHT = 400 as const;
const DEFAULT_FONT_STYLE = 'Normal' as const;
const DEFAULT_PADDING_DIRECTION = 'All' as const;
const DEFAULT_FONT_SIZE = 18 as const;
const DEFAULT_ALIGN_STYLE = 'Left' as const;
const DEFAULT_TEXT_ALIGN = 'Left' as const;
const DEFAULT_DIRECTION = 'Row' as const;
const DEFAULT_SPREAD = 'Even' as const;

/**
 * These maps hold inline style values rather than Tailwind class names. The
 * compiled resume is serialised to a standalone HTML document and shown in an
 * iframe, where the app's stylesheet does not exist — so every rule a cell
 * needs has to travel with the markup. It also sidesteps Tailwind's JIT
 * scanner, which never sees class names assembled at runtime
 * (`text-[${fontSize}px]`) and so emits no CSS for them.
 */
export const alignment = {
    Top: { alignItems: 'flex-start' },
    Bottom: { alignItems: 'flex-end' },
    Left: { justifyContent: 'flex-start' },
    Right: { justifyContent: 'flex-end' },
    Center: { justifyContent: 'center' },
} satisfies Record<string, CSSProperties>;

/** Which CSS padding property each direction sets. */
export const padding_side = {
    Top: 'paddingTop',
    Bottom: 'paddingBottom',
    Left: 'paddingLeft',
    Right: 'paddingRight',
    All: 'padding'
} satisfies Record<string, keyof CSSProperties>;

export const font_style = {
    Normal: {},
    Italic: { fontStyle: 'italic' },
    SkewSmall: { transform: 'skewX(-2deg)' },
    SkewMedium: { transform: 'skewX(-6deg)' },
    SkewLarge: { transform: 'skewX(-12deg)' }
} satisfies Record<string, CSSProperties>;

/** Where the *lines of text* sit inside a cell, as distinct from `alignment`,
 *  which places the cell's content box. A centred heading wants this; a
 *  justified summary paragraph can only be done with this. */
export const text_align = {
    Left: 'left',
    Center: 'center',
    Right: 'right',
    Justify: 'justify'
} satisfies Record<string, CSSProperties['textAlign']>;

/** How a row shares its width out among its cells. */
export const spread = {
    /** Equal columns — every cell gets the same width. */
    Even: 'even',
    /** First cell takes the slack, the last sits against the right edge: a
     *  job title with its dates opposite. */
    Between: 'between',
    /** Cells sit together at the start, each as wide as its content. */
    Start: 'start'
} as const;

export type Align = keyof typeof alignment;
export type Padding = keyof typeof padding_side;
export type FontStyle = keyof typeof font_style;
export type TextAlign = keyof typeof text_align;
export type Spread = keyof typeof spread;
export type Direction = 'Row' | 'Column';

/** Padding sizes are written in Tailwind's spacing steps (1 = 0.25rem), so a
 * step is multiplied out to px to keep `ps: 4` meaning the same 16px it did
 * when this rendered as `p-4`. */
const PADDING_STEP_PX = 4;

/** Marks up `**bold**` and `*italic*` inside a line.
 *
 * A resume line is rarely all one weight — a role is bold and its employer
 * isn't, a publication title is roman and its venue italic — and the `.resb`
 * language has no way to say that, since every value is one flat string. This
 * gives the string two escapes without turning it into a markup language. */
export function inline(text?: string): ReactNode {
    if (!text) return null;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    for (const match of text.matchAll(/\*\*([^*]+)\*\*|\*([^*]+)\*/g)) {
        if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
        nodes.push(
            match[1] ? (
                <strong key={match.index}>{match[1]}</strong>
            ) : (
                <em key={match.index}>{match[2]}</em>
            )
        );
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
}


// Cell and Blocks Interface
export interface CellProps {
    /** Where the content sits in the box; defaults to left-aligned. */
    align?: Align;
    /** Where the lines of text sit within that box. */
    textAlign?: TextAlign;
    className?: string;
    text?: string;
    fontSize?: number;
    padding?: Padding;
    paddingSize?: number;
    fontStyle?: FontStyle;
    fontWeight?: number;
    /** Space above and below the cell, in px — what separates a section
     *  heading from the entry before it. */
    marginTop?: number;
    marginBottom?: number;
    /** Thickness in px of a rule drawn under the cell: the line a resume puts
     *  beneath a section heading. 0 (the default) draws none. */
    rule?: number;
    /** Non-zero turns the cell into a bullet point, marker and all. */
    bullet?: number;
    /** How much of a row's spare width this cell takes. The title side of a
     *  title/date row sets this so the date keeps only what it needs. */
    grow?: number;
    /** Non-zero keeps the text on one line — for dates, which read badly
     *  broken across two. */
    nowrap?: number;
    /** Typeface for this cell alone, as an id from FONTS ('arial', 'garamond',
     *  …). Left unset, the cell inherits the document's face — the one chosen
     *  with the builder's font picker. */
    font?: string;
    /** Text colour: 'accent' for the document's accent, a grey by name, or a
     *  hex code. The rule under a heading is drawn in the text colour, so
     *  colouring a heading colours its rule with it. */
    color?: string;
    /** Background colour, same values — for a section band or a highlighted
     *  line. */
    background?: string;
}


export interface BlockProps {
    name?: string;
    children?: ReactNode;
    numChildren?: number;
    /** `Row` lays the cells across the page, `Column` stacks them — a column
     *  of bullet cells is how a list of points is built. */
    direction?: Direction;
    /** How a row shares its width out; see `spread`. */
    spread?: Spread;
    /** Space between cells, in px. */
    gap?: number;
    marginTop?: number;
    /** Space under the block — what separates one job's last bullet from the
     *  next job's title. */
    marginBottom?: number;
    /** Typeface for the whole band, as an id from FONTS. Its cells inherit it
     *  unless they name one of their own. */
    font?: string;
    /** Text colour for the band; its cells inherit it. */
    color?: string;
    /** Background colour behind the whole band. */
    background?: string;
}


// Cell React Node
/** A single aligned region of a resume block — the leaf the parsed document
 * renders its content into. Every part of a resume line is one of these: a
 * name, a heading with its rule, a date, a bullet, a paragraph. */
export function Cell({
    className="",
    text,
    align = DEFAULT_ALIGN_STYLE,
    textAlign = DEFAULT_TEXT_ALIGN,
    fontSize = DEFAULT_FONT_SIZE,
    padding = DEFAULT_PADDING_DIRECTION,
    paddingSize = DEFAULT_PADDING_SIZE,
    fontStyle = DEFAULT_FONT_STYLE,
    fontWeight = DEFAULT_FONT_WEIGHT,
    marginTop = 0,
    marginBottom = 0,
    rule = 0,
    bullet = 0,
    grow,
    nowrap = 0,
    font,
    color,
    background
}: CellProps) {
    // initialize the user defined styles
    const style: CSSProperties = {
        display: 'flex',
        fontSize: `${fontSize}px`,
        fontWeight,
        [padding_side[padding]]: `${paddingSize * PADDING_STEP_PX}px`,
        textAlign: text_align[textAlign],
        ...alignment[align],
        ...font_style[fontStyle]
    };
    if (font) style.fontFamily = fontStack(font);
    const ink = resolveColor(color);
    if (ink) style.color = ink;
    const paper = resolveColor(background);
    if (paper) style.background = paper;
    if (marginTop) style.marginTop = `${marginTop}px`;
    if (marginBottom) style.marginBottom = `${marginBottom}px`;
    if (rule) {
        style.borderBottom = `${rule}px solid currentColor`;
        // The rule wants to sit under the text, not against it.
        style.paddingBottom = '2px';
    }
    if (grow !== undefined) style.flexGrow = grow;
    if (nowrap) {
        style.whiteSpace = 'nowrap';
        style.flexShrink = 0;
    }

    // A bullet is a marker the text hangs off, so the two are separate boxes:
    // a wrapped second line lines up under the first rather than under the dot.
    if (bullet) {
        return (
            <div className={className} style={{ ...style, gap: '6px' }}>
                <span style={{ flexShrink: 0 }}>•</span>
                <span style={CONTENT_STYLE}>{inline(text)}</span>
            </div>
        );
    }
    return (
        <div className={className} style={style}>
            <span style={CONTENT_STYLE}>{inline(text)}</span>
        </div>);
}

/**
 * The cell's text always goes in one box of its own.
 *
 * Two things go wrong without it. A line that mixes weights — `**Role**, Firm`
 * — arrives as several nodes, and a flex container makes each of them a
 * separate item, so the bold part and the rest get laid out as columns that
 * wrap independently. And `textAlign` has nothing to work on, because a bare
 * flex item is only as wide as its content: there is no spare width to centre
 * the text in. Width 100% and min-width 0 give the text one full-width box
 * that still shrinks inside a row.
 */
const CONTENT_STYLE: CSSProperties = { width: '100%', minWidth: 0 };

// Block React Node
/** A band of the resume page holding one or more `Cell`s: a row of them
 * across the page, or a column of them down it. */
export function Block({
    name,
    children,
    numChildren = 1,
    direction = DEFAULT_DIRECTION,
    spread: spreadStyle = DEFAULT_SPREAD,
    gap = 0,
    marginTop = 0,
    marginBottom = 0,
    font,
    color,
    background
}: BlockProps) {
    const style: CSSProperties = { width: '100%' };
    if (font) style.fontFamily = fontStack(font);
    const ink = resolveColor(color);
    if (ink) style.color = ink;
    const paper = resolveColor(background);
    if (paper) style.background = paper;
    if (gap) style.gap = `${gap}px`;
    if (marginTop) style.marginTop = `${marginTop}px`;
    if (marginBottom) style.marginBottom = `${marginBottom}px`;

    if (direction === 'Column') {
        style.display = 'flex';
        style.flexDirection = 'column';
    } else if (spreadStyle === 'Even') {
        // The original behaviour, and still the default: equal columns.
        style.display = 'grid';
        style.gridTemplateColumns = `repeat(${numChildren}, minmax(0, 1fr))`;
    } else {
        style.display = 'flex';
        // Baseline, so a large title and a small date sit on the same line.
        style.alignItems = 'baseline';
        style.justifyContent = spreadStyle === 'Between' ? 'space-between' : 'flex-start';
    }

    return (
        <div className={name} style={style}>
            {children}
        </div>
    );

}
