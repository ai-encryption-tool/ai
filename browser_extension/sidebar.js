const state = { suggestions: [], results: [], selected: [] };
const el = (id) => document.getElementById(id);
const statusEl = el("status");
const connectionDot = el("connectionDot");
const controls = {
  backendUrl: el("backendUrl"),
  apiKey: el("apiKey"),
  maxMemories: el("maxMemories"),
  defaultSource: el("defaultSource"),
  autoApprove: el("autoApprove"),
  chatPreview: el("chatPreview"),
  contextText: el("contextText"),
  suggestions: el("suggestions"),
  searchQuery: el("searchQuery"),
  searchResults: el("searchResults")
};

function showFlow(flow) {
  el("saveFlow").classList.toggle("hidden", flow !== "save");
  el("useFlow").classList.toggle("hidden", flow !== "use");
  el("settingsFlow").classList.toggle("hidden", flow !== "save");
}

chrome.storage.sync.get(["backendUrl", "apiKey", "maxMemories", "defaultSource", "autoApprove"], (settings) => {
  controls.backendUrl.value = settings.backendUrl || "http://localhost:8000";
  controls.apiKey.value = settings.apiKey || "dev-local-api-key-change-me";
  controls.maxMemories.value = settings.maxMemories || 5;
  controls.defaultSource.value = settings.defaultSource || "extension";
  controls.autoApprove.checked = Boolean(settings.autoApprove);
  checkStatus();
});

["backendUrl", "apiKey", "maxMemories", "defaultSource", "autoApprove"].forEach((id) => controls[id].addEventListener("change", saveSettings));

function saveSettings() {
  chrome.storage.sync.set({
    backendUrl: controls.backendUrl.value,
    apiKey: controls.apiKey.value,
    maxMemories: Number(controls.maxMemories.value || 5),
    defaultSource: controls.defaultSource.value,
    autoApprove: controls.autoApprove.checked
  });
}

async function api(path, options = {}) {
  const headers = options.body instanceof FormData ? { "X-API-Key": controls.apiKey.value } : { "Content-Type": "application/json", "X-API-Key": controls.apiKey.value };
  const response = await fetch(`${controls.backendUrl.value}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Vault API ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function activeTabMessage(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (!String(error.message || "").includes("Receiving end does not exist")) throw error;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

function sourceFromUrl(url = "") {
  if (url.includes("chatgpt.com")) return "chatgpt";
  if (url.includes("claude.ai")) return "claude";
  if (url.includes("gemini.google.com")) return "gemini";
  if (url.includes("copilot.microsoft.com")) return "copilot";
  return controls.defaultSource.value;
}

function runSafely(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      statusEl.textContent = error.message || "Something went wrong.";
    }
  };
}

async function checkStatus() {
  try {
    await fetch(`${controls.backendUrl.value}/health`);
    statusEl.textContent = "Backend connected.";
    connectionDot.classList.add("ok");
  } catch {
    statusEl.textContent = "Backend not reachable.";
    connectionDot.classList.remove("ok");
  }
}

async function extractChat() {
  statusEl.textContent = "Extracting visible chat...";
  const response = await activeTabMessage({ type: "EXTRACT_CONVERSATION" });
  if (!response?.text) throw new Error("No visible chat text found. Reload the AI page and try again.");
  const countLine = response.message_count ? `Messages captured: ${response.message_count}` : "Messages captured: unknown";
  controls.chatPreview.value = `${response.title}\n${response.url}\n${countLine}\n\n${response.text}`.trim();
  statusEl.textContent = `Preview ready. Captured ${response.message_count || "loaded"} message blocks.`;
}

async function generateSuggestions() {
  if (!controls.chatPreview.value.trim()) await extractChat();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const data = await api("/memory/suggestions", {
    method: "POST",
    body: JSON.stringify({ text: controls.chatPreview.value, source: sourceFromUrl(tab?.url || "") })
  });
  state.suggestions = data.suggestions || [];
  renderSuggestions();
  statusEl.textContent = `${state.suggestions.length} suggestions generated. Review before saving.`;
}

async function saveFullChatTranscript() {
  if (!controls.chatPreview.value.trim()) await extractChat();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const source = sourceFromUrl(tab?.url || "");
  const title = tab?.title || "AI chat transcript";
  const content = [
    `Full ${source} chat transcript: ${title}`,
    `URL: ${tab?.url || "unknown"}`,
    "",
    controls.chatPreview.value
  ].join("\n");
  const payload = {
    type: "private_note",
    content,
    source,
    confidence: 0.9,
    approved: controls.autoApprove.checked,
    tags: ["full-chat", source, "transcript"]
  };
  const saved = await api("/memories", { method: "POST", body: JSON.stringify(payload) });
  if (controls.autoApprove.checked) await api(`/memories/${saved.id}/approve`, { method: "POST" });
  statusEl.textContent = controls.autoApprove.checked
    ? "Full chat transcript saved and approved."
    : "Full chat transcript saved as pending. Approve it in the Vault before one-click search uses it.";
}

async function saveSuggestion(index) {
  const suggestion = state.suggestions[index];
  const textarea = document.querySelector(`[data-suggestion-index="${index}"]`);
  const payload = { ...suggestion, content: textarea?.value || suggestion.content, approved: controls.autoApprove.checked };
  delete payload.reason;
  const saved = await api("/memories", { method: "POST", body: JSON.stringify(payload) });
  if (controls.autoApprove.checked) await api(`/memories/${saved.id}/approve`, { method: "POST" });
  state.suggestions.splice(index, 1);
  renderSuggestions();
  statusEl.textContent = payload.approved ? "Memory saved and approved." : "Memory saved as pending.";
}

function rejectSuggestion(index) {
  state.suggestions.splice(index, 1);
  renderSuggestions();
}

function renderSuggestions() {
  controls.suggestions.innerHTML = state.suggestions.map((memory, index) => `
    <article class="memory">
      <div class="row"><span class="pill">${memory.type}</span><span class="pill">${memory.source}</span><span class="pill">${Number(memory.confidence).toFixed(2)}</span></div>
      <textarea data-suggestion-index="${index}">${escapeHtml(memory.content)}</textarea>
      <p class="meta">${escapeHtml(memory.reason || "Suggested locally")}</p>
      <div class="row">
        <button data-save-suggestion="${index}">Save${controls.autoApprove.checked ? " approved" : " pending"}</button>
        <button class="secondary" data-reject-suggestion="${index}">Reject</button>
      </div>
    </article>
  `).join("");
}

async function searchVault(query = controls.searchQuery.value) {
  const data = await api("/memory/search", {
    method: "POST",
    body: JSON.stringify({ query, limit: Number(controls.maxMemories.value || 5), approved_only: true })
  });
  state.results = data || [];
  state.selected = state.results.slice(0, Number(controls.maxMemories.value || 5));
  renderResults();
  statusEl.textContent = `${state.results.length} approved memories found.`;
}

function toggleSelected(memory) {
  const exists = state.selected.some((item) => item.id === memory.id);
  state.selected = exists ? state.selected.filter((item) => item.id !== memory.id) : [...state.selected, memory];
  renderResults();
}

function renderResults() {
  controls.searchResults.innerHTML = state.results.map((memory, index) => {
    const checked = state.selected.some((item) => item.id === memory.id) ? "checked" : "";
    return `
      <article class="memory">
        <label class="memory-select">
          <input type="checkbox" data-result-index="${index}" ${checked} />
          <span>Use this memory</span>
        </label>
        <p>${escapeHtml(displayMemoryContent(memory))}</p>
        ${isTranscript(memory) ? `<p class="meta">Full transcript stored. It will be included in generated context when relevant.</p>` : ""}
        <div class="row"><span class="pill">${memory.type}</span><span class="pill">${memory.source}</span><span class="pill">score ${Number(memory.score || 0).toFixed(2)}</span></div>
        <p class="meta">${escapeHtml((memory.tags || []).join(", "))}</p>
      </article>
    `;
  }).join("");
}

async function buildContextFromCurrentPrompt() {
  const promptResponse = await activeTabMessage({ type: "GET_PROMPT" });
  const originalPrompt = cleanPrompt(promptResponse?.text || "");
  if (!originalPrompt) throw new Error("Type a prompt first.");
  if (!state.results.length && !state.selected.length) await searchVault(originalPrompt);
  const selectedMemories = state.selected.slice(0, Number(controls.maxMemories.value || 5));
  if (!selectedMemories.length) throw new Error("Select at least one memory first.");
  const fileText = formatContextFile(selectedMemories, originalPrompt);
  controls.contextText.value = fileText;
  await copyContextText();
  statusEl.textContent = "Vault context copied. Paste it into the chat.";
}

async function findRelevantForPrompt(insertImmediately = false) {
  const promptResponse = await activeTabMessage({ type: "GET_PROMPT" });
  if (!promptResponse?.ok || !promptResponse.text.trim()) {
    statusEl.textContent = promptResponse?.error || "Type a prompt first.";
    return;
  }
  await searchVault(promptResponse.text);
  renderResults();
  if (!state.selected.length) {
    statusEl.textContent = "No approved memories matched this prompt.";
    return;
  }
  if (insertImmediately) await buildContextFromCurrentPrompt();
}

function formatContextFile(memories, originalPrompt) {
  const sections = memories.slice(0, Number(controls.maxMemories.value || 5)).map((memory, index) => [
    `## Memory ${index + 1}`,
    `Type: ${memory.type}`,
    `Source: ${memory.source}`,
    `Tags: ${(memory.tags || []).join(", ") || "none"}`,
    "",
    memory.content
  ].join("\n"));
  return [
    "AI Memory Vault Context",
    "This file was attached by the local AI Memory Vault browser extension.",
    "",
    originalPrompt ? `Original prompt:\n${originalPrompt}` : "Original prompt: empty",
    "",
    sections.join("\n\n---\n\n")
  ].join("\n");
}

function cleanPrompt(prompt) {
  return String(prompt || "")
    .replace(/^Use the attached AI Memory Vault context file, then answer this:\s*/i, "")
    .replace(/^Use the attached AI Memory Vault context file for this chat\.\s*/i, "")
    .trim();
}

async function copyContextText() {
  const text = controls.contextText.value;
  if (!text.trim()) throw new Error("No context text generated yet.");
  await navigator.clipboard.writeText(text);
  statusEl.textContent = "Context text copied to clipboard.";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function isTranscript(memory) {
  return memory?.tags?.includes("full-chat") || memory?.tags?.includes("transcript") || memory?.content?.startsWith("Full ");
}

function displayMemoryContent(memory) {
  if (!isTranscript(memory)) return memory.content;
  const firstLine = (memory.content || "").split("\n")[0] || "Full chat transcript";
  return firstLine.replace(/^Full\s+/i, "").replace(/\s+chat transcript:\s*/i, " chat: ");
}

el("showSaveFlow").addEventListener("click", () => showFlow("save"));
el("showUseFlow").addEventListener("click", () => showFlow("use"));
el("extractChat").addEventListener("click", runSafely(extractChat));
el("saveFullChat").addEventListener("click", runSafely(saveFullChatTranscript));
el("generateSuggestions").addEventListener("click", runSafely(generateSuggestions));
el("searchVault").addEventListener("click", runSafely(() => searchVault()));
el("findRelevant").addEventListener("click", runSafely(() => findRelevantForPrompt(false)));
el("useVaultContext").addEventListener("click", runSafely(buildContextFromCurrentPrompt));
el("copyContext").addEventListener("click", runSafely(copyContextText));

document.addEventListener("click", (event) => {
  const saveIndex = event.target?.dataset?.saveSuggestion;
  const rejectIndex = event.target?.dataset?.rejectSuggestion;
  if (saveIndex !== undefined) saveSuggestion(Number(saveIndex));
  if (rejectIndex !== undefined) rejectSuggestion(Number(rejectIndex));
});

document.addEventListener("change", (event) => {
  const resultIndex = event.target?.dataset?.resultIndex;
  if (resultIndex !== undefined) toggleSelected(state.results[Number(resultIndex)]);
});
