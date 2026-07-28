/** Joins conditional class names, skipping falsy values. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Base + hidden-toggle classes for a top-level view section (Resume/Chat/
 * Settings). These stay mounted always; visibility only toggles `hidden` so
 * state (draft edits, chat history, etc.) survives switching views instead
 * of being torn down and recreated. */
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

/** Same shape as `btn`, but hover/active swap in the app's signature purple
 * gradient (matches the header) instead of a flat hover color. */
export const gradientBtn =
  "cursor-pointer rounded-lg border border-line-input bg-surface-3 px-3.5 py-2 text-[13px] text-ink transition-colors duration-150 enabled:hover:border-transparent enabled:hover:bg-gradient-to-r enabled:hover:from-[#6d28d9] enabled:hover:to-[#a855f7] enabled:hover:text-white enabled:active:from-[#4c1d95] enabled:active:to-[#7e22ce] disabled:cursor-not-allowed disabled:opacity-50";

/** Same shape as `btnPrimary`, but hover/active swap in the gradient instead
 * of the flat accent-hover color. */
export const gradientBtnPrimary =
  "cursor-pointer rounded-lg border border-transparent bg-gradient-to-r from-accent to-accent px-3.5 py-2 text-[13px] text-white transition-colors duration-150 enabled:hover:from-[#6d28d9] enabled:hover:to-[#a855f7] enabled:active:from-[#4c1d95] enabled:active:to-[#7e22ce] disabled:cursor-not-allowed disabled:opacity-50";

/** Small circular icon-only button (remove/delete rows) with the same
 * gradient hover/active treatment. */
export const gradientIconBtn =
  "flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-colors duration-150 hover:bg-gradient-to-r hover:from-[#6d28d9] hover:to-[#a855f7] hover:text-white active:from-[#4c1d95] active:to-[#7e22ce]";

export const urlInput =
  "rounded-lg border border-line-input bg-surface-0 px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none";

/** Vertical spacing between sibling field blocks in settings-style forms. */
export const fieldGroup = "mb-3";

export const fieldLabel = "mb-[3px] block text-[11px] text-ink-muted";

export const fieldInput =
  "w-full rounded-md border border-line-input bg-surface-0 px-2.5 py-[7px] text-[13px] text-ink focus:border-accent focus:outline-none";

export const sectionHint = "mb-3.5 text-xs text-ink-faint";

export const panelH2 = "mb-1 text-base font-bold";

export const statusText = "mt-2.5 min-h-[16px] text-xs text-ink-muted";
