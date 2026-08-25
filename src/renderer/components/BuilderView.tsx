import {
  Check,
  Copy,
  Download,
  FilePlus,
  FileText,
  FolderOpen,
  LoaderCircle,
  MoreVertical,
  Pencil,
  Play,
  RefreshCw,
  Save,
  SaveOff,
  Sparkles,
  Trash2,
  TriangleAlert,
  Zap,
  ZapOff,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compileToHtml,
  PAGE_WIDTH_PX,
  type CompileResult,
} from "../../resume_builder/compile";
import { FONTS } from "../../resume_builder/fonts";
import { ACCENTS, accentHex } from "../../resume_builder/colors";
import {
  joinSections,
  splitSections,
  STARTER_SOURCE,
  type SectionName,
  type Sections,
} from "../../resume_builder/sections";
import type { BuilderFile, Store } from "../types";
import { BUILDER_DOCS } from "./builderDocs";
import { ChatDock } from "./builder/ChatDock";
import { Markdown } from "./Markdown";
import { cx, viewSection } from "../ui";

interface BuilderViewProps {
  visible: boolean;
  store: Store;
  persist: (next: Store) => void | Promise<boolean>;
}

/** How long typing has to pause before the source is recompiled. Short enough
 * to feel live, long enough that a half-typed line doesn't flash an error. */
const COMPILE_DEBOUNCE_MS = 250;

/** Writing to disk is far more expensive than compiling, so it waits longer. */
const SAVE_DEBOUNCE_MS = 800;

const EMPTY_SECTIONS: Sections = { macro: "", main: "", trailer: "" };

/** How long the compiling overlay stays up at minimum. Compiling is
 * synchronous and usually finishes in a few milliseconds — too fast to see —
 * and a flicker reads as "nothing happened". Holding it briefly makes the
 * press land, without being long enough to feel like waiting. */
const COMPILE_FEEDBACK_MS = 400;

/** Preview zoom steps, smallest first. */
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Backdrop left either side of the page when it's fitted to the canvas, in
 * document pixels — the page floats rather than butting up against the edge. */
const PAGE_GUTTER_PX = 24;

/** Header strip above each pane. Fixed height so the four line up despite
 * carrying different controls.
 *
 * It scrolls sideways rather than clipping: the row is four panes wide now,
 * and a control that has quietly fallen off the end of a toolbar is a control
 * the user cannot reach at all. The scrollbar itself is hidden — a 30px strip
 * has no room for one, and everything in here is reachable by keyboard too. */
const paneHeader =
  "flex h-[30px] flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-line-subtle bg-surface-1 px-2 text-[11px] uppercase tracking-wide text-ink-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const headerBtn =
  "flex flex-shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-ink-soft enabled:hover:bg-surface-3 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

/** The two editable halves of a document, plus the language reference. Docs
 * is a tab rather than a separate view so the syntax sits beside the source
 * it describes, one click away and without losing the preview. */
type EditorTab = SectionName | "docs";

const SECTION_TABS: { name: SectionName; label: string; hint: string }[] = [
  { name: "macro", label: "Macro", hint: "Layout definitions — one per named field" },
  { name: "main", label: "Main", hint: "Content — the values those definitions render" },
];

const DOCS_TAB = { name: "docs" as const, label: "Docs", hint: "How to write .resb" };

/** What the save indicator is showing. `idle` is a document nobody has touched
 * yet this session — there is nothing to have saved, so it just names the mode
 * the editor is in. */
type SaveState = "idle" | "saving" | "saved" | "error";

interface SaveLabel {
  icon: typeof Check;
  text: string;
  className: string;
}

const SAVE_LABEL: Record<SaveState, SaveLabel> = {
  idle: { icon: Check, text: "Autosave", className: "text-ink-faint" },
  saving: { icon: LoaderCircle, text: "Saving…", className: "text-ink-faint" },
  saved: { icon: Check, text: "Saved", className: "text-status-ok" },
  error: { icon: TriangleAlert, text: "Not saved", className: "text-danger-text" },
};

/** With autosave off the indicator reports the document instead of the writer:
 * whether there is anything waiting to be saved. */
const MANUAL_LABEL: Record<"clean" | "dirty", SaveLabel> = {
  clean: { icon: SaveOff, text: "Autosave off", className: "text-ink-faint" },
  dirty: { icon: SaveOff, text: "Unsaved", className: "text-status-warn" },
};

/** Names the downloaded PDF after whoever the resume is for, when `main:`
 * says. Best-effort: any miss just falls back to "resume.pdf". */
function suggestedName(main: string): string | undefined {
  return /(?:^|[\n,(])\s*Name\s*:\s*['"]([^'"]+)['"]/.exec(main)?.[1].trim();
}

/** Narrowest each pane is allowed to get, so a drag can't collapse one. */
const MIN_EXPLORER_PX = 130;
const MIN_PANE_SHARE = 0.15;

/** The assistant dock keeps a pixel width for the same reason the file list
 * does: a column of chat bubbles has a width it wants, and it isn't a
 * fraction of the window. */
const MIN_CHAT_PX = 240;
const DEFAULT_CHAT_PX = 320;

/**
 * Draggable divider between two panes.
 *
 * Pointer capture is what makes this work over the preview: without it the
 * iframe swallows the move events as soon as the cursor crosses into it, and
 * the drag dies halfway across the pane.
 */
function PaneDivider({
  onMove,
  onDragging,
}: {
  onMove: (clientX: number) => void;
  onDragging: (active: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function end(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    onDragging(false);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cx(
        "w-1 flex-shrink-0 cursor-ew-resize bg-line transition-colors hover:bg-accent",
        dragging && "bg-accent"
      )}
      onPointerDown={(event) => {
        event.preventDefault(); // don't start a text selection in the pane behind
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        onDragging(true);
      }}
      onPointerMove={(event) => dragging && onMove(event.clientX)}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}

/**
 * Typeface and accent, behind one button.
 *
 * They were two inline selects until the assistant joined the row: four panes
 * on a 1280px window leaves the preview's toolbar about 400px, and the two
 * pickers alone were most of it — Compile stayed put while Export quietly fell
 * off the end. Folded into a popover they cost one 30px button, and get more
 * room to read than they had inline.
 */
function StylePicker({
  font,
  accent,
  onFont,
  onAccent,
}: {
  font: string;
  accent: string;
  onFont: (id: string) => void;
  onAccent: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // A menu that outlives the click that dismissed it is worse than no menu.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
      <button
        className={cx(headerBtn, open && "bg-surface-3 text-white")}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="Typeface and accent colour"
      >
        <span
          aria-hidden
          className="h-3 w-3 flex-shrink-0 rounded-full border border-line-input"
          style={{ background: accentHex(accent) }}
        />
        <span className="normal-case tracking-normal">Style</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-[190px] rounded-md border border-line bg-surface-2 p-2.5 shadow-lg">
          <label className="mb-1 block text-[10.5px] normal-case tracking-normal text-ink-faint">
            Typeface
          </label>
          <select
            className="mb-2.5 w-full cursor-pointer rounded-md border border-line-input bg-surface-0 px-1.5 py-1 text-[11.5px] normal-case tracking-normal text-ink-soft outline-none focus:border-accent"
            value={font}
            onChange={(e) => onFont(e.target.value)}
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          <label
            className="mb-1 block text-[10.5px] normal-case tracking-normal text-ink-faint"
            title="Used wherever the source says color : 'accent'"
          >
            Accent
          </label>
          <select
            className="w-full cursor-pointer rounded-md border border-line-input bg-surface-0 px-1.5 py-1 text-[11.5px] normal-case tracking-normal text-ink-soft outline-none focus:border-accent"
            value={accent}
            onChange={(e) => onAccent(e.target.value)}
          >
            {ACCENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function tabClass(active: boolean): string {
  return cx(
    "h-full cursor-pointer border-b-2 px-3",
    active ? "border-accent text-ink" : "border-transparent hover:text-ink"
  );
}

/** Docs isn't a half of the document like Macro and Main are — it's reference
 * material — so it sits apart at the other end of the bar and is coloured to
 * say so rather than pretending to be a third section. */
function docsTabClass(active: boolean): string {
  return cx(
    "h-full cursor-pointer border-b-2 px-3 font-medium",
    active
      ? "border-[#eab308] bg-[#eab308] text-[#1e1f22]"
      : "border-transparent bg-[#eab308]/15 text-[#eab308] hover:bg-[#eab308]/25"
  );
}

/**
 * Editor for the `.resb` resume language: the workspace's documents on the
 * left, the open one's source next to them, the compiled document beside that,
 * and the assistant docked on the far right.
 *
 * Documents are files in the app's data folder (see main/builderWorkspace.ts),
 * and the source is edited as two tabs because a `.resb` file is always the
 * same two blocks — definitions and content (see resume_builder/sections.ts).
 *
 * The preview is an iframe fed a complete HTML document rather than React
 * rendered inline, so the resume's styling and the app's stylesheet cannot
 * reach each other — and the same string is what the PDF export renders.
 *
 * The assistant is in the same row rather than a screen of its own because a
 * resume is written by going back and forth: ask for a draft, watch it compile,
 * fix the line that reads badly. It is handed the open document as context and
 * writes its own into the workspace, so both halves of that loop stay here.
 */
export function BuilderView({ visible, store, persist }: BuilderViewProps) {
  const [files, setFiles] = useState<BuilderFile[]>([]);
  const [dir, setDir] = useState("");
  const [openPath, setOpenPath] = useState(store.builderFilePath);
  const [sections, setSections] = useState<Sections>(EMPTY_SECTIONS);
  const [fileStatus, setFileStatus] = useState("");
  const [tab, setTab] = useState<EditorTab>("main");
  const [compiled, setCompiled] = useState<CompileResult>(() => compileToHtml(""));
  /** The exact source `compiled` was built from, so the preview can say when
   * it's showing something older than the editor. */
  const [compiledFrom, setCompiledFrom] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Edits are what get written back. Until the user makes one, the document on
  // screen is exactly the file on disk and there is nothing to save — which is
  // also what keeps opening a file from immediately rewriting it. The ref is
  // what callbacks read (no stale closures); the state is what renders.
  const edited = useRef(false);
  const [dirty, setDirty] = useState(false);
  const source = useMemo(() => joinSections(sections), [sections]);

  const autosaveOn = store.builderAutosave;
  const autoCompileOn = store.builderAutoCompile;

  // What an unsaved edit would be written to, readable from callbacks that
  // were created before it: `open` has to flush the outgoing document before
  // it replaces it, and its own closure is a render or more out of date.
  const pending = useRef({ path: openPath, source });
  pending.current = { path: openPath, source };

  const refresh = useCallback(async () => {
    const listing = await window.api.builder.list();
    setDir(listing.dir);
    setFiles(listing.files);
    return listing.files;
  }, []);

  /** Renders `text` into the preview. Compiling is synchronous, so this is
   * just bookkeeping: the result and the source it came from move together. */
  const compile = useCallback(
    (
      text: string,
      font: string = store.builderFont,
      accent: string = store.builderAccent
    ): CompileResult => {
      const result = compileToHtml(text, { font, accent });
      setCompiled(result);
      setCompiledFrom(text);
      return result;
    },
    [store.builderFont, store.builderAccent]
  );

  /** Restyling redraws the preview immediately whatever the compile setting
   * says: picking a typeface or a colour you can't see is no choice. */
  function chooseFont(font: string) {
    persist({ ...store, builderFont: font });
    compile(pending.current.source, font);
  }

  function chooseAccent(accent: string) {
    persist({ ...store, builderAccent: accent });
    compile(pending.current.source, store.builderFont, accent);
  }

  /** Writes the open document back to its file. Every save goes through here —
   * autosave, the Save button, Ctrl+S — so the indicator can't drift from
   * what's actually on disk. */
  const save = useCallback(async (filePath: string, text: string) => {
    setSaveState("saving");
    const result = await window.api.builder.write(filePath, text);
    if (result.error) {
      setSaveState("error");
      setFileStatus(result.error);
      return;
    }
    edited.current = false;
    setDirty(false);
    setSaveState("saved");
  }, []);

  /** Loads a document into the editor. A file that isn't a valid resume is
   * left closed rather than opened empty, which would overwrite it with the
   * first keystroke. */
  const open = useCallback(
    async (filePath: string) => {
      // Switching away inside the autosave debounce would otherwise drop the
      // last few hundred milliseconds of typing on the outgoing document. With
      // autosave off, writing unasked would be the surprise instead, so the
      // choice goes to the user.
      if (edited.current && pending.current.path) {
        const outgoing = pending.current;
        const keep =
          autosaveOn ||
          window.confirm(
            `Save changes to ${outgoing.path.split(/[\\/]/).pop()}? Cancel discards them.`
          );
        if (keep) await save(outgoing.path, outgoing.source);
      }
      const read = await window.api.builder.read(filePath);
      if (typeof read.content !== "string") {
        setFileStatus(read.error ?? "Could not read that file.");
        return false;
      }
      const split = splitSections(read.content);
      if (!split.ok) {
        setFileStatus(`${filePath.split(/[\\/]/).pop()}: ${split.error}`);
        return false;
      }
      edited.current = false;
      setDirty(false);
      setSections(split.sections);
      // Opening always renders: the preview showing the document you just
      // closed, until you press Compile, would be nobody's idea of correct.
      compile(joinSections(split.sections));
      setFileStatus("");
      setSaveState("idle");
      setOpenPath(filePath);
      if (filePath !== store.builderFilePath) persist({ ...store, builderFilePath: filePath });
      return true;
    },
    [store, persist, save, autosaveOn, compile]
  );

  // Open whatever was open last, falling back to the most recently edited
  // document — the bookmarked file may have been deleted outside the app.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const listed = await refresh();
      const target = listed.find((f) => f.path === store.builderFilePath) ?? listed[0];
      if (target) await open(target.path);
    })();
    // `open` and `store` are deliberately not deps: this is a one-time startup
    // load, and re-running it would fight whatever the user has opened since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  useEffect(() => {
    if (!autoCompileOn) return;
    const timer = setTimeout(() => compile(source), COMPILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, autoCompileOn, compile]);

  useEffect(() => {
    if (!autosaveOn || !edited.current || !openPath) return;
    // Says "Saving…" from the first keystroke, not just once the timer fires:
    // between the two the change really is unsaved.
    setSaveState("saving");
    const timer = setTimeout(() => void save(openPath, source), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, openPath, save, autosaveOn]);

  /** Writes now, whatever the autosave setting — the Save button and Ctrl+S. */
  const saveNow = useCallback(() => {
    if (!edited.current || !pending.current.path) return;
    void save(pending.current.path, pending.current.source);
  }, [save]);

  const [compiling, setCompiling] = useState(false);
  const compileTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(compileTimer.current), []);

  /** Renders whatever is in the editor right now — the Compile button and
   * Ctrl+Enter. Reads the ref so a shortcut fired from a stale closure still
   * compiles the current text.
   *
   * The work is deferred a frame so the overlay is on screen before the
   * compile blocks the thread; painting them in the other order would show
   * the spinner only after the thing it describes had already finished. */
  const compileNow = useCallback(() => {
    setCompiling(true);
    const started = Date.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        compile(pending.current.source);
        compileTimer.current = window.setTimeout(
          () => setCompiling(false),
          Math.max(0, COMPILE_FEEDBACK_MS - (Date.now() - started))
        );
      });
    });
  }, [compile]);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNow();
      } else if (event.key === "Enter") {
        event.preventDefault();
        compileNow();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, saveNow, compileNow]);

  /** Flips the setting, and renders once on the way in so the preview isn't
   * left behind the editor. */
  function toggleAutoCompile() {
    persist({ ...store, builderAutoCompile: !autoCompileOn });
    if (!autoCompileOn) compileNow();
  }

  /** Flips the setting, and flushes anything outstanding when turning it on —
   * switching autosave on and watching "Unsaved" stay put would be a puzzle. */
  function toggleAutosave() {
    persist({ ...store, builderAutosave: !autosaveOn });
    if (!autosaveOn) saveNow();
  }

  function edit(name: SectionName, value: string) {
    edited.current = true;
    setDirty(true);
    setSections((prev) => ({ ...prev, [name]: value }));
  }

  /** Creates a document in the workspace and opens it. */
  async function create(name: string | undefined, content: string) {
    const result = await window.api.builder.create(name, content);
    if (!result.file) {
      setFileStatus(result.error ?? "Could not create the file.");
      return;
    }
    await refresh();
    await open(result.file.path);
  }

  /** Duplicates the open document, copying what's in the editor rather than
   * what's on disk — a copy taken mid-edit should be of what you can see. The
   * workspace names it around the collision (…-2, …-3), and the copy is what
   * you're left editing. */
  async function duplicateFile() {
    const { path: filePath, source: text } = pending.current;
    if (!filePath) return;
    const stem = (filePath.split(/[\\/]/).pop() ?? "").replace(/\.resb$/i, "");
    await create(stem, text);
  }

  /** Which row's action menu is open, and which row is being renamed — both
   * hold a path, since a row is only ever identified by one. */
  const [menuFor, setMenuFor] = useState("");
  const [renaming, setRenaming] = useState("");
  const [renameDraft, setRenameDraft] = useState("");

  // A menu that outlives the click that dismissed it is worse than no menu.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor("");
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuFor]);

  function startRename(file: BuilderFile) {
    setMenuFor("");
    setRenaming(file.path);
    setRenameDraft(file.name.replace(/\.resb$/i, ""));
  }

  async function commitRename(file: BuilderFile) {
    const wanted = renameDraft.trim();
    setRenaming("");
    if (!wanted || wanted === file.name.replace(/\.resb$/i, "")) return;

    const result = await window.api.builder.rename(file.path, wanted);
    if (!result.file) {
      setFileStatus(result.error ?? "Could not rename that file.");
      return;
    }
    await refresh();
    // The open document just moved: follow it, or the next save would write
    // to a path that no longer exists and quietly recreate the old name.
    if (file.path === pending.current.path) {
      setOpenPath(result.file.path);
      persist({ ...store, builderFilePath: result.file.path });
    }
  }

  async function deleteFile(file: BuilderFile) {
    setMenuFor("");
    const confirmed = window.confirm(
      `Delete ${file.name}? It goes to the recycle bin — the builder has no undo.`
    );
    if (!confirmed) return;

    const result = await window.api.builder.remove(file.path);
    if (result.error) {
      setFileStatus(result.error);
      return;
    }
    const listed = await refresh();
    if (file.path !== pending.current.path) return;

    // The open document is the one that went. Drop it before anything can
    // autosave it back into existence, then fall through to whatever's left.
    edited.current = false;
    setDirty(false);
    setOpenPath("");
    setSections(EMPTY_SECTIONS);
    compile(joinSections(EMPTY_SECTIONS));
    persist({ ...store, builderFilePath: "" });
    if (listed[0]) await open(listed[0].path);
  }

  async function importFile() {
    setFileStatus("");
    const picked = await window.api.builder.pick();
    if (picked.canceled) return;
    if (typeof picked.content !== "string") {
      setFileStatus(`Import failed: ${picked.error ?? "could not read the file"}`);
      return;
    }
    // Checked before it's copied in, so a malformed file never joins the
    // workspace — the original is left where it is.
    const split = splitSections(picked.content);
    if (!split.ok) {
      setFileStatus(`Import failed: ${split.error}`);
      return;
    }
    await create(picked.name, picked.content);
  }

  // Fit the fixed-width page to the pane. Measured rather than computed from
  // window size: the pane is a fraction of the window minus borders, and it's
  // `hidden` (so zero-sized) until the Builder view is the one on screen.
  const paneRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ width: 0, height: 0 });
  /** null follows the pane width; a number is a zoom level the user picked. */
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    // Measured up front as well as observed. The observer reports every later
    // change, but its first callback is not something to depend on for the
    // initial size — when it lands before the row has been laid out it reports
    // zero, and a pane that never changes size again is never corrected. A
    // zero-width pane renders a zero-width iframe: a blank preview, and a zoom
    // readout stuck at 100%.
    const measure = () => {
      const box = el.getBoundingClientRect();
      if (box.width) setPane({ width: box.width, height: box.height });
    };
    measure();
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width) setPane({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit leaves the page a gutter on each side rather than running it edge to
  // edge, and never magnifies — a page wider than it prints would
  // misrepresent the layout. Zooming in is an explicit ask, so it may go
  // past 1:1.
  const fitScale = pane.width
    ? Math.min(1, pane.width / (PAGE_WIDTH_PX + 2 * PAGE_GUTTER_PX))
    : 1;
  const scale = zoom ?? fitScale;

  /** Steps to the next zoom level in `direction`, from wherever the preview
   * happens to be — including a fit scale that isn't one of the levels. */
  function zoomBy(direction: 1 | -1) {
    const next =
      direction > 0
        ? ZOOM_LEVELS.find((level) => level > scale + 0.005)
        : [...ZOOM_LEVELS].reverse().find((level) => level < scale - 0.005);
    if (next !== undefined) setZoom(next);
  }

  const [refreshing, setRefreshing] = useState(false);

  /** Re-reads the workspace folder. Files can appear or vanish behind the
   * app's back — a document dropped in by hand, or one deleted from the OS —
   * and nothing else here watches the directory. */
  async function refreshFiles() {
    setRefreshing(true);
    try {
      await refresh();
      setFileStatus("");
    } finally {
      setRefreshing(false);
    }
  }

  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  async function downloadPdf() {
    setExporting(true);
    setExportStatus("");
    try {
      // Export what the editor says, not what the preview last rendered — and
      // bring the preview up to date so the two agree about what was exported.
      const document = stale ? compile(source) : compiled;
      if (document.error) {
        setExportStatus(document.error);
        return;
      }
      const result = await window.api.exportPdf(document.html, suggestedName(sections.main));
      if (result.ok) setExportStatus("Saved");
      else if (!result.canceled) setExportStatus(result.error ?? "Export failed");
    } catch (e) {
      setExportStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  // Any edit invalidates a "Saved" from a document that no longer exists.
  useEffect(() => setExportStatus(""), [source]);

  // Pane sizing: the explorer keeps a pixel width (a file list doesn't want
  // to grow with the window), while the editor and preview share what's left
  // by grow ratio, so the split holds as the window resizes.
  const rowRef = useRef<HTMLDivElement>(null);
  const [explorerWidth, setExplorerWidth] = useState(208);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_PX);
  const [editorShare, setEditorShare] = useState(0.5);
  const [resizing, setResizing] = useState(false);

  const chatOpen = store.builderChatOpen;

  function resizeExplorer(clientX: number) {
    const row = rowRef.current?.getBoundingClientRect();
    if (!row) return;
    const max = Math.max(MIN_EXPLORER_PX, row.width * 0.4);
    setExplorerWidth(Math.min(Math.max(clientX - row.left, MIN_EXPLORER_PX), max));
  }

  function resizeEditor(clientX: number) {
    const row = rowRef.current?.getBoundingClientRect();
    if (!row) return;
    const available = row.width - explorerWidth - (chatOpen ? chatWidth : 0);
    if (available <= 0) return;
    const share = (clientX - row.left - explorerWidth) / available;
    setEditorShare(Math.min(Math.max(share, MIN_PANE_SHARE), 1 - MIN_PANE_SHARE));
  }

  /** Dragged from the dock's left edge, so the width grows as the pointer
   * moves left — the mirror image of the other two dividers. */
  function resizeChat(clientX: number) {
    const row = rowRef.current?.getBoundingClientRect();
    if (!row) return;
    const max = Math.max(MIN_CHAT_PX, row.width * 0.45);
    setChatWidth(Math.min(Math.max(row.right - clientX, MIN_CHAT_PX), max));
  }

  /** The assistant has written a document into the workspace. Re-read the
   * folder so it appears in the list, and open it — the model was asked for a
   * document, and a document you have to go and find is half an answer.
   *
   * An unsaved edit in the outgoing document is `open`'s problem, and it
   * already handles it (autosave flushes, otherwise it asks). */
  const openWritten = useCallback(
    async (writtenPath?: string) => {
      const listed = await refresh();
      if (!writtenPath) return;
      const written = listed.find((f) => f.path === writtenPath);
      if (written) await open(written.path);
    },
    [refresh, open]
  );

  function toggleChat() {
    persist({ ...store, builderChatOpen: !chatOpen });
  }

  /** The editor has moved on from what the preview is showing. */
  const stale = compiledFrom !== source;
  const problem = compiled.error;
  const saveLabel = autosaveOn ? SAVE_LABEL[saveState] : MANUAL_LABEL[dirty ? "dirty" : "clean"];
  const SaveStateIcon = saveLabel.icon;
  const openName = openPath.split(/[\\/]/).pop() ?? "";

  return (
    <section className={viewSection(visible)}>
      <div
        ref={rowRef}
        className={cx("flex min-h-0 flex-1", resizing && "select-none")}
      >
        {/* Workspace: every .resb document in the app's data folder. */}
        <div
          className="flex min-h-0 flex-shrink-0 flex-col"
          style={{ width: explorerWidth }}
        >
          <div className={paneHeader}>
            <span className="px-1">Files</span>
            <span className="flex-1" />
            <button
              className={headerBtn}
              onClick={() => void create(undefined, STARTER_SOURCE)}
              title="New resume in the workspace"
            >
              <FilePlus size={13} />
            </button>
            <button
              className={headerBtn}
              onClick={() => void importFile()}
              title="Import a .resb file into the workspace"
            >
              <FolderOpen size={13} />
            </button>
            <button
              className={headerBtn}
              onClick={() => void duplicateFile()}
              disabled={!openPath}
              title="Duplicate the open document"
              aria-label="Duplicate the open document"
            >
              <Copy size={13} />
            </button>
            <button
              className={headerBtn}
              onClick={() => void refreshFiles()}
              disabled={refreshing}
              title="Re-read the workspace folder"
              aria-label="Refresh the file list"
            >
              <RefreshCw size={13} className={cx(refreshing && "animate-spin")} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {files.length === 0 ? (
              <p className="px-3 py-2 text-[11.5px] leading-relaxed text-ink-faint">
                No documents yet. Create one, or import a <code>.resb</code> file.
              </p>
            ) : (
              files.map((file) => (
                <div
                  key={file.path}
                  className={cx(
                    "group relative flex items-center text-[12.5px]",
                    file.path === openPath
                      ? "bg-surface-3 text-ink"
                      : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  {renaming === file.path ? (
                    <input
                      autoFocus
                      className="min-w-0 flex-1 rounded-sm border border-accent bg-surface-0 px-2 py-1 text-[12.5px] text-ink outline-none"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename(file);
                        // Escape abandons, and so does clicking away: a rename
                        // nobody confirmed shouldn't happen by accident.
                        if (e.key === "Escape") setRenaming("");
                      }}
                      onBlur={() => setRenaming("")}
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => void open(file.path)}
                        title={file.path}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-1.5 text-left"
                      >
                        <FileText size={13} className="flex-shrink-0 text-ink-faint" />
                        <span className="truncate">{file.name}</span>
                      </button>
                      <button
                        // Kept out of the way until the row is pointed at,
                        // then always visible for the open document.
                        className={cx(
                          "mr-1 flex-shrink-0 cursor-pointer rounded p-1 text-ink-faint hover:bg-surface-3 hover:text-white group-hover:opacity-100 focus:opacity-100",
                          menuFor === file.path ? "opacity-100" : "opacity-0"
                        )}
                        title="Rename or delete"
                        aria-label={`Actions for ${file.name}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setMenuFor(menuFor === file.path ? "" : file.path)}
                      >
                        <MoreVertical size={13} />
                      </button>
                    </>
                  )}

                  {menuFor === file.path && (
                    <div
                      className="absolute right-1 top-full z-10 min-w-[120px] overflow-hidden rounded-md border border-line bg-surface-2 py-1 shadow-lg"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-ink-soft hover:bg-surface-3 hover:text-white"
                        onClick={() => startRename(file)}
                      >
                        <Pencil size={12} />
                        Rename
                      </button>
                      <button
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-danger-text hover:bg-surface-3"
                        onClick={() => void deleteFile(file)}
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Where these files actually are, so they can be found outside the app. */}
          <div
            className="flex-shrink-0 truncate border-t border-line-subtle bg-surface-1 px-3 py-1 text-[10.5px] text-ink-faint"
            title={dir}
          >
            {dir}
          </div>
        </div>

        <PaneDivider onMove={resizeExplorer} onDragging={setResizing} />

        {/* min-w-0: a flex child defaults to min-width:auto, which would let
            the editor and the oversized preview iframe push this row wider
            than the window instead of taking their share and clipping. */}
        <div
          className="flex min-h-0 min-w-0 flex-col"
          style={{ flexGrow: editorShare, flexBasis: 0 }}
        >
          <div className={paneHeader}>
            {SECTION_TABS.map((t) => (
              <button
                key={t.name}
                className={tabClass(tab === t.name)}
                onClick={() => setTab(t.name)}
                title={t.hint}
                disabled={!openPath}
              >
                {t.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px flex-shrink-0 bg-line" />

            {/* Save, the autosave switch, and what the two of them are doing.
                Each keeps a fixed width — the status text changes as documents
                save, and everything beside it would otherwise shuffle sideways
                every time it did. */}
            <button
              className={cx(headerBtn, "w-7 justify-center")}
              onClick={saveNow}
              disabled={!dirty || !openPath}
              title="Save this document (Ctrl+S)"
              aria-label="Save this document"
            >
              <Save size={13} />
            </button>
            <button
              role="switch"
              aria-checked={autosaveOn}
              aria-label="Autosave"
              onClick={toggleAutosave}
              title={
                autosaveOn
                  ? "Autosave is on — click to save only when you ask"
                  : "Autosave is off — click to save changes automatically"
              }
              className="flex w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-md py-1 hover:bg-surface-3"
            >
              <span
                className={cx(
                  "relative h-3.5 w-7 rounded-full transition-colors",
                  autosaveOn ? "bg-accent" : "bg-surface-3 border border-line-input"
                )}
              >
                <span
                  className={cx(
                    "absolute top-[3px] h-2 w-2 rounded-full bg-white transition-all",
                    autosaveOn ? "left-[16px]" : "left-[3px]"
                  )}
                />
              </span>
            </button>
            <span
              className={cx(
                "flex w-[92px] flex-shrink-0 items-center gap-1 normal-case tracking-normal",
                saveLabel.className
              )}
              title={autosaveOn ? "Autosave is on" : "Autosave is off"}
            >
              <SaveStateIcon
                size={12}
                className={cx(
                  "flex-shrink-0",
                  autosaveOn && saveState === "saving" && "animate-spin"
                )}
              />
              <span className="truncate">{saveLabel.text}</span>
            </span>

            <span className="flex-1" />
            <button
              className={docsTabClass(tab === DOCS_TAB.name)}
              onClick={() => setTab(DOCS_TAB.name)}
              title={DOCS_TAB.hint}
            >
              {DOCS_TAB.label}
            </button>
          </div>

          {/* The open document's name, on its own line rather than squeezed
              into the tab row — it's the answer to "which file am I editing",
              which is worth more room than the corner of a toolbar. */}
          {openPath && (
            <div
              className="flex flex-shrink-0 items-center gap-1.5 border-b border-line-subtle bg-surface-1 px-3 py-1 text-[11px] text-ink-soft"
              title={openPath}
            >
              <FileText size={11} className="flex-shrink-0 text-ink-faint" />
              <span className="truncate">{openName}</span>
            </div>
          )}

          {fileStatus && (
            <p
              className="flex-shrink-0 border-b border-line-subtle bg-surface-1 px-3 py-1 text-[11px] text-danger-text"
              title={fileStatus}
            >
              {fileStatus}
            </p>
          )}

          {/* The reference stays mounted alongside the editors so scrolling
              through it survives a trip to Macro and back. */}
          <Markdown
            text={BUILDER_DOCS}
            className={cx(
              "builder-docs min-h-0 flex-1 overflow-y-auto bg-surface-0 px-4 py-3 text-[12.5px]",
              tab !== "docs" && "hidden"
            )}
          />

          {openPath ? (
            SECTION_TABS.map((t) => (
              <textarea
                key={t.name}
                className={cx(
                  "min-h-0 flex-1 resize-none bg-surface-0 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink outline-none",
                  tab !== t.name && "hidden"
                )}
                value={sections[t.name]}
                onChange={(e) => edit(t.name, e.target.value)}
                spellCheck={false}
                placeholder={t.hint}
              />
            ))
          ) : (
            <p
              className={cx(
                "min-h-0 flex-1 bg-surface-0 px-3 py-3 text-[12.5px] text-ink-faint",
                tab === "docs" && "hidden"
              )}
            >
              No document open — pick one from the list, or create a new one.
            </p>
          )}

          {problem && (
            <p className="flex-shrink-0 border-t border-line-subtle bg-surface-1 px-3 py-2 font-mono text-[11.5px] text-danger-text">
              {problem}
            </p>
          )}
        </div>

        <PaneDivider onMove={resizeEditor} onDragging={setResizing} />

        <div
          className="flex min-h-0 min-w-0 flex-col"
          style={{ flexGrow: 1 - editorShare, flexBasis: 0 }}
        >
          <div className={paneHeader}>
            <button
              className={cx(
                headerBtn,
                // Nudges when the preview is behind the editor, so "compile"
                // is a visible state and not something to remember.
                openPath && stale && !autoCompileOn && "bg-accent-soft text-accent-light"
              )}
              onClick={compileNow}
              disabled={!openPath || compiling}
              title="Render the editor's document into the preview (Ctrl+Enter)"
            >
              <Play size={13} />
              Compile
            </button>
            <button
              className={cx(headerBtn, autoCompileOn && "text-accent-light")}
              onClick={toggleAutoCompile}
              aria-pressed={autoCompileOn}
              title={
                autoCompileOn
                  ? "Compiling as you type — click to compile only when you ask"
                  : "Compiling when you ask — click to compile as you type"
              }
            >
              {autoCompileOn ? <Zap size={13} /> : <ZapOff size={13} />}
            </button>
            <StylePicker
              font={store.builderFont}
              accent={store.builderAccent}
              onFont={chooseFont}
              onAccent={chooseAccent}
            />
            <span className="flex-1" />
            <button
              className={headerBtn}
              onClick={() => zoomBy(-1)}
              disabled={scale <= ZOOM_LEVELS[0]}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={13} />
            </button>
            <button
              className="cursor-pointer rounded-md px-1 py-1 tabular-nums hover:bg-surface-3 hover:text-white"
              onClick={() => setZoom(null)}
              title="Fit the page to the pane"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              className={headerBtn}
              onClick={() => zoomBy(1)}
              disabled={scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
            {exportStatus && (
              <span className="truncate normal-case tracking-normal" title={exportStatus}>
                {exportStatus}
              </span>
            )}
            <button
              className={headerBtn}
              onClick={() => void downloadPdf()}
              disabled={exporting || !openPath || !!problem}
              title={problem ? "Fix the error before exporting" : "Save this resume as a PDF"}
            >
              <Download size={13} />
              {exporting ? "Saving…" : "PDF"}
            </button>
            <button
              className={cx(headerBtn, chatOpen && "text-accent-light")}
              onClick={toggleChat}
              aria-pressed={chatOpen}
              title={chatOpen ? "Hide the assistant" : "Ask the assistant about this document"}
            >
              <Sparkles size={13} />
            </button>
          </div>

          {/* The canvas is the whole pane, always: the iframe is sized to
              `1 / scale` of it and then scaled back down, so it covers the
              pane exactly at any zoom. What grows and shrinks is the page
              inside — it keeps its fixed print width in document pixels and
              floats on the backdrop with its own margins, the way a PDF
              viewer shows a sheet, rather than the frame itself resizing.
              The document scrolls within the canvas once it outgrows it. */}
          <div ref={paneRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#525659]">
            {compiling && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#525659]/75">
                <span className="flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3.5 py-2 text-[11.5px] text-ink-soft shadow-lg">
                  <LoaderCircle size={14} className="animate-spin text-accent-light" />
                  Compiling…
                </span>
              </div>
            )}
            <iframe
              title="Resume preview"
              srcDoc={compiled.html}
              // No scripts, no same-origin: the preview is static markup and
              // has no reason to reach back into the app.
              sandbox=""
              // `block` so no inline baseline gap sneaks in under the canvas
              className="block border-0"
              style={{
                width: pane.width / scale,
                height: pane.height / scale,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                // Belt and braces with the divider's pointer capture: while a
                // drag is live the canvas takes no pointer events at all.
                pointerEvents: resizing ? "none" : undefined,
              }}
            />
          </div>
        </div>

        {/* The dock is unmounted when hidden rather than kept behind `hidden`,
            unlike the top-level views: a conversation is worth losing far less
            than a screenful of draft edits, and an open document streamed into
            a chat nobody can see is work done for nothing. */}
        {chatOpen && (
          <>
            <PaneDivider onMove={resizeChat} onDragging={setResizing} />
            <div
              className="flex min-h-0 flex-shrink-0 flex-col"
              style={{ width: chatWidth }}
            >
              <ChatDock
                documentName={openName}
                source={source}
                onDocumentsChanged={(writtenPath) => void openWritten(writtenPath)}
                onClose={toggleChat}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
