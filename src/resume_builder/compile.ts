import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Parser } from "./parser";
import { ASTToReactNode, type BuildResult } from "./uiRenderer";
import { fontStack } from "./fonts";
import { accentHex } from "./colors";

export interface CompileOptions {
    /** Which of `FONTS` to set the document in. */
    font?: string;
    /** Which of `ACCENTS` the document's `color : 'accent'` resolves to. */
    accent?: string;
}

export interface CompileResult {
    /** A complete standalone document, ready to hand an iframe's `srcDoc`. */
    html: string;
    /** Set when the source failed to tokenize, parse, or render. `html` then
     *  holds an empty page so the preview clears rather than showing stale
     *  output that no longer matches the source. */
    error?: string;
}

/**
 * Walks the tree `NodeBuilder` returns and collects the renderable nodes.
 * `macro:` contributes `null` (definitions render nothing) and unapplied
 * templates come back as functions — both are dropped, so what remains is the
 * output of `main:`.
 */
function collect(result: BuildResult, out: ReactNode[]): void {
    if (result === null || result === undefined) return;
    if (Array.isArray(result)) {
        for (const child of result) collect(child, out);
        return;
    }
    // a macro template that was never applied by `main:`
    if (typeof result === "function") return;
    // an argument pair that escaped its keyword — not renderable
    if (typeof result === "object" && "__arg" in (result as object)) return;
    out.push(result as ReactNode);
}

/** Width of the page the document lays out on, in CSS pixels — A4 at 96dpi.
 *  The preview renders at exactly this width and is scaled to fit its pane,
 *  so what's on screen is the same layout the PDF gets. */
export const PAGE_WIDTH_PX = 794;

/** Wraps rendered markup in a self-contained document. The iframe has no
 *  access to the app's stylesheet, so the page carries its own base rules and
 *  every component-level rule travels inline on the elements themselves.
 *
 *  On screen the body is a sheet of paper floating on a grey backdrop. Under
 *  print — which is what `webContents.printToPDF` emulates, see main/pdf.ts —
 *  the backdrop, shadow and page margin drop away and the paper becomes the
 *  sheet the printer is already holding, so the exported PDF is the same
 *  document without the viewer chrome baked into it. */
function page(body: string, font: string, accent: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; }
  /* The accent lives here once; everything that asked for it refers back. */
  :root { --accent: ${accent}; }
  *, *::before, *::after { box-sizing: border-box; }
  html {
    margin: 0;
    padding: 0;
    background: #525659;
    /* The page floats on this backdrop and scrolls against it, so the
       scrollbar belongs to the viewer rather than to the document. */
    scrollbar-width: thin;
    scrollbar-color: #8a8d91 #525659;
  }
  body {
    width: 210mm;
    min-height: 297mm;
    /* auto centres the sheet whenever the canvas is wider than it is, and
       gives way to a scroll once a zoom makes the sheet the wider of the two. */
    margin: 24px auto;
    background: #ffffff;
    color: #111111;
    font-family: ${font};
    /* Resume typography: ~10pt body set tight, so a page holds a page's
       worth. Components override the size per element; this is the floor
       anything unstyled lands on. */
    font-size: 13px;
    line-height: 1.35;
    padding: 48px;
    box-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
  }
  @media print {
    html { background: #ffffff; }
    body {
      width: auto;
      min-height: 0;
      margin: 0;
      /* The printer supplies the margin instead — matched to this padding in
         main/pdf.ts — so page two onward is inset like page one, which a
         padded box alone would not do. */
      padding: 0;
      box-shadow: none;
    }
  }
</style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * Compiles `.resb` source into a standalone HTML document.
 *
 * Never throws: a syntax error in the source is an expected state while the
 * user is mid-keystroke, so failures come back as `error` alongside a blank
 * page.
 */
export function compileToHtml(source: string, options: CompileOptions = {}): CompileResult {
    const font = fontStack(options.font);
    const accent = accentHex(options.accent);
    if (!source.trim()) return { html: page("", font, accent) };
    try {
        const ast = new Parser().parse(source);
        const nodes: ReactNode[] = [];
        collect(new ASTToReactNode().NodeBuilder(ast), nodes);
        const body = renderToStaticMarkup(
            createElement(
                Fragment,
                null,
                ...nodes.map((node, i) => createElement(Fragment, { key: i }, node))
            )
        );
        return { html: page(body, font, accent) };
    } catch (e) {
        return { html: page("", font, accent), error: e instanceof Error ? e.message : String(e) };
    }
}
