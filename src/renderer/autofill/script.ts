import type { FieldMapping, ProfileData } from "../types";

/**
 * Returns a self-contained script (as a string) that runs inside the loaded
 * page. It installs persistent fill/extract/apply routines on `window`,
 * optionally a MutationObserver that re-fills fields added later (multi-step /
 * dynamic forms), then runs the heuristic matcher once.
 *
 * Returns `{ filled, unfilled }`: how many fields the heuristic matched by
 * name/label/placeholder, and a list of leftover fields (tag, label, nearby
 * text, select options, …) it couldn't confidently label — the caller sends
 * those to the local model as a fallback.
 */
export function buildAutofillScript(
  profile: ProfileData,
  installObserver: boolean
): string {
  const enriched: ProfileData = { ...profile };
  enriched.fullName = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .join(" ");

  return `(function () {
  window.__jseekerProfile = ${JSON.stringify(enriched)};

  // Each spec maps a profile key to substrings that identify the field.
  // Order matters: more specific specs come first.
  const SPECS = [
    { key: "email", match: ["email", "e-mail"] },
    { key: "phone", match: ["phone", "mobile", "telephone", "tel"] },
    { key: "firstName", match: ["first name", "firstname", "first-name", "fname", "given name", "given-name", "givenname"] },
    { key: "lastName", match: ["last name", "lastname", "last-name", "lname", "surname", "family name", "family-name", "familyname"] },
    { key: "fullName", match: ["full name", "fullname", "your name", "full-name"] },
    { key: "linkedin", match: ["linkedin"] },
    { key: "github", match: ["github"] },
    { key: "website", match: ["website", "portfolio", "personal site"] },
    { key: "address", match: ["street", "address line", "address"] },
    { key: "city", match: ["city", "town"] },
    { key: "state", match: ["state", "province", "region"] },
    { key: "zip", match: ["zip", "postal", "postcode", "post code"] },
    { key: "country", match: ["country"] },
    { key: "currentTitle", match: ["current title", "job title", "position", "role", "title"] },
    { key: "currentCompany", match: ["current company", "employer", "company", "organization", "organisation"] },
  ];

  const SKIP_TYPES = ["password", "hidden", "file", "submit", "button", "checkbox", "radio", "image", "reset"];

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

  function haystack(el) {
    return [
      el.name, el.id, el.placeholder,
      el.getAttribute("aria-label"),
      el.getAttribute("autocomplete"),
      labelText(el),
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function setValue(el, value) {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelect(el, value) {
    const wanted = value.toLowerCase();
    for (const opt of el.options) {
      if (opt.value.toLowerCase() === wanted || opt.text.toLowerCase().includes(wanted)) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  function candidates() {
    return Array.from(document.querySelectorAll("input, textarea, select")).filter((el) => {
      if (el.tagName === "INPUT" && SKIP_TYPES.includes((el.type || "").toLowerCase())) return false;
      if (el.disabled || el.readOnly) return false;
      return true;
    });
  }

  window.__jseekerRun = function () {
    const profile = window.__jseekerProfile || {};
    let filled = 0;

    candidates().forEach((el) => {
      if (el.dataset.jseekerFilled === "1") return;
      if (el.value && el.value.trim()) return; // don't clobber existing values

      const hay = haystack(el);
      if (!hay) return;

      for (const spec of SPECS) {
        const value = profile[spec.key];
        if (!value) continue;
        if (spec.match.some((m) => hay.includes(m))) {
          if (el.tagName === "SELECT") {
            if (setSelect(el, value)) { el.dataset.jseekerFilled = "1"; filled++; }
          } else {
            setValue(el, value);
            el.dataset.jseekerFilled = "1";
            filled++;
          }
          break;
        }
      }
    });

    return filled;
  };

  // Fields the heuristic above couldn't confidently label, described for the
  // local model. Capped so the prompt stays a reasonable size on huge forms.
  window.__jseekerCollectUnfilled = function () {
    if (!window.__jseekerIdxSeq) window.__jseekerIdxSeq = 0;
    const out = [];

    for (const el of candidates()) {
      if (el.dataset.jseekerFilled === "1") continue;
      if (el.value && el.value.trim()) continue;
      if (out.length >= 40) break;

      if (!el.dataset.jseekerIdx) el.dataset.jseekerIdx = String(window.__jseekerIdxSeq++);

      const context = el.closest("label, fieldset, .field, .form-group") || el.parentElement;
      const descriptor = {
        index: Number(el.dataset.jseekerIdx),
        tag: el.tagName.toLowerCase(),
        type: el.type || undefined,
        name: el.name || undefined,
        id: el.id || undefined,
        placeholder: el.placeholder || undefined,
        ariaLabel: el.getAttribute("aria-label") || undefined,
        autocomplete: el.getAttribute("autocomplete") || undefined,
        label: labelText(el) || undefined,
        context: context ? context.textContent.replace(/\\s+/g, " ").trim().slice(0, 160) : undefined,
        required: el.required || undefined,
      };
      if (el.tagName === "SELECT") {
        descriptor.options = Array.from(el.options).map((o) => o.text).slice(0, 25);
      }
      out.push(descriptor);
    }

    return out;
  };

  // Applies an { index, value }[] mapping (from the local model) back onto
  // the elements tagged with data-jseeker-idx by __jseekerCollectUnfilled.
  window.__jseekerApplyMapping = function (mapping) {
    let applied = 0;
    for (const item of mapping) {
      const el = document.querySelector('[data-jseeker-idx="' + item.index + '"]');
      if (!el || (el.value && el.value.trim())) continue;
      if (el.tagName === "SELECT") {
        if (setSelect(el, item.value)) { el.dataset.jseekerFilled = "1"; applied++; }
      } else {
        setValue(el, item.value);
        el.dataset.jseekerFilled = "1";
        applied++;
      }
    }
    return applied;
  };

  if (${installObserver ? "true" : "false"} && !window.__jseekerObserver) {
    let timer;
    window.__jseekerObserver = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { window.__jseekerRun(); } catch (e) {} }, 400);
    });
    window.__jseekerObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  return { filled: window.__jseekerRun(), unfilled: window.__jseekerCollectUnfilled() };
})();`;
}

/** Applies a model-produced field mapping inside the page via the routine
 * `buildAutofillScript` installed on `window.__jseekerApplyMapping`. */
export function buildApplyMappingScript(mapping: FieldMapping[]): string {
  return `window.__jseekerApplyMapping(${JSON.stringify(mapping)});`;
}
