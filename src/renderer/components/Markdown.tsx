import { useMemo } from "react";
import type { MouseEvent } from "react";
import MarkdownIt from "markdown-it";
import { cx } from "../ui";

interface MarkdownProps {
  text: string;
  className?: string;
}

/**
 * Model output is rendered through `dangerouslySetInnerHTML`, so the parser
 * config is the security boundary:
 *
 * - `html: false` (markdown-it's default, set explicitly here so it can't be
 *   loosened by accident) escapes any raw HTML in the source rather than
 *   passing it through. Without it, a model echoing a user-supplied
 *   `<img onerror=...>` back into chat would execute it.
 * - `linkify` only ever produces `<a href>` from bare URLs, and the click
 *   handler below vets the scheme again before anything is opened.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

/**
 * Renders assistant messages as markdown.
 *
 * Links are intercepted rather than followed: the app window loads over
 * `file://` and has no browser chrome, so an in-window navigation would strand
 * the user with no way back. `openExternal` hands http(s) URLs to the OS
 * browser and refuses everything else.
 */
export function Markdown({ text, className }: MarkdownProps) {
  const html = useMemo(() => md.render(text), [text]);

  function onClick(e: MouseEvent<HTMLDivElement>): void {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute("href");
    if (href) void window.api.openExternal(href);
  }

  return (
    <div
      className={cx("md", className)}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
