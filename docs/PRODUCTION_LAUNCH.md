# Production Launch Checklist

This project is now configured for self-service signup:

- New Supabase users default to `approved`.
- The web app uses Supabase Auth and client-side encryption.
- The approved Chrome Web Store extension includes the production Supabase publishable configuration, so normal users do not enter a Supabase URL or anon key.
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
2. Disable email confirmation if you want users to sign in immediately after signup.
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

The production Chrome extension is approved here:

```text
https://chromewebstore.google.com/detail/mhnjllipemabeoenghgbanpckhnbddcm?utm_source=item-share-cb
```

The packaged extension has the production Supabase URL and publishable/anon key built in. Users only need to sign in and enter their vault passphrase.

## 5. User Flow

1. User opens web app or extension.
2. User creates account.
3. User signs in immediately.
4. User creates a vault passphrase.
5. User saves memories.
6. Memory content is encrypted before Supabase stores it.

If a user forgets the vault passphrase, nobody can recover their memory content.
