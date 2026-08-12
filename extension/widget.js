// The floating chat panel, injected into the page on demand (Alt+J, or the
// right-click menu). Talks to background.js over a long-lived port, which
// does the actual streaming call to the JSeeker app — a content script can't
// reach 127.0.0.1 itself, since cross-origin requests from the page's origin
// go through the service worker in MV3.
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

  // background.js marks the document before injecting when it just wants the
  // bubble present (after a fill) rather than the panel open in the user's
  // face. Reading it here rather than opening and closing again avoids a
  // frame of the panel flashing on screen.
  const autostart = document.documentElement.dataset.jseekerAutostart;
  delete document.documentElement.dataset.jseekerAutostart;

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
      .hint { color: #6b7280; font-size: 12px; }
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
        <button class="fill" title="Fill this form using your profile">Fill form</button>
        <button class="close" title="Close">✕</button>
      </header>
      <div class="log">
        <div class="hint">Ask about this posting, draft an answer, or tailor your experience to it.</div>
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

  /** Conversation as the app's chat API wants it — the page context rides
   * alongside rather than inside it, so it never fills up the history. */
  const history = [];
  let streaming = false;

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className = "msg " + (role === "user" ? "user" : role === "error" ? "err" : "bot");
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function pageContext() {
    if (!usePage.checked) return "";
    // innerText rather than the autofill snapshot: for a conversation the
    // readable posting is what matters, not the form controls.
    return (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_PAGE_CONTEXT);
  }

  const port = chrome.runtime.connect({ name: "jseeker-chat" });
  let pending = null; // the assistant bubble currently being streamed into

  port.onMessage.addListener((msg) => {
    if (msg.type === "delta") {
      if (!pending) pending = addMessage("assistant", "");
      pending.textContent += msg.text;
      log.scrollTop = log.scrollHeight;
      return;
    }
    if (msg.type === "done") {
      if (pending) history.push({ role: "assistant", content: pending.textContent });
      finish();
      return;
    }
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
    sendBtn.disabled = false;
    input.focus();
  }

  function send() {
    const text = input.value.trim();
    if (!text || streaming) return;

    addMessage("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    streaming = true;
    sendBtn.disabled = true;

    port.postMessage({ type: "chat", messages: history, page: pageContext() });
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

  root.querySelector(".fill").addEventListener("click", () => {
    port.postMessage({ type: "fill" });
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

  if (autostart !== "collapsed") open();
})();
