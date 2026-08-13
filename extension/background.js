// The extension's service worker. Its only job is the in-page chat panel:
// inject widget.js on demand, and relay the streamed reply between that panel
// and the JSeeker app.
//
// Nothing here reads or writes the page's form fields. The panel sends up the
// page's visible text (and only when the user leaves that switched on), and
// what comes back is a conversation — nothing is ever typed into the page or
// submitted on the user's behalf.

const SERVER_URL = "http://127.0.0.1:8743";
const TOKEN_KEY = "jseekerToken";

async function getToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return stored[TOKEN_KEY] || "";
}

// --- In-page chat panel (widget.js) ---
//
// Injected on demand: the toolbar icon, the keyboard shortcut and the context
// menu item each grant activeTab for the current page, so the panel works
// anywhere without the extension holding standing permission to read every
// site you visit.

function openWidget(tabId) {
  if (!tabId) return;
  chrome.scripting.executeScript({ target: { tabId }, files: ["widget.js"] });
}

chrome.action.onClicked.addListener((tab) => openWidget(tab?.id));

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

/** Streams one reply from the app to the panel — a chat turn or a drafted
 * document, which differ only in the route and the body. The panel can't call
 * 127.0.0.1 itself: in MV3 a content script's cross-origin requests come from
 * the page's origin, so the fetch has to happen here, where the extension's
 * host permission applies. */
async function streamFromApp(port, route, body) {
  const token = await getToken();
  if (!token) {
    port.postMessage({ type: "error", message: "No sync token set — see the extension's Options page." });
    return;
  }

  let res;
  try {
    res = await fetch(`${SERVER_URL}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    port.postMessage({ type: "error", message: "Can't reach JSeeker — is the app running?" });
    return;
  }

  if (res.status === 401) {
    port.postMessage({
      type: "error",
      message: "JSeeker rejected the token — copy it again from Settings → Extension.",
    });
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
      else if (event === "artifact") port.postMessage({ type: "artifact", artifact: data });
      else if (event === "done") port.postMessage({ type: "done" });
    }
  }
}

/** A local model can take a while to answer, and an idle MV3 service worker
 * is shut down long before that — taking the open stream with it, which the
 * panel would see as the connection dropping mid-reply. Keeping the worker
 * awake for the duration of a reply is the price of a slow model. */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "jseeker-chat") return;

  port.onMessage.addListener((msg) => {
    const request =
      msg.type === "chat"
        ? { route: "/chat", body: { messages: msg.messages, page: msg.page, url: msg.url, title: msg.title } }
        : msg.type === "document"
          ? { route: "/document", body: { kind: msg.kind, page: msg.page, url: msg.url, title: msg.title } }
          : null;
    if (!request) return;

    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
    streamFromApp(port, request.route, request.body)
      .catch((err) => port.postMessage({ type: "error", message: String(err) }))
      .finally(() => clearInterval(keepAlive));
  });
});
