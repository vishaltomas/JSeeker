import type { CSSProperties, ReactNode } from "react";

// Types and Constants
const DEFAULT_PADDING_SIZE = 4 as const;
const DEFAULT_FONT_WEIGHT = 400 as const;
const DEFAULT_FONT_STYLE = 'Normal' as const;
const DEFAULT_PADDING_DIRECTION = 'All' as const;
const DEFAULT_FONT_SIZE = 18 as const;
const DEFAULT_ALIGN_STYLE = 'Left' as const;

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

export type Align = keyof typeof alignment;
export type Padding = keyof typeof padding_side;
export type FontStyle = keyof typeof font_style;

/** Padding sizes are written in Tailwind's spacing steps (1 = 0.25rem), so a
 * step is multiplied out to px to keep `ps: 4` meaning the same 16px it did
 * when this rendered as `p-4`. */
const PADDING_STEP_PX = 4;


// Cell and Blocks Interface
export interface CellProps {
    /** Where the content sits in the box; defaults to left-aligned. */
    align?: Align;
    className?: string;
    text?: string;
    fontSize?: number;
    padding?: Padding;
    paddingSize?: number;
    fontStyle?: FontStyle;
    fontWeight?: number;
}


export interface BlockProps {
    name?: string;
    children?: ReactNode;
    numChildren?: number;
}


// Cell React Node
/** A single aligned region of a resume block — the leaf the parsed document
 * renders its content into. */
export function Cell({
    className="",
    text,
    align = DEFAULT_ALIGN_STYLE,
    fontSize = DEFAULT_FONT_SIZE,
    padding = DEFAULT_PADDING_DIRECTION,
    paddingSize = DEFAULT_PADDING_SIZE,
    fontStyle = DEFAULT_FONT_STYLE,
    fontWeight = DEFAULT_FONT_WEIGHT
}: CellProps) {
    // initialize the user defined styles
    const style: CSSProperties = {
        display: 'flex',
        fontSize: `${fontSize}px`,
        fontWeight,
        [padding_side[padding]]: `${paddingSize * PADDING_STEP_PX}px`,
        ...alignment[align],
        ...font_style[fontStyle]
    };
    return (
        <div className={className} style={style}>
            {text}
        </div>);
}

// Block React Node
/** A horizontal band of the resume page, holding one or more `Cell`s. */
export function Block({ name, children, numChildren = 1 }: BlockProps) {
    const style: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `repeat(${numChildren}, minmax(0, 1fr))`,
        width: '100%'
    };
    return (
        <div className={name} style={style}>
            {children}
        </div>
    );

}
