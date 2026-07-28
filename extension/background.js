// Fills the active tab's form using the JSeeker app's saved profile/resume:
// fetch profile data -> run the heuristic matcher in the page (content.js)
// -> for whatever's left, ask the app's LLM-fallback matching -> apply it.
// No auto-advance/auto-submit here — this only fills fields; submitting a
// real application in the user's real browser stays a manual, deliberate
// action.

const SERVER_URL = "http://127.0.0.1:8743";
const TOKEN_KEY = "jseekerToken";

async function getToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return stored[TOKEN_KEY] || "";
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

async function fillActiveTab(tabId) {
  const token = await getToken();
  if (!token) {
    setBadge("!", "#eab308"); // no token configured yet — see the extension's Options page
    return;
  }

  let profile;
  try {
    const res = await fetch(`${SERVER_URL}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("profile fetch failed: " + res.status);
    profile = await res.json();
  } catch {
    setBadge("!", "#ef4444"); // JSeeker probably isn't running
    return;
  }

  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });

  const [{ result: fillResult }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (p) => window.__jseekerFill(p),
    args: [profile],
  });

  let total = fillResult.filled;

  if (fillResult.unfilled.length) {
    try {
      const res = await fetch(`${SERVER_URL}/autofill`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fields: fillResult.unfilled }),
      });
      if (res.ok) {
        const { mapping } = await res.json();
        if (Array.isArray(mapping) && mapping.length) {
          const [{ result: applied }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: (m) => window.__jseekerApply(m),
            args: [mapping],
          });
          total += applied;
        }
      }
    } catch {
      // Best-effort: the heuristic pass above already applied, so don't
      // fail the whole action over the LLM fallback being unavailable.
    }
  }

  setBadge(String(total), "#22c55e");
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  fillActiveTab(tab.id);
});
