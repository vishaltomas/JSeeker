declare global {
  interface Window {
    api: {
      versions: {
        node: string;
        chrome: string;
        electron: string;
      };
      sendMessage: (message: string) => Promise<string>;
    };
  }
}

const versionsEl = document.getElementById("versions");
if (versionsEl) {
  const { node, chrome, electron } = window.api.versions;
  versionsEl.textContent = `Node ${node} · Chrome ${chrome} · Electron ${electron}`;
}

const messagesEl = document.getElementById("messages") as HTMLElement;
const formEl = document.getElementById("chat-form") as HTMLFormElement;
const inputEl = document.getElementById("chat-input") as HTMLInputElement;

function appendMessage(text: string, sender: "user" | "bot"): void {
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) {
    return;
  }

  appendMessage(text, "user");
  inputEl.value = "";
  inputEl.disabled = true;

  try {
    const reply = await window.api.sendMessage(text);
    appendMessage(reply, "bot");
  } finally {
    inputEl.disabled = false;
    inputEl.focus();
  }
});

export {};
