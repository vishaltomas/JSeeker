const tokenInput = document.getElementById("token");
const status = document.getElementById("status");

async function load() {
  const stored = await chrome.storage.local.get("jseekerToken");
  tokenInput.value = stored.jseekerToken || "";
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ jseekerToken: tokenInput.value.trim() });
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 2000);
});

load();
