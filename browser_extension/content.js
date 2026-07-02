const SITE_CONFIG = {
  chatgpt: {
    host: "chatgpt.com",
    messageSelectors: ["[data-message-author-role]", "[data-testid*='conversation-turn']", "main article"],
    inputSelectors: ["#prompt-textarea", "textarea[data-id='root']", "main textarea", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"]
  },
  chatgptOld: {
    host: "chat.openai.com",
    messageSelectors: ["[data-message-author-role]", "[data-testid*='conversation-turn']", "main article"],
    inputSelectors: ["#prompt-textarea", "textarea[data-id='root']", "main textarea", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"]
  },
  claude: {
    host: "claude.ai",
    messageSelectors: ["[data-testid*='message']", "main [class*='font-']", "main .contents", "main"],
    inputSelectors: ["div[contenteditable='true']", "[role='textbox']", "textarea"]
  },
  gemini: {
    host: "gemini.google.com",
    messageSelectors: ["message-content", ".conversation-container", "main [role='listitem']", "main"],
    inputSelectors: ["rich-textarea div[contenteditable='true']", "[contenteditable='true']", "[role='textbox']", "textarea"]
  },
  copilot: {
    host: "copilot.microsoft.com",
    messageSelectors: ["[data-content='conversation']", "[class*='message']", "main [role='article']", "main"],
    inputSelectors: ["textarea", "[contenteditable='true']", "[role='textbox']"]
  }
};

function currentConfig() {
  return Object.values(SITE_CONFIG).find((config) => location.hostname.includes(config.host)) || {
    messageSelectors: [
      "[data-message-author-role]",
      "main article",
      "main [role='article']",
      "main .markdown",
      "[class*='message']",
      "[class*='chat']",
      "main"
    ],
    inputSelectors: [
      "textarea",
      "input[type='text']",
      "input:not([type])",
      "[contenteditable='true']",
      "[role='textbox']"
    ]
  };
}

function cleanText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isInsideAnotherCandidate(node, selector) {
  let parent = node.parentElement;
  while (parent) {
    if (parent.matches?.(selector)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function roleLabel(node) {
  const role = node.getAttribute?.("data-message-author-role");
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  if (role) return role;
  const text = cleanText(node.innerText || node.textContent || "");
  if (/^(you|user)\b/i.test(text)) return "User";
  if (/^(chatgpt|claude|gemini|copilot|assistant)\b/i.test(text)) return "Assistant";
  return "";
}

function collectBySelectors(selectors) {
  const chunks = [];
  const seen = new Set();

  for (const selector of selectors) {
    const nodes = [...document.querySelectorAll(selector)].filter((node) => !isInsideAnotherCandidate(node, selector));
    for (const node of nodes) {
      const text = cleanText(node.innerText || node.textContent || "");
      if (text.length < 2) continue;
      const normalized = text.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const label = roleLabel(node);
      chunks.push(label ? `${label}:\n${text}` : text);
    }
  }

  return chunks;
}

function collectChatGptMessages() {
  const messageNodes = [...document.querySelectorAll("[data-message-author-role]")];
  const chunks = [];
  const seen = new Set();

  for (const node of messageNodes) {
    const role = roleLabel(node);
    const text = cleanText(node.innerText || node.textContent || "");
    if (!text) continue;
    const key = `${role}:${text}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.push(`${role || "Message"}:\n${text}`);
  }

  return chunks;
}

function collectGenericConversation() {
  const selectors = currentConfig().messageSelectors;
  const chunks = collectBySelectors(selectors);
  if (chunks.length > 1) return chunks;

  const main = document.querySelector("main") || document.body;
  const wholeText = cleanText(main?.innerText || main?.textContent || "");
  return wholeText ? [wholeText] : [];
}

function extractConversationText() {
  const isChatGpt = location.hostname.includes("chatgpt.com") || location.hostname.includes("chat.openai.com");
  const chunks = isChatGpt ? collectChatGptMessages() : collectGenericConversation();
  const text = chunks.join("\n\n---\n\n");
  return {
    url: location.href,
    title: document.title,
    message_count: chunks.length,
    text: text.slice(0, 300000)
  };
}

function findPromptInput() {
  for (const selector of currentConfig().inputSelectors) {
    const candidates = [...document.querySelectorAll(selector)].filter((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 80 && rect.height > 20;
    });
    if (candidates.length > 0) return candidates[candidates.length - 1];
  }
  return null;
}

function getPromptText() {
  const input = findPromptInput();
  if (!input) return { ok: false, text: "", error: "No chat input found." };
  return { ok: true, text: input.value ?? input.innerText ?? input.textContent ?? "" };
}

function insertPromptText(text) {
  const input = findPromptInput();
  if (!input) return { ok: false, error: "No chat input found." };
  input.focus();
  if ("value" in input) {
    input.value = text;
  } else {
    input.textContent = text;
  }
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

function attachTextFile(filename, text) {
  const input = [...document.querySelectorAll("input[type='file']")].pop();
  if (!input) return { ok: false, error: "No file upload input found on this page." };
  const file = new File([text], filename || "ai-memory-vault-context.txt", { type: "text/plain" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "EXTRACT_CONVERSATION") {
    sendResponse(extractConversationText());
  }
  if (message?.type === "GET_PROMPT") {
    sendResponse(getPromptText());
  }
  if (message?.type === "INSERT_PROMPT") {
    sendResponse(insertPromptText(message.text || ""));
  }
  if (message?.type === "ATTACH_TEXT_FILE") {
    sendResponse(attachTextFile(message.filename, message.text || ""));
  }
});
