# Production Launch Checklist

This project is now configured for self-service signup:

- New Supabase users default to `approved`.
- The web app uses Supabase Auth and client-side encryption.
- The public repository keeps `browser_extension/config.js` blank. For your official packaged extension, fill it with your Supabase URL and publishable/anon key before zipping or store submission.
- Users only need email/password and their vault passphrase.

## 1. Supabase SQL

You already ran:

```sql
alter table public.profiles
alter column status set default 'approved';
```

Run this once to approve existing pending users:

```sql
update public.profiles
set status = 'approved'
where status = 'pending';
```

Remove risky self-update policies from `profiles`:

```sql
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
```

Users should be able to read their own profile, but not edit `status` or `is_admin`.

Keep or recreate:

```sql
drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());
```

## 2. Supabase Auth Settings

For public launch:

1. Enable email/password signup.
2. Keep email confirmation on if you want real email verification.
3. Add your deployed web URL to allowed redirect URLs.

## 3. Frontend Deploy

Deploy `frontend/` to Vercel, Netlify, Cloudflare Pages, or Azure Static Web Apps.

Build settings:

```text
Root directory: frontend
Build command: npm run build
Output directory: dist
```

Environment variables:

```env
VITE_STORAGE_MODE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

## 4. Extension Package

The extension is configured in:

```text
browser_extension/config.js
```

For a public GitHub repo, leave the values blank so visitors do not get your project settings by mistake. If you publish your own extension package, add your Supabase URL and publishable/anon key before creating the zip. The publishable/anon key is not a service-role secret, but it is still project-specific.

For local testing:

1. Open `edge://extensions` or `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked.
4. Select `browser_extension/`.

For public release, upload `dist/ai-memory-vault-extension.zip` to:

- Microsoft Edge Add-ons
- Chrome Web Store

You will need screenshots, icon assets, a short description, and a privacy policy.

## 5. User Flow

1. User opens web app or extension.
2. User creates account.
3. User confirms email if enabled.
4. User signs in.
5. User creates a vault passphrase.
6. User saves memories.
7. Memory content is encrypted before Supabase stores it.

If a user forgets the vault passphrase, nobody can recover their memory content.
