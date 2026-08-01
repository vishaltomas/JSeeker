import type { ReactNode } from "react";
import { cx } from "../../renderer/ui";

// Types and Constants
const DEFAULT_PADDING_SIZE: number = 4
const DEFAULT_FONT_WEIGHT: number = 400

export const alignment = {
    Top: "items-start",
    Bottom: "items-end",
    Left: "justify-start",
    Right: "justify-end",
};

export const padding_side = {
    Top: "pt-",
    Bottom: "pb-",
    Left: "pl-",
    Right: "pr-",
    All: "p-"
};

export const font_style = {
    Normal: 'skew-x-0',
    Italic: 'skew-x-4',
    SkewSmall: '-skew-x-2',
    SkewMedium: '-skew-x-6',
    SkewLarge: '-skew-x-12'
};

export type Align = keyof typeof alignment;
export type Padding = keyof typeof padding_side;
export type FontStyle = keyof typeof font_style;


// Cell and Blocks Interface
interface CellProps {
    /** Where the content sits in the box; defaults to left-aligned. */
    align?: Align;
    className?: string;
    text?: string;
    fontSize?: number;
    padding?: Padding;
    paddingSize?: number;
    fontStyle?: string;
    fontWeight?: number;
}


interface BlockProps {
    name?: string;
    children?: ReactNode;
    numChildren?: number;
}


// Cell React Node
/** A single aligned region of a resume block — the leaf the parsed document
 * renders its content into. */
export function Cell({
    align = "Left", className, text,
    fontSize, padding = "All", paddingSize = DEFAULT_PADDING_SIZE,
    fontStyle, fontWeight = DEFAULT_FONT_WEIGHT }: CellProps) {
    // initialize the user defined styles
    const font_size = `text-[${fontSize}px]`
    const padding_style = padding_side[padding] + `${paddingSize}`
    const font_weight = `font-[${fontWeight}]`
    return (
        <div className={cx("flex", alignment[align], className, font_size, fontStyle, padding_style, font_weight)}>
            {text}
        </div>);
}

// Block React Node
/** A horizontal band of the resume page, holding one or more `Cell`s. */
export function Block({ name, children, numChildren }: BlockProps) {
    const grid_columns = `grid-cols-${numChildren}`
    return (
        <div className={cx("container mx-auto grid grid-flow-col", grid_columns, name)}>
            {children}
        </div>
    );

}
