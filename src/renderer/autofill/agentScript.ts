/**
 * Injected scripts for the autopilot loop's "what's next" step. Separate
 * from script.ts (which owns the field-filling heuristic) — this file only
 * looks at clickable elements and required-but-empty fields, run *after*
 * script.ts's fill pass has already done what it can on the page.
 */

const NAV_LINK_WORDS =
  "next|continue|back|previous|prev|submit|apply|finish|save|proceed|review";

const SUBMIT_WORDS = "submit|apply now|send application|finish application|complete application";

/** Collects visible clickable candidates (buttons, submit/button inputs,
 * role=button elements, and nav-keyword links), tags each with
 * `data-jseeker-idx` (continuing script.ts's shared idx counter so indexes
 * never collide within a page), and flags `isSubmitLike` — a deterministic,
 * code-computed check that the caller uses as the actual safety gate before
 * ever auto-clicking something, independent of what the model says.
 * Also reports labels of required fields still empty after the fill pass.
 */
export function buildClickableSnapshotScript(): string {
  return `(function () {
  const SKIP_TYPES = ["password", "hidden", "file", "submit", "button", "checkbox", "radio", "image", "reset"];
  const NAV_RE = new RegExp(${JSON.stringify(NAV_LINK_WORDS)}, "i");
  const SUBMIT_RE = new RegExp(${JSON.stringify(SUBMIT_WORDS)}, "i");

  function labelText(el) {
    let text = "";
    if (el.labels) { for (const l of el.labels) text += " " + l.textContent; }
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      for (const id of labelledby.split(/\\s+/)) {
        const ref = document.getElementById(id);
        if (ref) text += " " + ref.textContent;
      }
    }
    return text.replace(/\\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function elText(el) {
    const raw = el.tagName === "INPUT" ? (el.value || el.getAttribute("aria-label") || "") : el.textContent;
    return (raw || "").replace(/\\s+/g, " ").trim().slice(0, 80);
  }

  function computeIsSubmitLike(el, text, type) {
    if (type === "submit") return true;
    return SUBMIT_RE.test(text);
  }

  if (!window.__jseekerIdxSeq) window.__jseekerIdxSeq = 0;

  const seen = new Set();
  const candidates = [];

  const buttonLike = Array.from(
    document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')
  ).filter((el) => isVisible(el) && !el.disabled);

  const navLinks = Array.from(document.querySelectorAll("a")).filter(
    (el) => isVisible(el) && NAV_RE.test(elText(el))
  );

  for (const el of [...buttonLike, ...navLinks]) {
    if (seen.has(el) || candidates.length >= 20) continue;
    seen.add(el);

    const type = (el.getAttribute("type") || "").toLowerCase();
    const text = elText(el) || labelText(el);
    if (!text) continue;

    if (!el.dataset.jseekerIdx) el.dataset.jseekerIdx = String(window.__jseekerIdxSeq++);

    candidates.push({
      index: Number(el.dataset.jseekerIdx),
      tag: el.tagName.toLowerCase(),
      text,
      ariaLabel: el.getAttribute("aria-label") || undefined,
      type: type || undefined,
      isSubmitLike: computeIsSubmitLike(el, text, type),
    });
  }

  const remainingRequired = Array.from(document.querySelectorAll("input, textarea, select"))
    .filter((el) => {
      if (el.tagName === "INPUT" && SKIP_TYPES.includes((el.type || "").toLowerCase())) return false;
      if (!el.required || el.disabled || el.readOnly || !isVisible(el)) return false;
      return !(el.value && String(el.value).trim());
    })
    .map((el) => labelText(el) || el.placeholder || el.name || el.id || "(unlabeled field)")
    .slice(0, 20);

  return {
    pageTitle: document.title || "",
    candidates,
    remainingRequired,
  };
})();`;
}

/** Clicks the element tagged with the given autopilot index. */
export function buildClickScript(index: number): string {
  return `(function () {
  const el = document.querySelector('[data-jseeker-idx="${index}"]');
  if (el) el.click();
  return !!el;
})();`;
}
