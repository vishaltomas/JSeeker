// Injected on demand (via chrome.scripting.executeScript) when the user
// clicks the extension icon. Defines two idempotent globals background.js
// calls directly — a direct port of the heuristic matcher that used to run
// inside JSeeker's embedded webview (src/renderer/autofill/script.ts, now
// removed from the app since form-filling moved here).

(function () {
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
    { key: "summary", match: ["summary", "about you", "bio", "professional summary"] },
    { key: "skills", match: ["skills", "key skills", "core competencies"] },
  ];

  const SKIP_TYPES = ["password", "hidden", "file", "submit", "button", "checkbox", "radio", "image", "reset"];

  function labelText(el) {
    let text = "";
    if (el.labels) { for (const l of el.labels) text += " " + l.textContent; }
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      for (const id of labelledby.split(/\s+/)) {
        const ref = document.getElementById(id);
        if (ref) text += " " + ref.textContent;
      }
    }
    return text.replace(/\s+/g, " ").trim();
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

  /** Heuristic fill pass, then collects a FieldDescriptor[] for whatever's
   * still unfilled (capped at 40) — same shape the app's LLM-fallback
   * matching (POST /autofill) expects. */
  window.__jseekerFill = function (profile) {
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

    if (!window.__jseekerIdxSeq) window.__jseekerIdxSeq = 0;
    const unfilled = [];

    for (const el of candidates()) {
      if (el.dataset.jseekerFilled === "1") continue;
      if (el.value && el.value.trim()) continue;
      if (unfilled.length >= 40) break;

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
        context: context ? context.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : undefined,
        required: el.required || undefined,
      };
      if (el.tagName === "SELECT") {
        descriptor.options = Array.from(el.options).map((o) => o.text).slice(0, 25);
      }
      unfilled.push(descriptor);
    }

    return { filled, unfilled };
  };

  /** Applies a FieldMapping[] (from POST /autofill) back onto the elements
   * tagged with data-jseeker-idx by __jseekerFill. Returns how many landed. */
  window.__jseekerApply = function (mapping) {
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
})();
