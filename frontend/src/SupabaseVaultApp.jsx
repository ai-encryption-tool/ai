import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  Clock3,
  Coffee,
  Download,
  Edit3,
  ExternalLink,
  FileUp,
  Github,
  HeartHandshake,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { decryptJson, encryptJson } from "./cryptoVault.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const memoryTypes = ["project", "person", "preference", "skill", "goal", "decision", "fact", "note", "writing_style", "private_note"];
const sources = ["manual", "chatgpt", "claude", "cursor", "browser_extension", "import_center", "api"];
const githubRepoUrl = "https://github.com/ai-encryption-tool/ai";
const chromeWebStoreUrl = "https://chromewebstore.google.com/detail/mhnjllipemabeoenghgbanpckhnbddcm?utm_source=item-share-cb";
const extensionZipUrl = "/downloads/ai-memory-vault-extension-ready.zip";
const supportUrl = "https://ko-fi.com/aimemoryvault";
const supportTiers = [
  { label: "EUR5 Coffee", icon: Coffee, url: supportUrl },
  { label: "EUR20 Sponsor", icon: Rocket, url: supportUrl },
  { label: "EUR100 Company Sponsor", icon: Trophy, url: supportUrl },
];
const navItems = [
  ["overview", "Overview"],
  ["suggestions", "Suggestions"],
  ["timeline", "Timeline"],
  ["imports", "Imports"],
  ["extension", "Extension"],
];

function blankForm() {
  return { type: "preference", content: "", source: "manual", confidence: 0.8, approved: false, tags: "" };
}

function toPayload(form) {
  return {
    type: form.type,
    title: form.title,
    content: form.content,
    source: form.source,
    confidence: Number(form.confidence),
    approved: Boolean(form.approved),
    tags: String(form.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

function localSuggestions(text, source = "manual") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  const chunks = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 45 && item.length < 900)
    .slice(0, 12);
  return (chunks.length ? chunks : [cleaned.slice(0, 1200)]).filter(Boolean).map((content) => ({
    type: /\b(prefer|like|want|usually|always)\b/i.test(content) ? "preference" : "note",
    content,
    source,
    confidence: 0.65,
    approved: false,
    tags: ["suggested", source],
    reason: "Suggested locally before encryption.",
  }));
}

export default function SupabaseVaultApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState(sessionStorage.getItem("vaultPassphrase") || "");
  const [route, setRoute] = useState(window.location.pathname.replace("/", "") || "overview");
  const [form, setForm] = useState(blankForm());
  const [memories, setMemories] = useState([]);
  const [vaultStats, setVaultStats] = useState({ encrypted: 0, decrypted: 0, failed: 0 });
  const [query, setQuery] = useState("");
  const [includePending, setIncludePending] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [suggestText, setSuggestText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return memories.filter((memory) => {
      if (!includePending && !memory.approved) return false;
      if (typeFilter && memory.type !== typeFilter) return false;
      if (tagFilter && !(memory.tags || []).some((tag) => tag.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
      if (!needle) return true;
      return [
      memory.title,
      memory.content,
      memory.type,
      memory.source,
      ...(memory.tags || []),
    ].join(" ").toLowerCase().includes(needle);
    });
  }, [memories, query, includePending, typeFilter, tagFilter]);

  const stats = {
    total: memories.length,
    approved: memories.filter((memory) => memory.approved).length,
    pending: memories.filter((memory) => !memory.approved).length,
    types: new Set(memories.map((memory) => memory.type)).size,
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        clearLocalSession();
        setMessage("Your saved login expired. Please sign in again.");
        return;
      }
      setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfile(null);
      setMemories([]);
      setVaultStats({ encrypted: 0, decrypted: 0, failed: 0 });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function clearLocalSession() {
    sessionStorage.removeItem("vaultPassphrase");
    Object.keys(localStorage)
      .filter((key) => key.startsWith("sb-") || key.includes("supabase"))
      .forEach((key) => localStorage.removeItem(key));
    setSession(null);
    setProfile(null);
    setMemories([]);
    setVaultStats({ encrypted: 0, decrypted: 0, failed: 0 });
  }

  useEffect(() => {
    if (!session) return;
    loadProfile();
  }, [session]);

  useEffect(() => {
    if (!session || profile?.status !== "approved" || !passphrase) return;
    sessionStorage.setItem("vaultPassphrase", passphrase);
    loadMemories();
  }, [session, profile?.status, passphrase]);

  async function loadProfile() {
    setProfileLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").single();
    if (error) {
      setMessage(error.message);
      setProfileLoading(false);
      return;
    }
    setProfile(data);
    setProfileLoading(false);
  }

  async function submitAuth(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const action = authMode === "signup"
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });
    const { error } = await action;
    setLoading(false);
    if (error) setMessage(error.message);
    else setMessage(authMode === "signup" ? "Account created. You can sign in now." : "Signed in.");
  }

  async function signOut() {
    sessionStorage.removeItem("vaultPassphrase");
    setPassphrase("");
    const { error } = await supabase.auth.signOut();
    if (error) clearLocalSession();
  }

  async function loadMemories() {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("memories").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      const opened = [];
      let failed = 0;
      let lastFailure = "";
      for (const row of data || []) {
        try {
          const payload = await decryptJson(row, passphrase);
          opened.push({ id: row.id, created_at: row.created_at, updated_at: row.updated_at, ...payload });
        } catch (error) {
          lastFailure = error.message;
          failed += 1;
        }
      }
      setVaultStats({ encrypted: data?.length || 0, decrypted: opened.length, failed });
      setMemories(opened);
      if (!data?.length) {
        setMessage("Supabase returned 0 memory rows for this signed-in user.");
      } else if (failed) {
        setMessage(lastFailure?.includes("Web Crypto")
          ? lastFailure
          : `Found ${data.length} encrypted rows. Decrypted ${opened.length}; ${failed} failed. Check the exact passphrase used when saving.`);
      } else {
        setMessage(`Loaded ${opened.length} encrypted memories.`);
      }
    } catch (error) {
      setVaultStats({ encrypted: 0, decrypted: 0, failed: 0 });
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveMemory(event) {
    event.preventDefault();
    try {
      setLoading(true);
      const encrypted = await encryptJson(toPayload(form), passphrase);
      const { error } = await supabase.from("memories").insert(encrypted);
      if (error) throw error;
      setForm(blankForm());
      await loadMemories();
      setMessage("Encrypted memory saved.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function navigate(nextRoute) {
    setRoute(nextRoute);
    window.history.pushState({}, "", `/${nextRoute === "overview" ? "" : nextRoute}`);
  }

  function extractSuggestions(event) {
    event.preventDefault();
    setSuggestions(localSuggestions(suggestText, "manual"));
    setMessage("Suggestions generated locally. Review before encrypted save.");
  }

  async function uploadSuggestionText(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSuggestText(await file.text());
    event.target.value = "";
  }

  async function approveSuggestion(suggestion) {
    try {
      setLoading(true);
      const payload = { ...suggestion, approved: false };
      delete payload.reason;
      const encrypted = await encryptJson(payload, passphrase);
      const { error } = await supabase.from("memories").insert(encrypted);
      if (error) throw error;
      setSuggestions((items) => items.filter((item) => item !== suggestion));
      await loadMemories();
      setMessage("Suggestion encrypted and saved as pending.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const text = await file.text();
      let imported = [];
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        imported = Array.isArray(parsed) ? parsed : parsed.memories || [];
      } else {
        imported = localSuggestions(text, "import_center").map(({ reason, ...memory }) => memory);
      }
      const normalized = imported.filter((item) => item?.content).map((item) => ({
        ...blankForm(),
        ...item,
        approved: false,
        tags: Array.isArray(item.tags) ? item.tags : [],
      }));
      for (const memory of normalized) {
        const encrypted = await encryptJson(toPayload(memory), passphrase);
        const { error } = await supabase.from("memories").insert(encrypted);
        if (error) throw error;
      }
      setImportResult({ detected_format: file.name.split(".").pop() || "text", suggestions_created: normalized.length });
      await loadMemories();
      setMessage(`${normalized.length} encrypted pending memories imported.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  async function deleteMemory(memory) {
    const { error } = await supabase.from("memories").delete().eq("id", memory.id);
    if (error) setMessage(error.message);
    else setMemories((items) => items.filter((item) => item.id !== memory.id));
  }

  async function setApproval(memory, approved) {
    try {
      setLoading(true);
      const payload = {
        type: memory.type,
        title: memory.title,
        content: memory.content,
        source: memory.source,
        confidence: memory.confidence,
        approved,
        tags: memory.tags || [],
      };
      const encrypted = await encryptJson(payload, passphrase);
      const { error } = await supabase.from("memories").update(encrypted).eq("id", memory.id);
      if (error) throw error;
      setMemories((items) => items.map((item) => item.id === memory.id ? { ...item, approved } : item));
      setMessage(approved ? "Memory approved for retrieval." : "Memory marked pending.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(memories, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ai-memory-vault-decrypted-export.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <ShieldCheck size={34} />
          <h1>Supabase is not configured</h1>
          <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the frontend.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="login-screen">
        <section className="login-layout">
          <aside className="login-panel login-intro">
            <ShieldCheck size={34} />
            <h1>AI Memory Vault</h1>
            <p>Use one encrypted memory vault across the web dashboard and AI chat tools.</p>
            <div className="install-card">
              <strong>Use the browser extension</strong>
              <p>Install from the Chrome Web Store, then sign in with the same account and vault passphrase.</p>
              <div className="install-actions">
                <a className="icon-button" href={chromeWebStoreUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={18} /> Install Chrome extension
                </a>
                <a className="secondary-button link-button" href={extensionZipUrl} target="_blank" rel="noreferrer">
                  <Download size={18} /> Download ZIP
                </a>
              </div>
            </div>
            <ol className="install-steps">
              <li>Create an account or sign in here.</li>
              <li>Install the extension from Chrome Web Store.</li>
              <li>Open ChatGPT, Claude, Gemini, or Copilot.</li>
              <li>Click the AI Memory Vault extension.</li>
              <li>Use the same account and vault passphrase.</li>
            </ol>
            <a className="secondary-link" href={githubRepoUrl} target="_blank" rel="noreferrer">View project on GitHub</a>
          </aside>

          <form className="login-panel" onSubmit={submitAuth}>
            {authMode === "signup" ? <UserPlus size={34} /> : <KeyRound size={34} />}
            <h1>{authMode === "signup" ? "Create Account" : "Sign In"}</h1>
            <p>{authMode === "signup" ? "Create your encrypted vault account." : "Sign in to your encrypted vault."}</p>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
            <button type="submit" disabled={loading}><KeyRound size={18} /> {authMode === "signup" ? "Sign up" : "Sign in"}</button>
            <button type="button" className="secondary-button" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>
              {authMode === "signup" ? "I already have an account" : "Create an account"}
            </button>
            <button type="button" className="secondary-button" onClick={() => { clearLocalSession(); setMessage("Local saved login cleared. Sign in again."); }}>
              Reset saved login
            </button>
            {message && <span className="status">{message}</span>}
          </form>
        </section>
      </main>
    );
  }

  if (!profile || profileLoading) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <ShieldCheck size={34} />
          <h1>Loading Vault</h1>
          <p>Checking your approved account status...</p>
          {message && <span className="status">{message}</span>}
        </section>
      </main>
    );
  }

  if (profile.status !== "approved") {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <Lock size={34} />
          <h1>Account Not Active</h1>
          <p>Your account status is <strong>{profile?.status || "pending"}</strong>. Contact support if this looks wrong.</p>
          <button onClick={signOut}><LogOut size={18} /> Sign out</button>
          {message && <span className="status">{message}</span>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>AI Memory Vault</h1>
          <p>{session.user.email} | {profile?.status} | encrypted rows {vaultStats.encrypted}, decrypted {vaultStats.decrypted}, failed {vaultStats.failed}</p>
        </div>
        <div className="actions">
          <div className="support-menu">
            <button
              aria-expanded={supportOpen}
              aria-haspopup="true"
              onClick={() => setSupportOpen((open) => !open)}
              title="Support development"
            >
              <HeartHandshake size={18} /> Support
            </button>
            {supportOpen && (
              <div className="support-popover">
                <strong>Support Development</strong>
                <a href={githubRepoUrl} target="_blank" rel="noreferrer" onClick={() => setSupportOpen(false)}>
                  <Github size={16} /> Star on GitHub
                </a>
                <a href={supportUrl} target="_blank" rel="noreferrer" onClick={() => setSupportOpen(false)}>
                  <Coffee size={16} /> Buy me a coffee
                </a>
                <div className="support-tiers">
                  {supportTiers.map(({ label, icon: Icon, url }) => (
                    <a key={label} href={url} target="_blank" rel="noreferrer" onClick={() => setSupportOpen(false)}>
                      <Icon size={16} /> {label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={loadMemories} title="Refresh"><RefreshCw size={18} /></button>
          <button onClick={exportJson} title="Export decrypted JSON"><Download size={18} /></button>
          <button onClick={signOut} title="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

      <nav className="tabs">
        {navItems.map(([id, label]) => <button key={id} className={route === id ? "active" : ""} onClick={() => navigate(id)}>{label}</button>)}
      </nav>

      {route === "overview" && (
        <section className="workspace">
          <aside className="editor">
            <h2>Encryption</h2>
            <label>Vault passphrase<input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Never sent to Supabase" /></label>
            <p className="muted-note">Do not lose this passphrase. Without it, nobody can decrypt your memories, including the admin.</p>
            <h2>Add Memory</h2>
            <MemoryForm form={form} setForm={setForm} onSubmit={saveMemory} loading={loading} passphrase={passphrase} />
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
              onSearch={loadMemories}
            />
            <MemoryList memories={filtered} onApprove={setApproval} onDelete={deleteMemory} />
          </section>
        </section>
      )}
      {route === "suggestions" && <Suggestions text={suggestText} setText={setSuggestText} suggestions={suggestions} setSuggestions={setSuggestions} onExtract={extractSuggestions} onUpload={uploadSuggestionText} onApprove={approveSuggestion} />}
      {route === "timeline" && <Timeline memories={memories} />}
      {route === "imports" && <Imports onImport={importFile} result={importResult} />}
      {route === "extension" && <ExtensionGuide />}
      {message && <button className="toast" onClick={() => setMessage("")}>{message}</button>}
    </main>
  );
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

function MemoryForm({ form, setForm, onSubmit, loading, passphrase }) {
  return (
    <form onSubmit={onSubmit}>
      <label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{memoryTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>Content<textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} required /></label>
      <label>Source<select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>{sources.map((source) => <option key={source}>{source}</option>)}</select></label>
      <label>Confidence<input type="number" min="0" max="1" step="0.05" value={form.confidence} onChange={(event) => setForm({ ...form, confidence: event.target.value })} /></label>
      <label>Tags<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="work, project" /></label>
      <label className="check-row"><input type="checkbox" checked={form.approved} onChange={(event) => setForm({ ...form, approved: event.target.checked })} />Approved for retrieval</label>
      <button type="submit" disabled={loading || !passphrase}><Plus size={18} /> Save encrypted</button>
    </form>
  );
}

function SearchFilters(props) {
  return (
    <div className="searchbar">
      <Search size={18} />
      <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search decrypted memories locally" />
      <select value={props.typeFilter} onChange={(event) => props.setTypeFilter(event.target.value)}>
        <option value="">All types</option>
        {memoryTypes.map((type) => <option key={type}>{type}</option>)}
      </select>
      <input value={props.tagFilter} onChange={(event) => props.setTagFilter(event.target.value)} placeholder="Filter tag" />
      <label className="check-row compact"><input type="checkbox" checked={props.includePending} onChange={(event) => props.setIncludePending(event.target.checked)} />include pending</label>
      <button onClick={props.onSearch}>Reload</button>
    </div>
  );
}

function MemoryList({ memories, onApprove, onDelete }) {
  return (
    <div className="memory-list">
      {memories.map((memory) => (
        <article className="memory-card" key={memory.id}>
          <div className="card-head">
            <span className={`pill ${memory.approved ? "approved" : "pending"}`}>{memory.approved ? "approved" : "pending"}</span>
            <span>{memory.type}</span>
            <span>{memory.source}</span>
          </div>
          <p>{displayMemoryContent(memory)}</p>
          <div className="meta">confidence {memory.confidence} | {(memory.tags || []).join(", ") || "no tags"} | updated {new Date(memory.updated_at).toLocaleDateString()}</div>
          <div className="card-actions">
            {!memory.approved && <button onClick={() => onApprove(memory, true)} title="Approve"><Check size={17} /> Approve</button>}
            {memory.approved && <button onClick={() => onApprove(memory, false)} title="Mark pending">Pending</button>}
            <button onClick={() => onDelete(memory)} title="Delete"><Trash2 size={17} /></button>
          </div>
        </article>
      ))}
      {!memories.length && <p className="muted-note">No decrypted memories loaded.</p>}
    </div>
  );
}

function Suggestions({ text, setText, suggestions, setSuggestions, onExtract, onUpload, onApprove }) {
  return (
    <section className="page-grid">
      <form className="panel" onSubmit={onExtract}>
        <h2>Memory Suggestions</h2>
        <label>Paste text<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste chat text. Suggestions are generated locally." /></label>
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
              <div className="meta">{suggestion.reason} | confidence {suggestion.confidence}</div>
              <div className="card-actions">
                <button onClick={() => onApprove(suggestion)}><Check size={17} /> Save encrypted</button>
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
    const month = new Date(memory.created_at).toLocaleString(undefined, { month: "long", year: "numeric" });
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
        <p>Upload decrypted vault JSON, txt, or md. Imported memories are encrypted in your browser and saved as pending.</p>
        <label className="dropzone"><Upload size={28} />Upload export<input type="file" accept=".json,.txt,.md,application/json,text/plain,text/markdown" onChange={onImport} /></label>
      </section>
      <section className="panel">
        <h2>Last Import</h2>
        {result ? <p>{result.detected_format}: {result.suggestions_created} encrypted pending memories created.</p> : <p>No import run yet.</p>}
      </section>
    </section>
  );
}

function ExtensionGuide() {
  return (
    <section className="page-grid">
      <section className="panel">
        <h2>Chrome Extension</h2>
        <p>Use the extension with the same Supabase account and the same vault passphrase. Extension saves are encrypted before upload.</p>
        <div className="inline-actions">
          <a className="icon-button" href={chromeWebStoreUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Install from Chrome Web Store</a>
          <a className="secondary-button link-button" href={githubRepoUrl} target="_blank" rel="noreferrer"><Github size={18} /> View GitHub</a>
        </div>
      </section>
      <section className="panel">
        <h2>Use It</h2>
        <ol>
          <li>Install AI Memory Vault from the Chrome Web Store.</li>
          <li>Open a supported AI chat page.</li>
          <li>Sign in with the same account you use here.</li>
          <li>Enter the same vault passphrase.</li>
          <li>Save memory or use vault context.</li>
        </ol>
      </section>
    </section>
  );
}

function displayMemoryContent(memory) {
  if (!(memory.tags || []).includes("full-chat") && !(memory.tags || []).includes("transcript")) return memory.content;
  if (memory.title) return memory.title;
  return ((memory.content || "").split("\n")[0] || "Saved chat")
    .replace(/^Full\s+\w+\s+chat transcript:\s*/i, "")
    .replace(/^Saved chat:\s*/i, "")
    .trim() || "Saved chat";
}
