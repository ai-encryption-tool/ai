# Supabase Auth + RLS + Client-Side Encryption

This hosted mode keeps each user's memory content unreadable to other users, the database owner, and admins. Supabase stores only encrypted blobs. The encryption passphrase stays in the user's browser session and is never sent to Supabase.

## 1. Create Supabase Project

1. Go to Supabase and create a project.
2. Open **SQL Editor**.
3. Paste and run `supabase/schema.sql`.
4. Create your own account from the app signup screen.
5. In SQL Editor, approve yourself and make yourself admin:

```sql
update public.profiles
set is_admin = true, status = 'approved'
where email = 'you@example.com';
```

## 2. Auth Settings

In Supabase Authentication settings:

1. Enable email/password signups.
2. Keep email confirmation enabled if you want verified email addresses.
3. Add your deployed site URL to allowed redirect URLs after deployment.

New users start as `pending`. They can sign in, but cannot create or read memories until approved.

## 3. Frontend Environment

Create `frontend/.env.local`:

```env
VITE_STORAGE_MODE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

The anon key is safe to expose in browser apps because RLS protects table access. Never expose the Supabase service role key.

## 4. Run Locally

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 7066
```

Open `http://127.0.0.1:7066`.

## 5. Deploy Free Frontend

Use Vercel, Netlify, Cloudflare Pages, or Azure Static Web Apps.

Build settings:

```text
Root directory: frontend
Build command: npm run build
Output directory: dist
```

Add the same environment variables from step 3 in the hosting provider dashboard.

## 6. Approve Users

For now, approve users in Supabase SQL Editor:

```sql
update public.profiles
set status = 'approved'
where email = 'new-user@example.com';
```

Later we can add an encrypted admin page that lists pending users. Admins still cannot decrypt user memories because the memories are encrypted with each user's passphrase.

## Privacy Notes

- Supabase admins can see user emails, approval status, memory row IDs, timestamps, ciphertext sizes, salts, and IVs.
- Supabase admins cannot read memory content without the user's passphrase.
- If a user forgets the passphrase, their memory content cannot be recovered.
- Search is client-side after decryption. Server-side semantic/vector search is intentionally not enabled because that would require exposing plaintext or embeddings to the server.
