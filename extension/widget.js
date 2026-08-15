// The floating chat panel — the whole of this extension. Injected into the
// page on demand (the toolbar icon, Alt+J, or the right-click menu). Talks to
// background.js over a long-lived port, which does the actual streaming call
// to the JSeeker app — a content script can't reach 127.0.0.1 itself, since
// cross-origin requests from the page's origin go through the service worker
// in MV3.
//
// It only ever reads the page, and only the visible text at that: nothing
// here writes to the page's fields or acts on it in any way.
//
// Everything lives inside a shadow root so the host page's CSS can't reach
// in and ours can't leak out.

(function () {
  // Injected again on a page that already has it — toggle instead of
  // stacking a second panel on top of the first.
  if (window.__jseekerWidget) {
    window.__jseekerWidget.toggle();
    return;
  }

  const MAX_PAGE_CONTEXT = 6000;

  const host = document.createElement("div");
  host.id = "jseeker-widget";
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(host);

  root.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .bubble {
        width: 48px; height: 48px; border-radius: 999px; border: 0; cursor: pointer;
        background: linear-gradient(135deg, #6d28d9, #a855f7);
        color: #fff; font: 700 17px/1 system-ui, sans-serif;
        box-shadow: 0 6px 20px rgba(0,0,0,.35);
      }
      .panel {
        display: none; flex-direction: column;
        width: 370px; height: 520px; max-height: 80vh;
        border-radius: 14px; overflow: hidden;
        background: #1c1d21; color: #e6e6e9;
        border: 1px solid #34353b;
        box-shadow: 0 18px 50px rgba(0,0,0,.45);
        font: 13px/1.5 system-ui, -apple-system, sans-serif;
      }
      :host(.open) .panel { display: flex; }
      :host(.open) .bubble { display: none; }
      header {
        display: flex; align-items: center; gap: 8px; padding: 10px 12px;
        background: linear-gradient(90deg, #2e1065, #6d28d9, #a855f7);
        color: #fff; font-weight: 700;
      }
      header .spacer { flex: 1; }
      header button {
        border: 0; background: rgba(255,255,255,.15); color: #fff;
        border-radius: 6px; padding: 4px 8px; cursor: pointer; font: 500 12px system-ui;
      }
      header button:hover { background: rgba(255,255,255,.28); }
      .log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .msg { max-width: 88%; padding: 8px 10px; border-radius: 10px; white-space: pre-wrap; word-wrap: break-word; }
      .user { align-self: flex-end; background: #2563eb; color: #fff; }
      .bot { align-self: flex-start; background: #292a2f; }
      .err { align-self: stretch; background: #3b1d1d; color: #fca5a5; }
      /* What the assistant is doing, not what it said — so it sits flat
         against the panel rather than in a bubble of its own. */
      .tool {
        align-self: flex-start; background: none; padding: 0 2px;
        color: #8b8d95; font-size: 12px;
      }
      .tool-failed { color: #c48b8b; }
      .hint { color: #6b7280; font-size: 12px; }
      .doc {
        align-self: flex-start; max-width: 100%; width: 100%;
        background: #23242a; border: 1px solid #34353b; border-radius: 10px; padding: 8px 10px;
      }
      .doc .kind { font-weight: 600; margin-bottom: 4px; }
      .doc pre {
        margin: 0; max-height: 220px; overflow: auto; white-space: pre-wrap; word-wrap: break-word;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #d4d4d8;
      }
      .doc .save {
        margin-top: 8px; border: 0; border-radius: 6px; padding: 5px 10px; cursor: pointer;
        background: #2563eb; color: #fff; font: 600 12px system-ui;
      }
      .doc .save[disabled] { opacity: .5; cursor: default; }
      .actions { display: flex; gap: 6px; padding: 8px 12px 0; }
      .actions button {
        flex: 1; border: 1px solid #3a3b42; background: #23242a; color: #e6e6e9;
        border-radius: 8px; padding: 6px 8px; cursor: pointer; font: 500 12px system-ui;
      }
      .actions button:hover:not([disabled]) { background: #2c2d34; border-color: #4b4c55; }
      .actions button[disabled] { opacity: .5; cursor: default; }
      .ctx { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-top: 1px solid #2a2b30; color: #9ca3af; font-size: 11.5px; }
      form { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid #2a2b30; }
      textarea {
        flex: 1; resize: none; height: 56px; padding: 7px 9px; border-radius: 8px;
        border: 1px solid #3a3b42; background: #131418; color: #e6e6e9; font: 13px system-ui;
      }
      textarea:focus { outline: none; border-color: #7c3aed; }
      form button {
        border: 0; border-radius: 8px; padding: 0 14px; cursor: pointer; color: #fff;
        background: linear-gradient(135deg, #6d28d9, #a855f7); font: 600 13px system-ui;
      }
      form button:disabled { opacity: .5; cursor: default; }
    </style>

    <button class="bubble" title="JSeeker (Alt+J)">J</button>

    <div class="panel">
      <header>
        JSeeker
        <span class="spacer"></span>
        <button class="close" title="Close">✕</button>
      </header>
      <div class="log">
        <div class="hint">Ask about this posting, draft an answer, or tailor your experience to it.</div>
      </div>
      <div class="actions">
        <button class="draft" data-kind="cover-letter">Cover letter</button>
        <button class="draft" data-kind="resume">Tailor resume</button>
      </div>
      <label class="ctx"><input type="checkbox" class="usePage" checked> Let the assistant read this page</label>
      <form>
        <textarea placeholder="Ask something… (Enter to send)"></textarea>
        <button type="submit">Send</button>
      </form>
    </div>
  `;

  const panel = root.querySelector(".panel");
  const log = root.querySelector(".log");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const sendBtn = form.querySelector("button");
  const usePage = root.querySelector(".usePage");
  const draftButtons = Array.from(root.querySelectorAll(".draft"));

  /** Conversation as the app's chat API wants it — the page context rides
   * alongside rather than inside it, so it never fills up the history. */
  const history = [];
  let streaming = false;
  /** Set while a document is being drafted, so the streamed text lands in a
   * document card rather than in the conversation. */
  let drafting = null;

  /** Identifies the posting to the app, which files everything said here
   * under one session per page — see main/sessions.ts. */
  function pageIdentity() {
    return { url: window.location.href, title: document.title };
  }

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className =
      "msg " +
      (role === "user" ? "user" : role === "error" ? "err" : role === "tool" ? "tool" : "bot");
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  const DOC_LABEL = { "cover-letter": "Cover letter", resume: "Tailored resume" };

  /** Turns a page title into something that reads well as a file name:
   * "Mobile Engineer — Bjak" -> "cover-letter-mobile-engineer-bjak.md". */
  function fileNameFor(kind) {
    const slug = (document.title || window.location.hostname || "posting")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return `${kind}${slug ? "-" + slug : ""}.md`;
  }

  /** Saves the drafted text through the page's own download machinery — a
   * Blob URL and a synthetic click. The extension has no downloads permission
   * and doesn't need one; this is the same thing any page can do. */
  function download(kind, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileNameFor(kind);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on a delay: Chrome needs the URL to survive the click.
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  }

  /** The card a drafted document streams into, with its own Save button. */
  function addDocument(kind) {
    const card = document.createElement("div");
    card.className = "doc";

    const heading = document.createElement("div");
    heading.className = "kind";
    heading.textContent = DOC_LABEL[kind] || "Document";

    const body = document.createElement("pre");

    const save = document.createElement("button");
    save.className = "save";
    save.textContent = "Download";
    save.disabled = true; // nothing to save until the draft finishes
    save.addEventListener("click", () => download(kind, body.textContent));

    card.append(heading, body, save);
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
    return { body, save };
  }

  function pageContext() {
    if (!usePage.checked) return "";
    // innerText, not markup: for a conversation the readable posting is what
    // matters, and the page's structure is noise the model has to pay for.
    return (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_PAGE_CONTEXT);
  }

  const port = chrome.runtime.connect({ name: "jseeker-chat" });
  let pending = null; // the assistant bubble currently being streamed into

  port.onMessage.addListener((msg) => {
    if (msg.type === "delta") {
      if (drafting) {
        drafting.body.textContent += msg.text;
        log.scrollTop = log.scrollHeight;
        return;
      }
      if (!pending) pending = addMessage("assistant", "");
      pending.textContent += msg.text;
      log.scrollTop = log.scrollHeight;
      return;
    }
    if (msg.type === "done") {
      if (drafting) {
        // A document isn't part of the conversation — it's an artifact, kept
        // out of the history so it doesn't crowd out later turns.
        drafting.save.disabled = !drafting.body.textContent.trim();
      } else if (pending) {
        history.push({ role: "assistant", content: pending.textContent });
      }
      finish();
      return;
    }
    // The assistant reaching for a tool — reading this posting, writing a
    // document into the app. It takes seconds and leaves no trace in the
    // reply, so it gets a line of its own that updates in place when the tool
    // finishes. A failed tool is narration too: the model is told and carries
    // on, so it must not look like the answer died.
    if (msg.type === "tool") {
      const { name, detail, status } = msg.activity || {};
      if (status === "start") {
        const el = addMessage("tool", `… ${detail}`);
        el.dataset.tool = name;
        return;
      }
      const rows = log.querySelectorAll(`.msg.tool[data-tool="${CSS.escape(name || "")}"]`);
      const row = rows[rows.length - 1];
      if (row) {
        row.textContent = status === "error" ? `× ${detail}` : `✓ ${detail}`;
        if (status === "error") row.classList.add("tool-failed");
      }
      return;
    }
    if (msg.type === "artifact") return; // the app filed it; nothing to show
    if (msg.type === "error") {
      // A half-streamed reply is still worth keeping on screen; the error
      // goes underneath it rather than replacing it.
      addMessage("error", msg.message);
      finish();
    }
  });

  // If the service worker is torn down mid-stream the port just closes, and
  // without this the panel would sit on a disabled Send button forever.
  port.onDisconnect.addListener(() => {
    if (streaming) {
      addMessage("error", "Lost the connection to JSeeker. Is the app still running?");
      finish();
    }
  });

  function finish() {
    streaming = false;
    pending = null;
    drafting = null;
    sendBtn.disabled = false;
    for (const button of draftButtons) button.disabled = false;
    input.focus();
  }

  function startStreaming() {
    streaming = true;
    sendBtn.disabled = true;
    for (const button of draftButtons) button.disabled = true;
  }

  function send() {
    const text = input.value.trim();
    if (!text || streaming) return;

    addMessage("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    startStreaming();

    port.postMessage({ type: "chat", messages: history, page: pageContext(), ...pageIdentity() });
  }

  /** Drafts a cover letter or a tailored resume from this posting. Needs the
   * page, so it says so plainly rather than quietly producing something
   * generic from the profile alone. */
  function draft(kind) {
    if (streaming) return;
    const page = pageContext();
    if (!page) {
      addMessage("error", "Turn on \u201cLet the assistant read this page\u201d first \u2014 a draft needs the posting.");
      return;
    }
    startStreaming();
    drafting = addDocument(kind);
    port.postMessage({ type: "document", kind, page, ...pageIdentity() });
  }

  for (const button of draftButtons) {
    button.addEventListener("click", () => draft(button.dataset.kind));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    e.stopPropagation(); // job sites bind their own keyboard shortcuts
  });

  function open() {
    host.classList.add("open");
    input.focus();
  }

  function collapse() {
    host.classList.remove("open");
  }

  root.querySelector(".bubble").addEventListener("click", open);
  root.querySelector(".close").addEventListener("click", collapse);

  window.__jseekerWidget = {
    open,
    collapse,
    toggle: () => (host.classList.contains("open") ? collapse() : open()),
  };

  // Injection is always a deliberate act by the user, so the panel opens
  // rather than leaving them a bubble to click a second time.
  open();
})();
