# MCP Setup

AI Memory Vault exposes MCP tools through `mcp_server/server.py`.

## Tools

- `search_memory(query, include_pending=false)`
- `create_memory(content, type, source="api")`
- `list_memories()`
- `update_memory(id, content=null, type=null, confidence=null)`
- `delete_memory(id)`
- `approve_memory(id)`
- `reject_memory(id)`
- `ask_memory(query)`

## Environment

```bash
BACKEND_URL=http://localhost:8000
API_KEY=dev-local-api-key-change-me
```

## Claude Desktop

Add to Claude Desktop MCP config:

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

## Cursor

Add the same MCP server definition in Cursor settings under MCP servers. Use the absolute path to `mcp_server/server.py`.

## Windsurf

Add a custom MCP server with command `python`, args pointing to `mcp_server/server.py`, and the same environment variables.

## Open WebUI

Run the MCP server locally and register it as a tool server if your Open WebUI deployment has MCP/tool-server support enabled. Use `BACKEND_URL` pointing to the backend reachable from Open WebUI.

## Behavior

Memories created through MCP are pending by default. Use `approve_memory(id)` or the dashboard to allow retrieval by default.

The browser extension uses the same backend API rather than MCP. MCP is for AI tools that can call tool servers directly; the extension is for consumer AI web apps.
