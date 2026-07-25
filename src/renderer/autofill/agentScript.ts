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

/** Clicks the element tagged with the given autopilot index. Real pages
 * (React/Vue-driven ATS forms especially) can re-render between the
 * snapshot and this call and drop the `data-jseeker-idx` tag from the DOM
 * node, so this falls back to re-matching the same visible text among
 * clickable elements before giving up. Returns whether anything was
 * actually clicked — callers must check this rather than assume success. */
export function buildClickScript(index: number, fallbackText?: string): string {
  return `(function () {
  let el = document.querySelector('[data-jseeker-idx="${index}"]');

  if (!el) {
    const wanted = ${JSON.stringify((fallbackText || "").trim().toLowerCase())};
    if (wanted) {
      const pool = document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], [role="button"], a'
      );
      for (const cand of pool) {
        const text = (cand.tagName === "INPUT" ? cand.value : cand.textContent || "")
          .replace(/\\s+/g, " ").trim().toLowerCase();
        if (text && text === wanted) { el = cand; break; }
      }
    }
  }

  if (el) el.click();
  return !!el;
})();`;
}

/** Re-invokes `window.__jseekerCollectUnfilled` — installed by
 * `buildAutofillScript` (script.ts), which the autopilot loop's `autofill()`
 * call always runs first — to get a fresh `FieldDescriptor[]` of fields
 * still empty after both the heuristic and LLM-fallback passes. Richer than
 * `remainingRequired` above (which is just label strings): this carries the
 * real `index`/`required`/etc. needed to ask the user and write the answer
 * back onto the right element.
 *
 * Filters out anything not currently visible — script.ts's own candidate
 * scan doesn't check visibility (multi-step forms often pre-render every
 * step's fields in the DOM and toggle them with CSS), so without this the
 * loop would ask about a later step's field before the user has even
 * reached it. Matches the same visibility check `remainingRequired` above
 * already applies. */
export function buildCollectUnfilledScript(): string {
  return `(function () {
  const all = window.__jseekerCollectUnfilled ? window.__jseekerCollectUnfilled() : [];
  function isVisible(el) {
    if (!el) return false;
    if (!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }
  return all.filter((f) => isVisible(document.querySelector('[data-jseeker-idx="' + f.index + '"]')));
})();`;
}

/** Returns the page's visible text, capped so it stays a reasonable size in
 * a prompt. Used once per autopilot run to give the model background
 * context about the job posting itself, not just the form fields. */
export function buildPageTextScript(): string {
  return `(function () {
  const text = (document.body ? document.body.innerText : "") || "";
  return text.replace(/[ \\t]+/g, " ").replace(/\\n{3,}/g, "\\n\\n").trim().slice(0, 1200);
})();`;
}
