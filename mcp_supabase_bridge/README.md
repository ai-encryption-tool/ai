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
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
SUPABASE_EMAIL=user@example.com
SUPABASE_PASSWORD=user-password
VAULT_PASSPHRASE=user-vault-passphrase
DEFAULT_APPROVED=true
SUPABASE_SSL_VERIFY=true
```

Run:

```powershell
python server.py
```

`python server.py` is quiet by design. MCP servers communicate over stdio and wait for an MCP client, so you usually will not see logs or a browser window.

To test the bridge manually before connecting Codex or Claude Desktop:

```powershell
python test_bridge.py memory
```

Expected output:

```text
Connected. Decrypted memories: 3
Search query: memory
[
  ...
]
```

If the test cannot connect, check internet access, Supabase email/password, and the vault passphrase.

If Python shows `CERTIFICATE_VERIFY_FAILED`, first try:

```powershell
python -m pip install --upgrade certifi
```

If your network still blocks certificate verification, set this in `.env` for local testing:

```env
SUPABASE_SSL_VERIFY=false
```

Use `false` only for local testing. For production or shared machines, keep SSL verification enabled or set `SUPABASE_SSL_VERIFY` to your company/root CA bundle path.

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
        "SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
        "SUPABASE_ANON_KEY": "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
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
