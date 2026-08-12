// Fills the active tab's form using the JSeeker app's model:
// snapshot the page (content.js) -> hand the whole thing to the app, which
// asks the configured model what goes where -> apply the answer.
//
// The profile never comes into the browser; only the page goes out and a
// list of {id, value} comes back. No auto-advance/auto-submit either — this
// only fills fields; submitting a real application in the user's real
// browser stays a manual, deliberate action.

const SERVER_URL = "http://127.0.0.1:8743";
const TOKEN_KEY = "jseekerToken";

async function getToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return stored[TOKEN_KEY] || "";
}

function setBadge(text, color, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title: title || "Fill this form with JSeeker" });
}

async function fillActiveTab(tabId) {
  const token = await getToken();
  if (!token) {
    setBadge("!", "#eab308", "No sync token — see the extension's Options page");
    return;
  }

  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });

  const [{ result: snapshot }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__jseekerSerialize(),
  });

  if (!snapshot || !snapshot.fields) {
    setBadge("0", "#64748b", "No fillable fields found on this page");
    return;
  }

  // The model reads the entire page, which on a local model is slow enough
  // that the user needs to see something happening.
  setBadge("…", "#3b82f6", `Reading ${snapshot.fields} fields…`);

  let fills;
  let attemptId;
  try {
    const res = await fetch(`${SERVER_URL}/autofill`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ page: snapshot.page, url: snapshot.url, title: snapshot.title }),
    });
    if (res.status === 401) {
      setBadge("!", "#eab308", "JSeeker rejected the token — copy it again from Settings → Extension");
      return;
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      setBadge("!", "#ef4444", detail.error || `JSeeker responded ${res.status}`);
      return;
    }
    ({ fills, id: attemptId } = await res.json());
  } catch {
    setBadge("!", "#ef4444", "Can't reach JSeeker — is the app running?");
    return;
  }

  if (!Array.isArray(fills) || !fills.length) {
    setBadge("0", "#64748b", "The model didn't find anything it could fill from your profile");
    showBubble(tabId); // nothing filled is exactly when you want to ask why
    return;
  }

  const [{ result: applied }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (f) => window.__jseekerApplyFills(f),
    args: [fills],
  });

  setBadge(String(applied), "#22c55e", `Filled ${applied} of ${snapshot.fields} fields`);
  showBubble(tabId);

  // Close the loop so the app can show what actually landed, not just what
  // the model proposed. Best-effort — the fill already happened either way.
  if (attemptId) {
    fetch(`${SERVER_URL}/applied`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: attemptId, applied }),
    }).catch(() => {});
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  fillActiveTab(tab.id);
});

// --- In-page chat panel (widget.js) ---
//
// Injected on demand: both the keyboard shortcut and the context menu item
// grant activeTab for the current page, so the panel works anywhere without
// the extension holding standing permission to read every site you visit.

function openWidget(tabId) {
  if (!tabId) return;
  chrome.scripting.executeScript({ target: { tabId }, files: ["widget.js"] });
}

/** Puts the bubble on the page without opening the panel — used after a fill,
 * so the chat is one click away exactly where it's useful instead of only
 * existing for whoever remembers the shortcut. */
async function showBubble(tabId) {
  if (!tabId) return;
  try {
    const [{ result: present }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__jseekerWidget) return true; // leave it as the user left it
        document.documentElement.dataset.jseekerAutostart = "collapsed";
        return false;
      },
    });
    if (!present) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["widget.js"] });
    }
  } catch {
    // Injection can fail on restricted pages; the fill itself already worked.
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-chat") openWidget(tab?.id);
});

// Re-created rather than created: `contextMenus.create` throws on a duplicate
// id, and onInstalled alone doesn't cover every way a service worker comes
// back to life.
function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "jseeker-chat",
      title: "Ask JSeeker about this page",
      contexts: ["page", "selection", "editable"],
    });
  });
}

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);
ensureContextMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "jseeker-chat") openWidget(tab?.id);
});

/** Streams one reply from the app to the panel. The panel can't call
 * 127.0.0.1 itself — in MV3 a content script's cross-origin requests come
 * from the page's origin, so the fetch has to happen here, where the
 * extension's host permission applies. */
async function streamChat(port, messages, page) {
  const token = await getToken();
  if (!token) {
    port.postMessage({ type: "error", message: "No sync token set — see the extension's Options page." });
    return;
  }

  let res;
  try {
    res = await fetch(`${SERVER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages, page }),
    });
  } catch {
    port.postMessage({ type: "error", message: "Can't reach JSeeker — is the app running?" });
    return;
  }

  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({}));
    port.postMessage({ type: "error", message: detail.error || `JSeeker responded ${res.status}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; each carries one `event:`
    // and one `data:` line.
    let split;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      const event = (frame.match(/^event: (.*)$/m) || [])[1];
      const raw = (frame.match(/^data: (.*)$/m) || [])[1];
      if (!event || raw === undefined) continue;

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      if (event === "delta") port.postMessage({ type: "delta", text: data });
      else if (event === "error") port.postMessage({ type: "error", message: data });
      else if (event === "done") port.postMessage({ type: "done" });
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "jseeker-chat") return;

  port.onMessage.addListener((msg) => {
    if (msg.type === "chat") {
      streamChat(port, msg.messages, msg.page).catch((err) => {
        port.postMessage({ type: "error", message: String(err) });
      });
    } else if (msg.type === "fill" && port.sender?.tab?.id) {
      fillActiveTab(port.sender.tab.id);
    }
  });
});
