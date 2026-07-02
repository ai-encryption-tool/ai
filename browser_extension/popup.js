const backendUrl = document.getElementById("backendUrl");
const apiKey = document.getElementById("apiKey");
const statusEl = document.getElementById("status");

chrome.storage.sync.get(["backendUrl", "apiKey"], (settings) => {
  backendUrl.value = settings.backendUrl || "http://localhost:8000";
  apiKey.value = settings.apiKey || "dev-local-api-key-change-me";
});

backendUrl.addEventListener("change", saveSettings);
apiKey.addEventListener("change", saveSettings);

function saveSettings() {
  chrome.storage.sync.set({ backendUrl: backendUrl.value, apiKey: apiKey.value });
}

document.getElementById("save").addEventListener("click", async () => {
  saveSettings();
  statusEl.textContent = "Extracting conversation...";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    statusEl.textContent = "No active tab found.";
    return;
  }

  const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONVERSATION" }).catch(() => null);
  if (!response?.text) {
    statusEl.textContent = "No supported conversation text found on this page.";
    return;
  }

  const source = tab.url?.includes("claude.ai") ? "claude" : tab.url?.includes("chatgpt.com") ? "chatgpt" : "browser_extension";
  const suggestionResponse = await fetch(`${backendUrl.value}/memory/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey.value },
    body: JSON.stringify({
      source,
      text: `${response.title}\n${response.url}\n\n${response.text}`
    })
  });

  if (!suggestionResponse.ok) {
    statusEl.textContent = `Vault error: ${suggestionResponse.status}`;
    return;
  }

  const data = await suggestionResponse.json();
  let saved = 0;
  for (const suggestion of data.suggestions) {
    const payload = { ...suggestion, approved: false };
    delete payload.reason;
    const createResponse = await fetch(`${backendUrl.value}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey.value },
      body: JSON.stringify(payload)
    });
    if (createResponse.ok) saved += 1;
  }

  statusEl.textContent = `${saved} pending memories saved for review.`;
});

