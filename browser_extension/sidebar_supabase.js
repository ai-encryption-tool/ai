const state = { suggestions: [], results: [], selected: [], savedChats: [], session: null, profile: null };
const el = (id) => document.getElementById(id);
const statusEl = el("status");
const connectionDot = el("connectionDot");
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const productionConfig = globalThis.AI_MEMORY_VAULT_CONFIG || {};
const directInsertLimit = 6000;
const savedChatDisplayLimit = 20;

const controls = {
  supabaseUrl: el("supabaseUrl"),
  supabaseAnonKey: el("supabaseAnonKey"),
  email: el("email"),
  password: el("password"),
  passphrase: el("passphrase"),
  maxMemories: el("maxMemories"),
  defaultSource: el("defaultSource"),
  autoApprove: el("autoApprove"),
  chatTitle: el("chatTitle"),
  chatPreview: el("chatPreview"),
  contextHelp: el("contextHelp"),
  contextText: el("contextText"),
  suggestions: el("suggestions"),
  searchQuery: el("searchQuery"),
  searchResults: el("searchResults"),
  savedChats: el("savedChats"),
  authPanel: el("authPanel"),
  vaultPanel: el("vaultPanel"),
  accountStatus: el("accountStatus")
};

function syncGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function localGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function cleanSupabaseUrl() {
  return (productionConfig.supabaseUrl || controls.supabaseUrl.value).trim().replace(/\/+$/, "");
}

async function saveSettings() {
  await chrome.storage.sync.set({
    supabaseUrl: cleanSupabaseUrl(),
    supabaseAnonKey: productionConfig.supabaseAnonKey || controls.supabaseAnonKey.value.trim(),
    email: controls.email.value.trim(),
    maxMemories: Number(controls.maxMemories.value || 5),
    defaultSource: controls.defaultSource.value,
    autoApprove: controls.autoApprove.checked
  });
  await chrome.storage.local.set({ vaultPassphrase: controls.passphrase.value });
}

function requireConfig() {
  const url = cleanSupabaseUrl();
  const anonKey = productionConfig.supabaseAnonKey || controls.supabaseAnonKey.value.trim();
  if (!url || !anonKey) throw new Error("Extension is missing vault service configuration. Reinstall the Chrome Web Store version or add vault service settings.");
  return { url, anonKey };
}

function requireSession() {
  if (!state.session?.access_token) throw new Error("Sign in first.");
  return state.session;
}

function requirePassphrase() {
  if (!controls.passphrase.value) throw new Error("Enter your secret code.");
  return controls.passphrase.value;
}

async function supabaseFetch(path, options = {}) {
  const { url, anonKey } = requireConfig();
  const headers = {
    apikey: anonKey,
    "Content-Type": "application/json",
    ...(options.auth === false ? {} : { Authorization: `Bearer ${requireSession().access_token}` }),
    ...(options.headers || {})
  };
  const response = await fetch(`${url}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.msg || body.message || body.error_description || `Vault service ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function signIn() {
  await saveSettings();
  const session = await supabaseFetch("/auth/v1/token?grant_type=password", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ email: controls.email.value.trim(), password: controls.password.value })
  });
  state.session = session;
  controls.password.value = "";
  await chrome.storage.local.set({ supabaseSession: session });
  await checkStatus();
}

async function signUp() {
  await saveSettings();
  const { anonKey } = requireConfig();
  await supabaseFetch("/auth/v1/signup", {
    auth: false,
    method: "POST",
    headers: { Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ email: controls.email.value.trim(), password: controls.password.value })
  });
  await signIn();
  statusEl.textContent = "Account created and signed in.";
}

async function resetPassword() {
  await saveSettings();
  const email = controls.email.value.trim();
  if (!email) throw new Error("Enter your email first.");
  const { anonKey } = requireConfig();
  await supabaseFetch("/auth/v1/recover", {
    auth: false,
    method: "POST",
    headers: { Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({
      email,
      redirect_to: "https://ai-memory-vault.com/reset-password"
    })
  });
  statusEl.textContent = "Password reset email sent. Open the link and set a new password.";
}

async function signOut() {
  state.session = null;
  state.profile = null;
  state.results = [];
  state.selected = [];
  state.savedChats = [];
  await chrome.storage.local.remove(["supabaseSession"]);
  renderAuthState();
  statusEl.textContent = "Signed out.";
}

async function clearSavedSession(reason = "Saved login expired. Sign in again.") {
  state.session = null;
  state.profile = null;
  state.results = [];
  state.selected = [];
  state.savedChats = [];
  await chrome.storage.local.remove(["supabaseSession"]);
  renderAuthState();
  statusEl.textContent = reason;
}

async function refreshSessionIfNeeded() {
  if (!state.session?.refresh_token || !state.session?.expires_at) return;
  const expiresSoon = state.session.expires_at * 1000 - Date.now() < 60000;
  if (!expiresSoon) return;
  try {
    const session = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
      auth: false,
      method: "POST",
      body: JSON.stringify({ refresh_token: state.session.refresh_token })
    });
    state.session = session;
    await chrome.storage.local.set({ supabaseSession: session });
  } catch (error) {
    await clearSavedSession(error.message.includes("Refresh Token") ? "Saved login expired. Sign in again." : error.message);
  }
}

async function loadProfile() {
  const data = await supabaseFetch("/rest/v1/profiles?select=*&limit=1");
  state.profile = data?.[0] || null;
  return state.profile;
}

function renderAuthState() {
  const signedIn = Boolean(state.session?.access_token);
  controls.authPanel.classList.toggle("hidden", signedIn);
  controls.vaultPanel.classList.toggle("hidden", !signedIn);
  controls.accountStatus.textContent = signedIn
    ? `${shortAccountLabel(controls.email.value)} | ${state.profile?.status || "pending"}`
    : "Not signed in";
}

async function checkStatus() {
  try {
    requireConfig();
    if (state.session) await refreshSessionIfNeeded();
    if (!state.session) {
      connectionDot.classList.remove("ok");
      renderAuthState();
      statusEl.textContent = productionConfig.supabaseUrl && productionConfig.supabaseAnonKey
        ? "Create an account or sign in."
        : "Add vault service settings and sign in.";
      return;
    }
    const profile = await loadProfile();
    renderAuthState();
    if (profile?.status === "approved") {
      connectionDot.classList.add("ok");
      statusEl.textContent = "Vault connected.";
    } else {
      connectionDot.classList.remove("ok");
      statusEl.textContent = `Signed in, but this account is not active. Status: ${profile?.status || "pending"}.`;
    }
  } catch (error) {
    connectionDot.classList.remove("ok");
    renderAuthState();
    statusEl.textContent = error.message;
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function cryptoProvider() {
  const provider = globalThis.crypto;
  if (!provider?.subtle) {
    throw new Error("Web Crypto is unavailable in this extension page. Reload the extension and browser.");
  }
  return provider;
}

async function deriveKey(passphrase, salt) {
  const provider = cryptoProvider();
  const baseKey = await provider.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return provider.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJson(payload) {
  const provider = cryptoProvider();
  const salt = provider.getRandomValues(new Uint8Array(16));
  const iv = provider.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(requirePassphrase(), salt);
  const ciphertext = await provider.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload)));
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv), salt: bytesToBase64(salt), version: 1 };
}

async function decryptJson(row) {
  const provider = cryptoProvider();
  const key = await deriveKey(requirePassphrase(), base64ToBytes(row.salt));
  const plaintext = await provider.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(row.iv) }, key, base64ToBytes(row.ciphertext));
  return { id: row.id, created_at: row.created_at, updated_at: row.updated_at, ...JSON.parse(decoder.decode(plaintext)) };
}

async function insertEncryptedMemory(payload) {
  if (state.profile?.status !== "approved") throw new Error("Your account is not approved yet.");
  const rows = await supabaseFetch("/rest/v1/memories?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(await encryptJson(payload))
  });
  return rows?.[0];
}

async function updateEncryptedMemory(memory, patch) {
  if (state.profile?.status !== "approved") throw new Error("Your account is not approved yet.");
  const payload = {
    type: memory.type,
    content: memory.content,
    source: memory.source,
    confidence: memory.confidence,
    approved: memory.approved,
    tags: memory.tags || [],
    title: memory.title,
    ...patch
  };
  const rows = await supabaseFetch(`/rest/v1/memories?id=eq.${encodeURIComponent(memory.id)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(await encryptJson(payload))
  });
  return rows?.[0] ? await decryptJson(rows[0]) : { ...memory, ...patch };
}

async function loadEncryptedMemories() {
  if (state.profile?.status !== "approved") throw new Error("Your account is not approved yet.");
  const rows = await supabaseFetch("/rest/v1/memories?select=*&order=updated_at.desc");
  const memories = [];
  for (const row of rows || []) memories.push(await decryptJson(row));
  return memories;
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
      await saveSettings();
      if (state.session) await refreshSessionIfNeeded();
      await fn(...args);
    } catch (error) {
      statusEl.textContent = error.message || "Something went wrong.";
    }
  };
}

async function extractChat() {
  statusEl.textContent = "Extracting visible chat...";
  const response = await activeTabMessage({ type: "EXTRACT_CONVERSATION" });
  if (!response?.text) throw new Error("No visible chat text found. Reload the AI page and try again.");
  const countLine = response.message_count ? `Messages captured: ${response.message_count}` : "Messages captured: unknown";
  if (!controls.chatTitle.value.trim()) controls.chatTitle.value = cleanChatTitle(response.title || "AI chat");
  controls.chatPreview.value = `${response.title}\n${response.url}\n${countLine}\n\n${response.text}`.trim();
  statusEl.textContent = `Preview ready. Captured ${response.message_count || "loaded"} message blocks.`;
}

function extractMemorySuggestions(text, source) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  const chunks = cleaned.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => item.length > 40 && item.length < 700).slice(0, 8);
  return (chunks.length ? chunks : [cleaned.slice(0, 900)]).filter(Boolean).map((content) => ({
    type: /\b(prefer|like|want|usually|always)\b/i.test(content) ? "preference" : "note",
    content,
    source,
    confidence: 0.65,
    approved: controls.autoApprove.checked,
    tags: ["suggested", source],
    reason: "Suggested locally in the extension."
  }));
}

async function generateSuggestions() {
  if (!controls.chatPreview.value.trim()) await extractChat();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.suggestions = extractMemorySuggestions(controls.chatPreview.value, sourceFromUrl(tab?.url || ""));
  renderSuggestions();
  statusEl.textContent = `${state.suggestions.length} local suggestions generated. Review before saving.`;
}

async function saveFullChatTranscript() {
  if (!controls.chatPreview.value.trim()) await extractChat();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const source = sourceFromUrl(tab?.url || "");
  const title = cleanChatTitle(controls.chatTitle.value || tab?.title || "AI chat transcript");
  const content = [`Saved chat: ${title}`, `Source: ${source}`, `URL: ${tab?.url || "unknown"}`, "", controls.chatPreview.value].join("\n");
  await insertEncryptedMemory({ type: "private_note", title, content, source, confidence: 0.9, approved: controls.autoApprove.checked, tags: ["full-chat", source, "transcript"] });
  controls.chatTitle.value = "";
  statusEl.textContent = controls.autoApprove.checked ? "Encrypted chat saved and approved." : "Encrypted chat saved as pending.";
  await loadSavedChats();
}

async function saveSuggestion(index) {
  const suggestion = state.suggestions[index];
  const textarea = document.querySelector(`[data-suggestion-index="${index}"]`);
  const payload = { ...suggestion, content: textarea?.value || suggestion.content, approved: controls.autoApprove.checked };
  delete payload.reason;
  await insertEncryptedMemory(payload);
  state.suggestions.splice(index, 1);
  renderSuggestions();
  statusEl.textContent = payload.approved ? "Encrypted memory saved and approved." : "Encrypted memory saved as pending.";
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

function scoreMemory(memory, query) {
  const haystack = [memory.content, memory.type, memory.source, ...(memory.tags || [])].join(" ").toLowerCase();
  const terms = String(query || "").toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  if (!terms.length) return 0;
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}

async function searchVault(query = controls.searchQuery.value) {
  const all = await loadEncryptedMemories();
  state.results = all.filter((memory) => memory.approved)
    .map((memory) => ({ ...memory, score: scoreMemory(memory, query) }))
    .filter((memory) => !query.trim() || memory.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(controls.maxMemories.value || 5));
  state.selected = [];
  renderResults();
  hideContextFallback();
  statusEl.textContent = `${state.results.length} memories found.`;
}

async function loadSavedChats() {
  const all = await loadEncryptedMemories();
  state.savedChats = all
    .filter(isTranscript)
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  renderSavedChats();
  statusEl.textContent = `${state.savedChats.length} saved encrypted chats found.`;
}

function renderSavedChats() {
  const visible = state.savedChats.slice(0, savedChatDisplayLimit);
  const footer = state.savedChats.length > savedChatDisplayLimit
    ? `<p class="meta">Showing latest ${savedChatDisplayLimit} of ${state.savedChats.length} saved chats.</p>`
    : "";
  controls.savedChats.innerHTML = `
    <div class="chat-list">
      ${visible.map((memory, index) => `
        <article class="chat-row">
          <input class="chat-title-input" data-chat-title-index="${index}" value="${escapeHtml(displayMemoryTitle(memory))}" aria-label="Chat name" />
          <button class="secondary compact-button" data-rename-chat="${index}">Rename</button>
          <button class="compact-button" data-select-chat="${index}">Use</button>
        </article>
      `).join("")}
    </div>
    ${footer}
  `;
}

async function useSearchResult(index) {
  const memory = state.results[index];
  if (!memory) return;
  await insertOrShowContext(formatContextFile([memory], ""), "Memory inserted into the AI chat.");
}

function showContextFallback(text, message = "Context is large, so copy it and paste it into the AI chat.") {
  controls.contextText.value = text;
  controls.contextHelp.textContent = message;
  controls.contextHelp.classList.remove("hidden");
  controls.contextText.classList.remove("hidden");
  el("copyContext").classList.remove("hidden");
}

function hideContextFallback() {
  controls.contextHelp.classList.add("hidden");
  controls.contextText.classList.add("hidden");
  el("copyContext").classList.add("hidden");
}

async function insertOrShowContext(text, shortStatus) {
  if (text.length <= directInsertLimit) {
    const response = await activeTabMessage({ type: "INSERT_PROMPT", text });
    if (response?.ok) {
      controls.contextText.value = "";
      hideContextFallback();
      statusEl.textContent = shortStatus;
      return;
    }
    showContextFallback(text, response?.error || "Could not insert directly. Copy and paste the context instead.");
    statusEl.textContent = response?.error || "Could not insert directly. Copy and paste the context instead.";
    return;
  }
  showContextFallback(text);
  await copyContextText();
  statusEl.textContent = "Context is large, so it was copied. Paste it into the chat.";
}

async function renameSavedChat(index) {
  const memory = state.savedChats[index];
  if (!memory) return;
  const input = document.querySelector(`[data-chat-title-index="${index}"]`);
  const title = cleanChatTitle(input?.value || displayMemoryTitle(memory));
  const content = replaceTranscriptTitle(memory.content, title);
  const updated = await updateEncryptedMemory(memory, { title, content });
  state.savedChats[index] = updated;
  state.results = state.results.map((item) => item.id === updated.id ? updated : item);
  state.selected = state.selected.map((item) => item.id === updated.id ? updated : item);
  renderSavedChats();
  renderResults();
  statusEl.textContent = "Chat renamed.";
}

function selectSavedChat(index) {
  const memory = state.savedChats[index];
  if (!memory) return;
  const exists = state.selected.some((item) => item.id === memory.id);
  if (!exists) state.selected = [memory, ...state.selected].slice(0, Number(controls.maxMemories.value || 5));
  insertOrShowContext(formatContextFile([memory], ""), "Saved chat inserted into the AI chat.").catch((error) => {
    showContextFallback(formatContextFile([memory], ""), error.message || "Could not insert directly. Copy and paste the context instead.");
    statusEl.textContent = error.message || "Could not insert directly. Copy and paste the context instead.";
  });
}

function renderResults() {
  controls.searchResults.innerHTML = state.results.map((memory, index) => `
    <article class="result-row">
      <div class="result-text">
        <strong>${escapeHtml(displayMemoryContent(memory))}</strong>
        <span>${escapeHtml(compactMeta(memory))}</span>
      </div>
      <button class="compact-button" data-use-result-index="${index}">Use</button>
    </article>
  `).join("");
}

function formatContextFile(memories, originalPrompt) {
  const sections = memories.map((memory, index) => [`## Memory ${index + 1}`, `Type: ${memory.type}`, `Source: ${memory.source}`, `Tags: ${(memory.tags || []).join(", ") || "none"}`, "", memory.content].join("\n"));
  const promptSection = originalPrompt ? [`Original prompt:\n${originalPrompt}`, ""] : [];
  return ["AI Memory Vault Context", "This context was decrypted locally by the AI Memory Vault extension.", "", ...promptSection, sections.join("\n\n---\n\n")].join("\n");
}

function cleanPrompt(prompt) {
  return String(prompt || "").replace(/^Use the attached AI Memory Vault context file, then answer this:\s*/i, "").replace(/^Use the attached AI Memory Vault context file for this chat\.\s*/i, "").trim();
}

async function copyContextText() {
  if (!controls.contextText.value.trim()) throw new Error("No context text generated yet.");
  await navigator.clipboard.writeText(controls.contextText.value);
  statusEl.textContent = "Context text copied to clipboard.";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function displayMemoryContent(memory) {
  if (!isTranscript(memory)) return memory.content;
  return displayMemoryTitle(memory);
}

function displayMemoryTitle(memory) {
  if (memory.title) return memory.title;
  const firstLine = (memory.content || "").split("\n")[0] || "Saved chat";
  return firstLine
    .replace(/^Full\s+\w+\s+chat transcript:\s*/i, "")
    .replace(/^Saved chat:\s*/i, "")
    .trim() || "Saved chat";
}

function isTranscript(memory) {
  return (memory.tags || []).includes("full-chat") || (memory.tags || []).includes("transcript");
}

function compactMeta(memory) {
  const tags = (memory.tags || []).filter((tag) => !["full-chat", "transcript"].includes(tag)).slice(0, 2);
  return [memory.type, ...tags].filter(Boolean).join(" · ");
}

function shortAccountLabel(email) {
  const value = String(email || "Signed in");
  if (value.length <= 26) return value;
  const [name, domain] = value.split("@");
  if (!domain) return `${value.slice(0, 23)}...`;
  return `${name.slice(0, 12)}...@${domain}`;
}

function cleanChatTitle(title) {
  return String(title || "Saved chat").replace(/\s+/g, " ").trim().slice(0, 120) || "Saved chat";
}

function replaceTranscriptTitle(content, title) {
  const lines = String(content || "").split("\n");
  if (/^(Full\s+\w+\s+chat transcript:|Saved chat:)/i.test(lines[0] || "")) {
    lines[0] = `Saved chat: ${title}`;
    return lines.join("\n");
  }
  return [`Saved chat: ${title}`, "", content].join("\n");
}

function showFlow(flow) {
  el("saveFlow").classList.toggle("hidden", flow !== "save");
  el("useFlow").classList.toggle("hidden", flow !== "use");
  el("settingsFlow").classList.toggle("hidden", flow !== "settings");
  if (flow === "use") showUseMode("search");
}

function showUseMode(mode) {
  el("searchMode").classList.toggle("hidden", mode !== "search");
  el("savedChatsMode").classList.toggle("hidden", mode !== "saved");
  el("showSearchMode").classList.toggle("secondary", mode !== "search");
  el("showSavedChatsMode").classList.toggle("secondary", mode !== "saved");
  hideContextFallback();
}

el("showSaveFlow").addEventListener("click", () => showFlow("save"));
el("showUseFlow").addEventListener("click", () => showFlow("use"));
el("showSettingsFlow").addEventListener("click", () => showFlow("settings"));
el("showSearchMode").addEventListener("click", () => showUseMode("search"));
el("showSavedChatsMode").addEventListener("click", () => showUseMode("saved"));
el("signIn").addEventListener("click", runSafely(signIn));
el("signUp").addEventListener("click", runSafely(signUp));
el("resetPassword").addEventListener("click", runSafely(resetPassword));
el("signOut").addEventListener("click", runSafely(signOut));
el("checkStatus").addEventListener("click", runSafely(checkStatus));
el("extractChat").addEventListener("click", runSafely(extractChat));
el("saveFullChat").addEventListener("click", runSafely(saveFullChatTranscript));
el("generateSuggestions").addEventListener("click", runSafely(generateSuggestions));
el("loadSavedChats").addEventListener("click", runSafely(loadSavedChats));
el("searchVault").addEventListener("click", runSafely(() => searchVault()));
el("copyContext").addEventListener("click", runSafely(copyContextText));

["supabaseUrl", "supabaseAnonKey", "email", "passphrase", "maxMemories", "defaultSource", "autoApprove"].forEach((id) => {
  controls[id].addEventListener("change", () => saveSettings());
});

document.addEventListener("click", (event) => {
  const saveIndex = event.target?.dataset?.saveSuggestion;
  const rejectIndex = event.target?.dataset?.rejectSuggestion;
  const renameChatIndex = event.target?.dataset?.renameChat;
  const selectChatIndex = event.target?.dataset?.selectChat;
  const useResultIndex = event.target?.dataset?.useResultIndex;
  if (saveIndex !== undefined) runSafely(() => saveSuggestion(Number(saveIndex)))();
  if (rejectIndex !== undefined) {
    state.suggestions.splice(Number(rejectIndex), 1);
    renderSuggestions();
  }
  if (renameChatIndex !== undefined) runSafely(() => renameSavedChat(Number(renameChatIndex)))();
  if (selectChatIndex !== undefined) selectSavedChat(Number(selectChatIndex));
  if (useResultIndex !== undefined) runSafely(() => useSearchResult(Number(useResultIndex)))();
});

async function loadSettings() {
  const settings = await syncGet(["supabaseUrl", "supabaseAnonKey", "email", "maxMemories", "defaultSource", "autoApprove"]);
  const local = await localGet(["supabaseSession", "vaultPassphrase"]);
  controls.supabaseUrl.value = productionConfig.supabaseUrl || settings.supabaseUrl || "";
  controls.supabaseAnonKey.value = productionConfig.supabaseAnonKey || settings.supabaseAnonKey || "";
  controls.email.value = settings.email || "";
  controls.maxMemories.value = settings.maxMemories || 5;
  controls.defaultSource.value = settings.defaultSource || "browser_extension";
  controls.autoApprove.checked = settings.autoApprove === undefined ? Boolean(productionConfig.autoApproveByDefault) : Boolean(settings.autoApprove);
  controls.passphrase.value = local.vaultPassphrase || "";
  if (productionConfig.supabaseUrl && productionConfig.supabaseAnonKey) {
    document.querySelectorAll(".provider-setting").forEach((node) => node.classList.add("hidden"));
  }
  state.session = local.supabaseSession || null;
  await checkStatus();
}

loadSettings();
