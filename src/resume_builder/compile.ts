import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Parser } from "./parser";
import { ASTToReactNode, type BuildResult } from "./uiRenderer";

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

/** Wraps rendered markup in a self-contained document. The iframe has no
 *  access to the app's stylesheet, so the page carries its own base rules and
 *  every component-level rule travels inline on the elements themselves. */
function page(body: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #ffffff;
    color: #111111;
    font-family: Georgia, "Times New Roman", serif;
    line-height: 1.4;
    padding: 48px;
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
export function compileToHtml(source: string): CompileResult {
    if (!source.trim()) return { html: page("") };
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
        return { html: page(body) };
    } catch (e) {
        return { html: page(""), error: e instanceof Error ? e.message : String(e) };
    }
}
