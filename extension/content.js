// Injected on demand (via chrome.scripting.executeScript) when the user
// clicks the extension icon. Defines two idempotent globals background.js
// calls directly:
//
//   __jseekerSerialize()      -> a text snapshot of the page for the model
//   __jseekerApplyFills(f)    -> writes the model's answer back into the DOM
//
// There is no rule-based field matching here. Every fillable control is
// tagged with a `data-jseeker-id` and rendered into the snapshot as a
// one-line tag carrying that id; the model reads the ids out of the snapshot
// and answers with them, and nothing but the id round-trips.

(function () {
  // Structure and noise the model has no use for. Scripts and styles are the
  // bulk of a real application page's bytes and none of its meaning.
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "PATH", "CANVAS",
    "VIDEO", "AUDIO", "PICTURE", "SOURCE", "IFRAME", "OBJECT", "EMBED",
    "LINK", "META", "HEAD",
  ]);

  const CONTROL_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  // Nothing here is ours to fill: `file` needs a real user gesture, the rest
  // are either secrets or actions.
  const SKIP_INPUT_TYPES = new Set([
    "password", "hidden", "file", "submit", "button", "image", "reset",
  ]);

  // Headings carry the section a field belongs to ("Work authorization"),
  // which is often the only thing that disambiguates the field itself.
  const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "LEGEND"]);

  // Budget for the whole snapshot. Comfortably inside the local default
  // model's context once the profile and instructions are added, and well
  // under the server's body cap.
  const MAX_SNAPSHOT_CHARS = 48000;
  const MAX_TEXT_RUN = 300;   // one paragraph of page prose
  const MAX_OPTIONS = 40;     // country dropdowns are long and mostly noise
  const TRUTHY = new Set(["true", "yes", "y", "1", "on", "checked", "selected"]);

  function squash(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function attr(name, value) {
    const clean = squash(value);
    if (!clean) return "";
    return ` ${name}="${clean.replace(/"/g, "'")}"`;
  }

  function isVisible(el) {
    if (el.hidden) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;
    return true;
  }

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
    return squash(text);
  }

  function isFillable(el) {
    if (!CONTROL_TAGS.has(el.tagName)) return false;
    if (el.tagName === "INPUT" && SKIP_INPUT_TYPES.has((el.type || "").toLowerCase())) return false;
    if (el.disabled || el.readOnly) return false;
    return isVisible(el);
  }

  /** Current value as the model should see it: what's in the box, or the
   * checked state for a radio/checkbox. */
  function currentValue(el) {
    const type = (el.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") return el.checked ? "checked" : "";
    return squash(el.value).slice(0, 80);
  }

  /** One control as a single self-describing line. Everything that tells you
   * what the field wants — its label, placeholder, name, options — is on
   * this line; `jid` is what the model answers with. */
  function controlLine(el, jid) {
    const tag = el.tagName.toLowerCase();
    let line = `<${tag}${attr("jid", jid)}`;

    if (el.tagName === "INPUT") line += attr("type", el.type || "text");
    line += attr("name", el.name);
    line += attr("id", el.id);
    line += attr("label", labelText(el));
    line += attr("placeholder", el.placeholder);
    line += attr("aria-label", el.getAttribute("aria-label"));
    line += attr("autocomplete", el.getAttribute("autocomplete"));

    if (el.tagName === "SELECT") {
      const options = Array.from(el.options)
        .map((o) => squash(o.text))
        .filter((t) => t && !/^(select|choose|please)\b/i.test(t))
        .slice(0, MAX_OPTIONS);
      line += attr("options", options.join(" | "));
    } else if (el.tagName === "INPUT") {
      const type = (el.type || "").toLowerCase();
      // A radio's own `value` is frequently the only readable thing about it
      // ("yes" / "no" / "prefer_not_to_say").
      if (type === "radio" || type === "checkbox") line += attr("value", el.value);
    }

    if (el.required) line += " required";
    const current = currentValue(el);
    if (current) line += attr("current", current);

    return line + ">";
  }

  /** Walks the visible page in document order, emitting its text and a line
   * per fillable control. Not real HTML — the tag tree is dropped and only
   * what a person would read (plus the controls) survives, which is what
   * keeps a whole application page inside a small model's context. */
  window.__jseekerSerialize = function () {
    const lines = [];
    let used = 0;
    let fields = 0;
    let truncated = false;
    let seq = Number(document.body.dataset.jseekerSeq || 0);

    // Text that belongs to a control's label is emitted as part of that
    // control's line, so don't emit it a second time as page prose.
    const labelNodes = new Set();
    for (const el of document.querySelectorAll("input, textarea, select")) {
      if (!isFillable(el)) continue;
      if (el.labels) for (const l of el.labels) labelNodes.add(l);
      const labelledby = el.getAttribute("aria-labelledby");
      if (labelledby) {
        for (const id of labelledby.split(/\s+/)) {
          const ref = document.getElementById(id);
          if (ref) labelNodes.add(ref);
        }
      }
    }

    function emit(line) {
      if (truncated) return;
      if (used + line.length > MAX_SNAPSHOT_CHARS) {
        truncated = true;
        return;
      }
      lines.push(line);
      used += line.length + 1;
    }

    function walk(node, insideLabel) {
      for (const child of node.childNodes) {
        if (truncated) return;

        if (child.nodeType === TEXT_NODE) {
          if (insideLabel) continue;
          const text = squash(child.nodeValue);
          if (text.length > 1) emit(text.slice(0, MAX_TEXT_RUN));
          continue;
        }
        if (child.nodeType !== ELEMENT_NODE) continue;
        if (SKIP_TAGS.has(child.tagName)) continue;
        if (!isVisible(child)) continue;

        if (CONTROL_TAGS.has(child.tagName)) {
          if (!isFillable(child)) continue;
          if (!child.dataset.jseekerId) child.dataset.jseekerId = "f" + seq++;
          emit(controlLine(child, child.dataset.jseekerId));
          fields++;
          continue; // <select>'s options are already on the line
        }

        if (HEADING_TAGS.has(child.tagName)) {
          const text = squash(child.textContent);
          if (text) emit("# " + text.slice(0, MAX_TEXT_RUN));
          continue;
        }

        walk(child, insideLabel || labelNodes.has(child));
      }
    }

    walk(document.body, false);
    document.body.dataset.jseekerSeq = String(seq);

    return {
      page: lines.join("\n"),
      url: window.location.href,
      title: document.title,
      fields,
      truncated,
    };
  };

  function fire(el, type) {
    el.dispatchEvent(new window.Event(type, { bubbles: true }));
  }

  function setValue(el, value) {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    // Go through the native setter so React (and anything else tracking the
    // value property) sees the change instead of overwriting it on re-render.
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    fire(el, "input");
    fire(el, "change");
  }

  function setSelect(el, value) {
    const wanted = value.toLowerCase().trim();
    const options = Array.from(el.options);
    const match =
      options.find((o) => o.value.toLowerCase() === wanted || squash(o.text).toLowerCase() === wanted) ||
      options.find((o) => squash(o.text).toLowerCase().includes(wanted));
    if (!match) return false;
    el.value = match.value;
    fire(el, "input");
    fire(el, "change");
    return true;
  }

  /** A radio/checkbox is asked for by id, so "true" means "this is the one".
   * Some models answer with the option's own text instead — accept that too
   * when it matches this element. */
  function wantsCheck(el, value) {
    const wanted = value.toLowerCase().trim();
    if (TRUTHY.has(wanted)) return true;
    if (wanted === (el.value || "").toLowerCase().trim()) return true;
    const label = labelText(el).toLowerCase();
    return !!label && (label === wanted || label.includes(wanted));
  }

  /** Applies the model's fills. Only ever fills something in: an existing
   * value is never overwritten and a box is never unchecked, so a bad answer
   * costs the user nothing they'd already typed. Returns how many landed. */
  window.__jseekerApplyFills = function (fills) {
    let applied = 0;

    // Look ids up in a map rather than interpolating them into a selector:
    // the ids come back from a model, and this way a malformed one is simply
    // a miss instead of a broken (or hostile) query.
    const byId = new Map();
    for (const el of document.querySelectorAll("[data-jseeker-id]")) {
      byId.set(el.dataset.jseekerId, el);
    }

    for (const fill of fills || []) {
      if (!fill || typeof fill.id !== "string" || typeof fill.value !== "string") continue;

      const el = byId.get(fill.id);
      if (!el || !isFillable(el)) continue;

      const type = (el.type || "").toLowerCase();

      if (type === "radio" || type === "checkbox") {
        if (el.checked || !wantsCheck(el, fill.value)) continue;
        el.click(); // click, not .checked — frameworks listen for the event
        if (el.checked) applied++;
        continue;
      }

      if (squash(el.value)) continue; // don't clobber what the user typed

      if (el.tagName === "SELECT") {
        if (setSelect(el, fill.value)) applied++;
      } else {
        setValue(el, fill.value);
        applied++;
      }
    }

    return applied;
  };
})();
