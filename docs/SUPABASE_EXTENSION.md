# Supabase Extension Setup

The extension now uses the same hosted Supabase vault as the web app. It no longer needs the local FastAPI backend URL or API key.

## 1. Reload the Extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Find **AI Memory Vault**.
4. Click **Reload**.
5. If it is not installed, click **Load unpacked** and choose `browser_extension/`.

## 2. Configure Supabase

For public GitHub installs, open the extension and click **Settings**.

Fill:

```text
Supabase URL: https://YOUR_PROJECT.supabase.co
Supabase anon key: YOUR_SUPABASE_ANON_KEY
```

These are the same values used by the web app in `frontend/.env.local`.

For your own official packaged extension, you can set these values in `browser_extension/config.js` before packaging. When that file has real values, users will only need to sign in and enter their vault passphrase.

## 3. Sign In

Use the same Supabase email/password account as the web app.

The account must be approved in Supabase:

```sql
update public.profiles
set status = 'approved'
where email = 'user@example.com';
```

## 4. Enter Vault Passphrase

Use the same vault passphrase you use in the web app.

The passphrase never goes to Supabase. It is used locally by the extension to encrypt/decrypt memories.

## 5. Save Memory

1. Open ChatGPT, Claude, Gemini, Copilot, or another chat page.
2. Open the extension.
3. Click **Save Memory**.
4. Click **Preview current chat**.
5. Choose either:
   - **Save full chat transcript**
   - **Generate memory suggestions**, then save selected suggestions

If **Auto-approve new memories** is off, the saved memory is pending and will not be used by search until approved.

## 6. Use Vault

1. Type a prompt in the AI chat box.
2. Open the extension.
3. Click **Use Vault**.
4. Click **Find relevant memory for current prompt**.
5. Select memories.
6. Click **Use Vault Context**.
7. Paste the copied context into the AI chat.

Search happens locally after encrypted memories are downloaded and decrypted in the extension.

## Screenshots

![AI Memory Vault extension saving a chat transcript](images/extension-save-chat.png)

![AI Memory Vault extension searching approved memories](images/extension-search-vault.png)
