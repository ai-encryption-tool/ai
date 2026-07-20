import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  Check,
  Clock3,
  Download,
  Edit3,
  FileUp,
  KeyRound,
  Moon,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "";
const memoryTypes = ["project", "person", "preference", "skill", "goal", "decision", "fact", "note", "writing_style", "private_note"];
const sources = ["manual", "chatgpt", "claude", "cursor", "browser_extension", "import_center", "api"];
const navItems = [
  ["overview", "Overview"],
  ["ask-memory", "Ask Memory"],
  ["suggestions", "Suggestions"],
  ["timeline", "Timeline"],
  ["imports", "Imports"],
  ["extension", "Extension"],
  ["landing", "Positioning"],
];

export default function ProductApp() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("memoryVaultApiKey") || "");
  const [password, setPassword] = useState("");
  const [route, setRoute] = useState(window.location.pathname.replace("/", "") || "overview");
  const [memories, setMemories] = useState([]);
  const [query, setQuery] = useState("");
  const [includePending, setIncludePending] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedMemory, setSelectedMemory] = useState(null);
  const [message, setMessage] = useState("");
  const [dark, setDark] = useState(localStorage.getItem("memoryVaultTheme") === "dark");
  const [tagFilter, setTagFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [askQuery, setAskQuery] = useState("What projects am I currently working on?");
  const [askResult, setAskResult] = useState(null);
  const [suggestText, setSuggestText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [extensionStatus, setExtensionStatus] = useState("");
  const [form, setForm] = useState(blankForm());

  const headers = useMemo(() => ({ "Content-Type": "application/json", "X-API-Key": apiKey }), [apiKey]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("memoryVaultTheme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname.replace("/", "") || "overview");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    loadMemories();
  }, [apiKey]);

  function navigate(nextRoute) {
    setRoute(nextRoute);
    window.history.pushState({}, "", `/${nextRoute === "overview" ? "" : nextRoute}`);
  }

  async function request(path, options = {}) {
    const requestHeaders = options.body instanceof FormData ? { "X-API-Key": apiKey, ...(options.headers || {}) } : { ...headers, ...(options.headers || {}) };
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: requestHeaders });
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
      setMemories(await request("/memories?include_pending=true"));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function searchMemories() {
    if (!query.trim()) return loadMemories();
    try {
      const params = new URLSearchParams({ q: query, include_pending: String(includePending) });
      setMemories(await request(`/memories/search?${params.toString()}`));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveMemory(event) {
    event.preventDefault();
    const payload = formPayload(form);
    try {
      if (editing) {
        await request(`/memories/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setMessage("Memory updated.");
      } else {
        await request("/memories", { method: "POST", body: JSON.stringify(payload) });
        setMessage("Memory created for review.");
      }
      setEditing(null);
      setForm(blankForm());
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
    if (selectedMemory?.id === memory.id) setSelectedMemory(null);
    loadMemories();
  }

  function startEdit(memory) {
    setEditing(memory);
    setForm({ ...memory, tags: memory.tags.join(", ") });
    navigate("overview");
  }

  async function askMemory(event) {
    event.preventDefault();
    const data = await request("/memory/ask", {
      method: "POST",
      body: JSON.stringify({ query: askQuery, limit: 8, include_pending: false }),
    });
    setAskResult(data);
  }

  async function extractSuggestions(event) {
    event.preventDefault();
    const data = await request("/memory/suggestions", {
      method: "POST",
      body: JSON.stringify({ text: suggestText, source: "manual" }),
    });
    setSuggestions(data.suggestions);
  }

  async function uploadSuggestionText(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSuggestText(await file.text());
    event.target.value = "";
  }

  async function approveSuggestion(suggestion) {
    const payload = { ...suggestion, approved: false };
    delete payload.reason;
    await request("/memories", { method: "POST", body: JSON.stringify(payload) });
    setSuggestions((items) => items.filter((item) => item !== suggestion));
    setMessage("Suggestion saved as pending memory.");
    loadMemories();
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const data = await request("/imports", { method: "POST", body: formData });
      setImportResult(data);
      setMessage(`${data.suggestions_created} pending memories imported.`);
      loadMemories();
    } catch (error) {
      setMessage(error.message);
    }
    event.target.value = "";
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

  async function testExtensionConnection() {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      setExtensionStatus(`Backend reachable: ${data.status}`);
    } catch (error) {
      setExtensionStatus(`Backend not reachable: ${error.message}`);
    }
  }

  const filteredMemories = memories.filter((memory) => {
    if (tagFilter && !memory.tags.some((tag) => tag.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
    if (typeFilter && memory.type !== typeFilter) return false;
    return true;
  });
  const stats = {
    total: memories.length,
    approved: memories.filter((memory) => memory.approved).length,
    pending: memories.filter((memory) => !memory.approved).length,
    types: new Set(memories.map((memory) => memory.type)).size,
  };

  if (!apiKey) {
    return (
      <main className="login-screen">
        <form className="login-panel" onSubmit={login}>
          <ShieldCheck size={34} />
          <h1>AI Memory Vault</h1>
          <p>Unlock your local memory dashboard.</p>
          <label>Local password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button type="submit"><KeyRound size={18} /> Login</button>
          {message && <span className="status">{message}</span>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>AI Memory Vault</h1>
          <p>Your AI memory. Usable everywhere.</p>
        </div>
        <div className="actions">
          <button onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button onClick={loadMemories} title="Refresh"><RefreshCw size={18} /></button>
          <button onClick={exportJson} title="Export"><Download size={18} /></button>
        </div>
      </header>

      <nav className="tabs">
        {navItems.map(([id, label]) => <button key={id} className={route === id ? "active" : ""} onClick={() => navigate(id)}>{label}</button>)}
      </nav>

      {route === "overview" && (
        <section className="workspace">
          <aside className="editor">
            <h2>{editing ? "Edit Memory" : "Add Memory"}</h2>
            <MemoryForm form={form} setForm={setForm} onSubmit={saveMemory} editing={editing} />
          </aside>
          <section className="memory-area">
            <Stats stats={stats} />
            <SearchFilters
              query={query}
              setQuery={setQuery}
              includePending={includePending}
              setIncludePending={setIncludePending}
              tagFilter={tagFilter}
              setTagFilter={setTagFilter}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              onSearch={searchMemories}
            />
            <MemoryList memories={filteredMemories} onApprove={setApproval} onEdit={startEdit} onDelete={remove} onSelect={setSelectedMemory} />
          </section>
        </section>
      )}
      {route === "ask-memory" && <AskMemory askQuery={askQuery} setAskQuery={setAskQuery} askResult={askResult} onAsk={askMemory} />}
      {route === "suggestions" && <Suggestions text={suggestText} setText={setSuggestText} suggestions={suggestions} setSuggestions={setSuggestions} onExtract={extractSuggestions} onUpload={uploadSuggestionText} onApprove={approveSuggestion} />}
      {route === "timeline" && <Timeline memories={memories} />}
      {route === "imports" && <Imports onImport={importFile} result={importResult} />}
      {route === "extension" && <ExtensionGuide status={extensionStatus} onTest={testExtensionConnection} />}
      {route === "landing" && <Landing />}

      {selectedMemory && <MemoryDetail memory={selectedMemory} onClose={() => setSelectedMemory(null)} onApprove={setApproval} />}
      {message && <button className="toast" onClick={() => setMessage("")}>{message}</button>}
    </main>
  );
}

function blankForm() {
  return { type: "preference", content: "", source: "manual", confidence: 0.8, approved: false, tags: "" };
}

function formPayload(form) {
  return { ...form, confidence: Number(form.confidence), tags: String(form.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean) };
}

function Stats({ stats }) {
  return (
    <div className="stats-grid">
      <Stat icon={<BarChart3 size={18} />} label="Total memories" value={stats.total} />
      <Stat icon={<Check size={18} />} label="Approved" value={stats.approved} />
      <Stat icon={<Clock3 size={18} />} label="Pending" value={stats.pending} />
      <Stat icon={<Sparkles size={18} />} label="Memory types" value={stats.types} />
    </div>
  );
}

function Stat({ icon, label, value }) {
  return <div className="stat">{icon}<span>{label}</span><strong>{value}</strong></div>;
}

function MemoryForm({ form, setForm, onSubmit, editing }) {
  return (
    <form onSubmit={onSubmit}>
      <label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{memoryTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>Content<textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} required /></label>
      <label>Source<select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>{sources.map((source) => <option key={source}>{source}</option>)}</select></label>
      <label>Confidence<input type="number" min="0" max="1" step="0.05" value={form.confidence} onChange={(event) => setForm({ ...form, confidence: event.target.value })} /></label>
      <label>Tags<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="work, project" /></label>
      <label className="check-row"><input type="checkbox" checked={form.approved} onChange={(event) => setForm({ ...form, approved: event.target.checked })} />Approved for retrieval</label>
      <button type="submit"><Plus size={18} /> {editing ? "Save" : "Create"}</button>
    </form>
  );
}

function SearchFilters(props) {
  return (
    <div className="searchbar">
      <Search size={18} />
      <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onSearch()} placeholder="Search approved memories" />
      <select value={props.typeFilter} onChange={(event) => props.setTypeFilter(event.target.value)}>
        <option value="">All types</option>
        {memoryTypes.map((type) => <option key={type}>{type}</option>)}
      </select>
      <input value={props.tagFilter} onChange={(event) => props.setTagFilter(event.target.value)} placeholder="Filter tag" />
      <label className="check-row compact"><input type="checkbox" checked={props.includePending} onChange={(event) => props.setIncludePending(event.target.checked)} />include pending</label>
      <button onClick={props.onSearch}>Search</button>
    </div>
  );
}

function MemoryList({ memories, onApprove, onEdit, onDelete, onSelect }) {
  return (
    <div className="memory-list">
      {memories.map((memory) => (
        <article className="memory-card" key={memory.id}>
          <div className="card-head">
            <span className={`pill ${memory.approved ? "approved" : "pending"}`}>{memory.approved ? "approved" : "pending"}</span>
            <span>{memory.type}</span>
            <span>{memory.source}</span>
            {memory.score !== undefined && <span>score {Number(memory.score).toFixed(2)}</span>}
          </div>
          <button className="unstyled" onClick={() => onSelect(memory)}>
            <p>{displayMemoryContent(memory)}</p>
          </button>
          {isTranscript(memory) && <div className="keywords">Full chat transcript stored. Open detail to view/copy full text.</div>}
          <div className="meta">confidence {memory.confidence} · {memory.tags.join(", ") || "no tags"} · updated {new Date(memory.updated_at).toLocaleDateString()}</div>
          {memory.matching_keywords?.length > 0 && <div className="keywords">Why: {memory.matching_keywords.join(", ")}</div>}
          <div className="card-actions">
            {!memory.approved && <button onClick={() => onApprove(memory, true)} title="Approve"><Check size={17} /></button>}
            {memory.approved && <button onClick={() => onApprove(memory, false)} title="Reject"><X size={17} /></button>}
            <button onClick={() => onEdit(memory)} title="Edit"><Edit3 size={17} /></button>
            <button onClick={() => onDelete(memory)} title="Delete"><Trash2 size={17} /></button>
          </div>
        </article>
      ))}
    </div>
  );
}

function AskMemory({ askQuery, setAskQuery, askResult, onAsk }) {
  return (
    <section className="page-grid">
      <form className="panel" onSubmit={onAsk}>
        <h2>Ask Memory</h2>
        <label>Question<textarea value={askQuery} onChange={(event) => setAskQuery(event.target.value)} /></label>
        <button type="submit"><Bot size={18} /> Ask</button>
      </form>
      <section className="panel">
        <h2>Generated Answer</h2>
        <p className="answer">{askResult?.answer || "Ask a question to synthesize an answer from approved memories."}</p>
      </section>
      <section className="panel wide">
        <h2>Retrieved Memories</h2>
        <MemoryList memories={askResult?.memories || []} onApprove={() => {}} onEdit={() => {}} onDelete={() => {}} onSelect={() => {}} />
      </section>
    </section>
  );
}

function Suggestions({ text, setText, suggestions, setSuggestions, onExtract, onUpload, onApprove }) {
  return (
    <section className="page-grid">
      <form className="panel" onSubmit={onExtract}>
        <h2>Memory Suggestions</h2>
        <label>Paste text<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="I am building AI Memory Vault using FastAPI and React." /></label>
        <div className="inline-actions">
          <button type="submit"><Sparkles size={18} /> Extract</button>
          <label className="icon-button"><FileUp size={18} /> Upload txt/md<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={onUpload} /></label>
        </div>
      </form>
      <section className="panel wide">
        <h2>Suggested Memories</h2>
        <div className="memory-list">
          {suggestions.map((suggestion, index) => (
            <article className="memory-card" key={`${suggestion.content}-${index}`}>
              <div className="card-head"><span className="pill pending">pending</span><span>{suggestion.type}</span><span>{suggestion.source}</span></div>
              <textarea value={suggestion.content} onChange={(event) => setSuggestions(suggestions.map((item, i) => i === index ? { ...item, content: event.target.value } : item))} />
              <div className="meta">{suggestion.reason} · confidence {suggestion.confidence}</div>
              <div className="card-actions">
                <button onClick={() => onApprove(suggestion)}><Check size={17} /> Save pending</button>
                <button onClick={() => setSuggestions(suggestions.filter((_, i) => i !== index))}><X size={17} /> Reject</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function Timeline({ memories }) {
  const groups = memories.reduce((acc, memory) => {
    const date = new Date(memory.created_at);
    const month = date.toLocaleString(undefined, { month: "long", year: "numeric" });
    acc[month] ||= [];
    acc[month].push(memory);
    return acc;
  }, {});
  return (
    <section className="panel">
      <h2>Memory Timeline</h2>
      <div className="timeline">
        {Object.entries(groups).map(([month, items]) => (
          <div key={month} className="timeline-group">
            <h3>{month}</h3>
            {items.map((memory) => <div className="timeline-item" key={memory.id}><span>{new Date(memory.created_at).getDate()}</span><p>{displayMemoryContent(memory)}</p></div>)}
          </div>
        ))}
      </div>
    </section>
  );
}

function Imports({ onImport, result }) {
  return (
    <section className="page-grid">
      <section className="panel">
        <h2>Import Center</h2>
        <p>Upload ChatGPT export ZIP, Claude export ZIP, JSON exports, txt, or md. Imported memories are always pending.</p>
        <label className="dropzone"><Upload size={28} />Upload export<input type="file" accept=".zip,.json,.txt,.md,application/zip,application/json" onChange={onImport} /></label>
      </section>
      <section className="panel">
        <h2>Last Import</h2>
        {result ? <p>{result.detected_format}: {result.suggestions_created} pending memories created.</p> : <p>No import run yet.</p>}
      </section>
    </section>
  );
}

function ExtensionGuide({ status, onTest }) {
  return (
    <section className="page-grid">
      <section className="panel">
        <h2>Chrome Extension</h2>
        <p>The extension is now the main product surface: save memory from AI chats and insert Vault context into new prompts.</p>
        <button onClick={onTest}>Test backend connection</button>
        <a className="icon-button" href="https://chromewebstore.google.com/detail/mhnjllipemabeoenghgbanpckhnbddcm?utm_source=item-share-cb" target="_blank" rel="noreferrer">Install from Chrome Web Store</a>
        {status && <p className="answer">{status}</p>}
      </section>
      <section className="panel">
        <h2>Install</h2>
        <ol>
          <li>Install AI Memory Vault from the Chrome Web Store.</li>
          <li>Sign in with the same account as the dashboard.</li>
          <li>Use the same vault passphrase you use in the dashboard.</li>
          <li>Open ChatGPT, Claude, Gemini, or Copilot.</li>
        </ol>
      </section>
      <section className="panel">
        <h2>Use It</h2>
        <ol>
          <li>Click the extension icon.</li>
          <li>Check backend status.</li>
          <li>Preview current chat before sending anything.</li>
          <li>Generate memory suggestions.</li>
          <li>Edit, reject, or save each suggestion.</li>
          <li>Use Vault Context to insert approved memories into the chat input.</li>
        </ol>
      </section>
      <section className="panel">
        <h2>Troubleshooting</h2>
        <p>If the extension cannot connect, reinstall the Chrome Web Store version and sign in again. The extension does not auto-send messages. It only inserts context for you to review.</p>
      </section>
    </section>
  );
}

function Landing() {
  return (
    <section className="landing">
      <div className="hero">
        <h1>Your AI Memory.<br />Usable Everywhere.</h1>
        <p>Keep your memories outside ChatGPT, Claude, Cursor, and other AI tools. Store once. Use everywhere.</p>
      </div>
      <div className="comparison">
        <div><h2>ChatGPT Memory</h2><p>Works in ChatGPT</p></div>
        <div><h2>AI Memory Vault</h2><p>Works with any AI</p><p>User-owned</p><p>Exportable</p><p>Self-hostable</p></div>
      </div>
    </section>
  );
}

function MemoryDetail({ memory, onClose, onApprove }) {
  return (
    <div className="modal-backdrop">
      <article className="modal">
        <button className="close" onClick={onClose}><X size={18} /></button>
        <h2>Memory Detail</h2>
        <p>{memory.content}</p>
        <dl>
          <dt>Source</dt><dd>{memory.source}</dd>
          <dt>Created</dt><dd>{new Date(memory.created_at).toLocaleString()}</dd>
          <dt>Updated</dt><dd>{new Date(memory.updated_at).toLocaleString()}</dd>
          <dt>Confidence</dt><dd>{memory.confidence}</dd>
          <dt>Status</dt><dd>{memory.approved ? "Approved" : "Pending"}</dd>
          <dt>Tags</dt><dd>{memory.tags.join(", ") || "No tags"}</dd>
        </dl>
        <button onClick={() => onApprove(memory, !memory.approved)}>{memory.approved ? "Reject" : "Approve"}</button>
      </article>
    </div>
  );
}

function isTranscript(memory) {
  return memory.tags?.includes("full-chat") || memory.tags?.includes("transcript") || memory.content?.startsWith("Full ");
}

function displayMemoryContent(memory) {
  if (!isTranscript(memory)) return memory.content;
  const firstLine = memory.content.split("\n")[0] || "Full chat transcript";
  return firstLine.replace(/^Full\s+/i, "").replace(/\s+chat transcript:\s*/i, " chat: ");
}
