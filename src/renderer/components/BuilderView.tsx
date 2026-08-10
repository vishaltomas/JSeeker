import { useEffect, useState } from "react";
import { compileToHtml, type CompileResult } from "../../resume_builder/compile";
import type { Store } from "../types";
import { viewSection } from "../ui";

interface BuilderViewProps {
  visible: boolean;
  store: Store;
  persist: (next: Store) => void;
}

/** How long typing has to pause before the source is recompiled. Short enough
 * to feel live, long enough that a half-typed line doesn't flash an error. */
const COMPILE_DEBOUNCE_MS = 250;

/** Writing to disk is far more expensive than compiling, so it waits longer. */
const PERSIST_DEBOUNCE_MS = 800;

const paneLabel =
  "flex-shrink-0 border-b border-line-subtle bg-surface-1 px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink-muted";

/**
 * Editor for the `.resb` resume language: source on the left, the compiled
 * document on the right.
 *
 * The preview is an iframe fed a complete HTML document rather than React
 * rendered inline, so the resume's styling and the app's stylesheet cannot
 * reach each other — and the same string is what you'd write to disk or hand
 * to a PDF renderer.
 */
export function BuilderView({ visible, store, persist }: BuilderViewProps) {
  const [source, setSource] = useState(store.builderSource);
  const [compiled, setCompiled] = useState<CompileResult>(() => compileToHtml(store.builderSource));

  // Seeding from `store` in useState is enough: App renders nothing until the
  // store has loaded, so this view only ever mounts with the real source.
  useEffect(() => {
    const timer = setTimeout(() => setCompiled(compileToHtml(source)), COMPILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source]);

  useEffect(() => {
    if (source === store.builderSource) return;
    const timer = setTimeout(() => persist({ ...store, builderSource: source }), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, store, persist]);

  return (
    <section className={viewSection(visible)}>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 w-1/2 flex-col border-r border-line">
          <div className={paneLabel}>Source</div>
          <textarea
            className="min-h-0 flex-1 resize-none bg-surface-0 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink outline-none"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            placeholder="macro:( … )&#10;main:( … )"
          />
          {compiled.error && (
            <p className="flex-shrink-0 border-t border-line-subtle bg-surface-1 px-3 py-2 font-mono text-[11.5px] text-danger-text">
              {compiled.error}
            </p>
          )}
        </div>

        <div className="flex min-h-0 w-1/2 flex-col">
          <div className={paneLabel}>Preview</div>
          <iframe
            title="Resume preview"
            srcDoc={compiled.html}
            // No scripts, no same-origin: the preview is static markup and has
            // no reason to reach back into the app.
            sandbox=""
            className="min-h-0 flex-1 border-0 bg-white"
          />
        </div>
      </div>
    </section>
  );
}
