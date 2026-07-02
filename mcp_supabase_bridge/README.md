# AI Memory Vault Supabase MCP Bridge

This local MCP server connects Codex, Claude Desktop, Cursor, and other MCP clients to the hosted Supabase AI Memory Vault.

Privacy model:

- Supabase stores encrypted memory rows.
- This bridge downloads encrypted rows for the signed-in user.
- The bridge decrypts locally with `VAULT_PASSPHRASE`.
- Only selected search results are returned to the AI tool.

## Setup

```powershell
cd mcp_supabase_bridge
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`:

```env
SUPABASE_URL=https://qhadbdhelbfycszzjehm.supabase.co
SUPABASE_ANON_KEY=sb_publishable_ddGwnfuPOt9BShap3zoRJg_c3p3GdA6
SUPABASE_EMAIL=user@example.com
SUPABASE_PASSWORD=user-password
VAULT_PASSPHRASE=user-vault-passphrase
DEFAULT_APPROVED=true
```

Run:

```powershell
python server.py
```

## MCP Client Config

Example:

```json
{
  "mcpServers": {
    "ai-memory-vault": {
      "command": "python",
      "args": [
        "C:/path/to/AI Memory Vault/mcp_supabase_bridge/server.py"
      ],
      "env": {
        "SUPABASE_URL": "https://qhadbdhelbfycszzjehm.supabase.co",
        "SUPABASE_ANON_KEY": "sb_publishable_ddGwnfuPOt9BShap3zoRJg_c3p3GdA6",
        "SUPABASE_EMAIL": "user@example.com",
        "SUPABASE_PASSWORD": "user-password",
        "VAULT_PASSPHRASE": "user-vault-passphrase",
        "DEFAULT_APPROVED": "true"
      }
    }
  }
}
```

## Tools

- `search_memory(query, limit, include_pending)`
- `list_memories(include_pending, limit)`
- `create_memory(content, type, source, approved, tags, confidence)`
- `approve_memory(id)`

Do not commit real `.env` files.
