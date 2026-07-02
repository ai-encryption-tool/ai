import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  Download,
  Edit3,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import "./styles.css";
import ProductApp from "./ProductApp.jsx";
import SupabaseVaultApp from "./SupabaseVaultApp.jsx";

const API_URL = import.meta.env.VITE_API_URL || "";
const memoryTypes = ["preference", "project", "person", "goal", "decision", "writing_style", "private_note"];
const sources = ["manual", "chatgpt", "claude", "cursor", "api"];

function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("memoryVaultApiKey") || "");
  const [password, setPassword] = useState("");
  const [memories, setMemories] = useState([]);
  const [query, setQuery] = useState("");
  const [includePending, setIncludePending] = useState(false);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    type: "preference",
    content: "",
    source: "manual",
    confidence: 0.8,
    approved: false,
    tags: "",
  });

  const headers = useMemo(() => ({ "Content-Type": "application/json", "X-API-Key": apiKey }), [apiKey]);

  async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `Request failed: ${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function login(event) {
    event.preventDefault();
    try {
      const data = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }).then((res) => {
        if (!res.ok) throw new Error("Invalid password");
        return res.json();
      });
      localStorage.setItem("memoryVaultApiKey", data.api_key);
      setApiKey(data.api_key);
      setMessage("Unlocked.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadMemories() {
    if (!apiKey) return;
    try {
      const data = await request("/memories?include_pending=true");
      setMemories(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function searchMemories() {
    if (!query.trim()) return loadMemories();
    try {
      const params = new URLSearchParams({ q: query, include_pending: String(includePending) });
      const data = await request(`/memories/search?${params.toString()}`);
      setMemories(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveMemory(event) {
    event.preventDefault();
    const payload = {
      ...form,
      confidence: Number(form.confidence),
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    try {
      if (editing) {
        await request(`/memories/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setMessage("Memory updated.");
      } else {
        await request("/memories", { method: "POST", body: JSON.stringify(payload) });
        setMessage("Memory created for review.");
      }
      setEditing(null);
      setForm({ type: "preference", content: "", source: "manual", confidence: 0.8, approved: false, tags: "" });
      loadMemories();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function setApproval(memory, approved) {
    await request(`/memories/${memory.id}/approval`, { method: "POST", body: JSON.stringify({ approved }) });
    loadMemories();
  }

  async function remove(memory) {
    await request(`/memories/${memory.id}`, { method: "DELETE" });
    loadMemories();
  }

  function startEdit(memory) {
    setEditing(memory);
    setForm({ ...memory, tags: memory.tags.join(", ") });
  }

  async function exportJson() {
    const data = await request("/memories/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ai-memory-vault-export.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (Array.isArray(parsed) && parsed.every((item) => item.id && item.created_at && item.updated_at)) {
        await request("/memories/import", { method: "POST", body: JSON.stringify(parsed) });
        setMessage("Memory export imported.");
      } else if (Array.isArray(parsed) && parsed.some((item) => item.mapping && item.title)) {
        const converted = convertChatGptExport(parsed);
        for (const memory of converted) {
          await request("/memories", { method: "POST", body: JSON.stringify(memory) });
        }
        setMessage(`${converted.length} ChatGPT conversations imported as pending memories.`);
      } else {
        throw new Error("Unsupported JSON file. Use a vault export or ChatGPT conversations.json.");
      }

      event.target.value = "";
      loadMemories();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function convertChatGptExport(conversations) {
    return conversations
      .map((conversation) => {
        const messages = Object.values(conversation.mapping || {})
          .map((node) => node.message)
          .filter(Boolean)
          .filter((message) => ["user", "assistant"].includes(message.author?.role))
          .map((message) => {
            const role = message.author.role === "user" ? "User" : "Assistant";
            const parts = message.content?.parts || [];
            const content = parts
              .filter((part) => typeof part === "string")
              .join("\n")
              .trim();
            return content ? `${role}: ${content}` : "";
          })
          .filter(Boolean);

        const title = conversation.title || "Untitled ChatGPT conversation";
        const content = [`ChatGPT conversation: ${title}`, ...messages].join("\n\n").slice(0, 12000);
        return {
          type: "private_note",
          content,
          source: "chatgpt",
          confidence: 0.6,
          approved: false,
          tags: ["chatgpt", "history"],
        };
      })
      .filter((memory) => memory.content.trim().length > 0);
  }

  useEffect(() => {
    loadMemories();
  }, [apiKey]);

  if (!apiKey) {
    return (
      <main className="login-screen">
        <form className="login-panel" onSubmit={login}>
          <ShieldCheck size={34} />
          <h1>AI Memory Vault</h1>
          <p>Unlock your local memory dashboard.</p>
          <label>
            Local password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit">
            <KeyRound size={18} /> Login
          </button>
          {message && <span className="status">{message}</span>}
        </form>
      </main>
    );
  }

  const pendingCount = memories.filter((memory) => !memory.approved).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>AI Memory Vault</h1>
          <p>One approved memory layer for many AI tools.</p>
        </div>
        <div className="actions">
          <button onClick={loadMemories} title="Refresh"><RefreshCw size={18} /></button>
          <button onClick={exportJson} title="Export"><Download size={18} /></button>
          <label className="icon-button" title="Import">
            <Upload size={18} />
            <input type="file" accept="application/json" onChange={importJson} />
          </label>
        </div>
      </header>

      <section className="workspace">
        <aside className="editor">
          <h2>{editing ? "Edit memory" : "Add memory"}</h2>
          <form onSubmit={saveMemory}>
            <label>
              Type
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                {memoryTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label>
              Content
              <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} required />
            </label>
            <label>
              Source
              <select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>
                {sources.map((source) => <option key={source}>{source}</option>)}
              </select>
            </label>
            <label>
              Confidence
              <input type="number" min="0" max="1" step="0.05" value={form.confidence} onChange={(event) => setForm({ ...form, confidence: event.target.value })} />
            </label>
            <label>
              Tags
              <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="work, personal" />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={form.approved} onChange={(event) => setForm({ ...form, approved: event.target.checked })} />
              Approved for retrieval
            </label>
            <button type="submit"><Plus size={18} /> {editing ? "Save" : "Create"}</button>
          </form>
        </aside>

        <section className="memory-area">
          <div className="searchbar">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && searchMemories()} placeholder="Search approved memories" />
            <label className="check-row compact">
              <input type="checkbox" checked={includePending} onChange={(event) => setIncludePending(event.target.checked)} />
              include pending
            </label>
            <button onClick={searchMemories}>Search</button>
          </div>

          <div className="summary-row">
            <strong>{memories.length}</strong> memories shown
            <span>{pendingCount} pending review</span>
          </div>

          <div className="memory-list">
            {memories.map((memory) => (
              <article className="memory-card" key={memory.id}>
                <div className="card-head">
                  <span className={`pill ${memory.approved ? "approved" : "pending"}`}>{memory.approved ? "approved" : "pending"}</span>
                  <span>{memory.type}</span>
                  {memory.score !== undefined && <span>{memory.score.toFixed(2)}</span>}
                </div>
                <p>{memory.content}</p>
                <div className="meta">{memory.source} · confidence {memory.confidence} · {memory.tags.join(", ") || "no tags"}</div>
                <div className="card-actions">
                  {!memory.approved && <button onClick={() => setApproval(memory, true)} title="Approve"><Check size={17} /></button>}
                  {memory.approved && <button onClick={() => setApproval(memory, false)} title="Reject"><X size={17} /></button>}
                  <button onClick={() => startEdit(memory)} title="Edit"><Edit3 size={17} /></button>
                  <button onClick={() => remove(memory)} title="Delete"><Trash2 size={17} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
      {message && <div className="toast">{message}</div>}
    </main>
  );
}

const storageMode = import.meta.env.VITE_STORAGE_MODE || "local";

createRoot(document.getElementById("root")).render(
  storageMode === "supabase" ? <SupabaseVaultApp /> : <ProductApp />,
);
