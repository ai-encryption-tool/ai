# AI Memory Vault

AI Memory Vault is a local-first personal AI memory layer. It stores memories that you approve, exposes them through a FastAPI API and an MCP server, and lets AI tools retrieve relevant context without sending your memory database to an external LLM.

Core idea: one memory, many AIs, owned by the user.

Product promise:

```text
ChatGPT has memory for ChatGPT.
AI Memory Vault gives you memory for every AI.
```

## Why this is different from ChatGPT or Claude memory

Hosted assistant memory is usually tied to one vendor account and controlled by that vendor's product surface. AI Memory Vault keeps the source of truth on your machine, uses explicit approval before memories are returned by default, and exposes the same memory layer to any compatible client through HTTP or MCP.

## What is included

- Backend API: Python, FastAPI, SQLite, local Qdrant client, `sentence-transformers/all-MiniLM-L6-v2`
- Web dashboard: React, Vite, Tailwind
- MCP server: Python MCP SDK, connects to the backend API
- Ask Memory retrieval synthesis page
- Memory Suggestions extraction pipeline
- Timeline
- Import Center for ChatGPT/Claude ZIP, JSON, txt, and md
- Chrome browser extension
- Docker Compose deployment for backend, frontend, and MCP server
- Basic API tests for create, search, approve, delete, export, and import

## Product workflows

```text
ChatGPT / Claude / Cursor / Browser extension / Import Center
-> Memory suggestions
-> User approves
-> MCP/API search
-> Any AI can retrieve context
```

Dashboard pages:

- `/` Overview, CRUD, stats, filters, provenance, detail modal
- `/ask-memory` ask a question and see retrieved memories plus generated answer
- `/suggestions` paste or upload text/markdown and extract memory candidates
- `/timeline` chronological memory timeline
- `/imports` upload ChatGPT/Claude exports or vault JSON
- `/landing` product positioning page

## Local setup

```bash
cp .env.example .env
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and log in with `LOCAL_PASSWORD` from `.env`.

If port `8080` is blocked on Windows, use:

```powershell
cd frontend
$env:VITE_API_URL="http://localhost:8000"
npm.cmd run dev -- --host 127.0.0.1 --port 8081
```

## Docker setup

```bash
cp .env.example .env
docker compose up --build
```

- Dashboard: `http://localhost:5173`
- API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

The first backend start can take time because the embedding model may be downloaded. Data is stored in the Docker volume `backend-data`.

## API examples

Set your key:

```bash
export API_KEY=dev-local-api-key-change-me
```

Health check:

```bash
curl http://localhost:8000/health
```

Create a pending memory:

```bash
curl -X POST http://localhost:8000/memories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"type":"preference","content":"I prefer concise technical summaries.","source":"api","confidence":0.9}'
```

Approve a memory:

```bash
curl -X POST http://localhost:8000/memories/MEMORY_ID/approval \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"approved":true}'
```

Search approved memories:

```bash
curl "http://localhost:8000/memories/search?q=technical%20summaries" \
  -H "X-API-Key: $API_KEY"
```

Search including pending memories for debugging:

```bash
curl "http://localhost:8000/memories/search?q=technical%20summaries&include_pending=true" \
  -H "X-API-Key: $API_KEY"
```

Export:

```bash
curl http://localhost:8000/memories/export -H "X-API-Key: $API_KEY" > memories.json
```

Import:

```bash
curl -X POST http://localhost:8000/memories/import \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  --data-binary @memories.json
```

## MCP usage

The MCP server exposes:

- `search_memory(query: string, include_pending: boolean)`
- `create_memory(content: string, type: string, source: string)`
- `list_memories()`
- `update_memory(id: string, content?: string, type?: string, confidence?: number)`
- `delete_memory(id: string)`
- `approve_memory(id: string)`
- `reject_memory(id: string)`
- `ask_memory(query: string)`

Run locally:

```bash
cd mcp_server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
$env:BACKEND_URL="http://localhost:8000"
$env:API_KEY="dev-local-api-key-change-me"
python server.py
```

Example MCP client config:

```json
{
  "mcpServers": {
    "ai-memory-vault": {
      "command": "python",
      "args": ["C:/path/to/AI Memory Vault/mcp_server/server.py"],
      "env": {
        "BACKEND_URL": "http://localhost:8000",
        "API_KEY": "dev-local-api-key-change-me"
      }
    }
  }
}
```

Memories created through MCP are pending by default. Approve them in the dashboard before they are returned by normal search.

More MCP client setup examples are in [`docs/MCP_SETUP.md`](docs/MCP_SETUP.md).

## Browser extension

Chrome first:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose `browser_extension/`.
5. Open ChatGPT, Claude, Gemini, or Copilot.
6. Click the extension.
7. Use one of the core workflows:
   - Preview current chat -> Save full chat transcript
   - Preview current chat -> Generate memory suggestions -> Save pending or approved
   - Search Vault -> Select memories -> Insert context
   - Type a prompt -> Use Vault Context

Backend URL in the extension can be:

```text
http://localhost:8000
```

That is the direct FastAPI backend. Opening `http://localhost:8000/` in a browser shows API status, while API docs live at `http://localhost:8000/docs`.

During local frontend development, this also works:

```text
http://localhost:8081
```

The Vite dashboard proxies `/health`, `/memory`, `/memories`, `/auth`, and `/imports` to the backend.

The extension does not scrape in the background and never auto-sends messages. It only captures or inserts text when the user clicks.

Extension trust model:

- Local backend only
- No data sent to external LLM APIs
- User previews before saving
- Extension-created memories are pending unless auto-approve is explicitly enabled
- Full chat transcripts can be saved as one memory when conversation continuity matters

Supported sites:

- `chatgpt.com`
- `claude.ai`
- `gemini.google.com`
- `copilot.microsoft.com`

Known selector limitations: AI vendors change their DOM often. The extension uses site-specific selectors plus fallbacks (`textarea`, `[contenteditable="true"]`, `[role="textbox"]`). If insertion fails, copy the generated context manually from the extension popup.

## Import Center

Open `/imports` and upload:

- ChatGPT export ZIP containing `conversations.json`
- Claude export ZIP/JSON
- AI Memory Vault JSON export
- `.txt` or `.md`

Imported memories are always pending and must be approved before normal retrieval.

## Screenshots

Run the app, then capture:

- Overview: `http://localhost:8081/`
- Ask Memory: `http://localhost:8081/ask-memory`
- Suggestions: `http://localhost:8081/suggestions`
- Timeline: `http://localhost:8081/timeline`
- Imports: `http://localhost:8081/imports`
- Product page: `http://localhost:8081/landing`

## Testing

```bash
cd backend
pip install -r requirements-test.txt
pytest
```

Tests use a deterministic local hash embedding fallback so they do not need to download a model.

Frontend build:

```bash
cd frontend
npm install
npm run build
```

## Database migrations

Migration notes live in `backend/migrations/`. Phase 1-9 features reuse the current memory schema, so no destructive migration is required.

## Security notes

This MVP is local-first and does not send memories to external LLM APIs. The embedding model is loaded locally through `sentence-transformers`. Production deployments should add hashed passwords, rate limits, stronger session handling, encrypted storage, audit logs, per-client scoped API keys, backup encryption, and a real passkey/OIDC flow.

See [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md).

## Future roadmap

- Browser extension and desktop tray capture flow
- Better deduplication and merge suggestions
- Per-tool access policies and scoped keys
- Encrypted-at-rest vault mode
- Memory provenance timeline
- Automatic but reviewable memory suggestions
- Richer MCP resources for project/person/goal contexts
- Optional local reranker for higher quality retrieval
