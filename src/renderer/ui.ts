/** Joins conditional class names, skipping falsy values. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Base + hidden-toggle classes for a top-level view section (Main/Jobs/
 * Settings). These stay mounted always; visibility only toggles `hidden` so
 * state — most importantly the <webview> in MainView — survives switching
 * views instead of being torn down and recreated. */
export function viewSection(visible: boolean): string {
  return cx("flex min-h-0 flex-1 flex-col", !visible && "hidden");
}

export const btn =
  "cursor-pointer rounded-lg border border-line-input bg-surface-3 px-3.5 py-2 text-[13px] text-ink enabled:hover:bg-[#35363b] disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimary =
  "cursor-pointer rounded-lg border border-accent bg-accent px-3.5 py-2 text-[13px] text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export const btnBlock = "mt-3 w-full";

export const iconBtn =
  "flex h-[30px] w-[30px] items-center justify-center rounded-md text-[17px] leading-none text-ink-soft enabled:hover:bg-surface-3 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export const urlInput =
  "rounded-lg border border-line-input bg-surface-0 px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none";

/** Note: the original CSS had no spacing rule between sibling `.field` blocks
 * in the Job Search / Assistant panels (only ProfilesPanel's grid had `gap`),
 * which reads as an oversight rather than intent — fields would render with
 * no vertical gap at all. Adding consistent spacing here instead of
 * reproducing that. */
export const fieldGroup = "mb-3";

export const fieldLabel = "mb-[3px] block text-[11px] text-ink-muted";

export const fieldInput =
  "w-full rounded-md border border-line-input bg-surface-0 px-2.5 py-[7px] text-[13px] text-ink focus:border-accent focus:outline-none";

export const sectionHint = "mb-3.5 text-xs text-ink-faint";

export const panelH2 = "mb-1 text-base font-bold";

export const statusText = "mt-2.5 min-h-[16px] text-xs text-ink-muted";
