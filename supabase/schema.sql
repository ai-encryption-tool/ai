-- AI Memory Vault Supabase schema.
-- Run this in Supabase SQL Editor before enabling the hosted frontend.

create extension if not exists pgcrypto;

create type public.profile_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status public.profile_status not null default 'approved',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  salt text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger memories_set_updated_at
before update on public.memories
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.memories enable row level security;

create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "Admins can read profiles"
on public.profiles for select
to authenticated
using (exists (
  select 1 from public.profiles admin_profile
  where admin_profile.id = auth.uid()
    and admin_profile.is_admin = true
));

create policy "Admins can approve profiles"
on public.profiles for update
to authenticated
using (exists (
  select 1 from public.profiles admin_profile
  where admin_profile.id = auth.uid()
    and admin_profile.is_admin = true
))
with check (exists (
  select 1 from public.profiles admin_profile
  where admin_profile.id = auth.uid()
    and admin_profile.is_admin = true
));

create policy "Approved users can read their encrypted memories"
on public.memories for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'approved'
  )
);

create policy "Approved users can create encrypted memories"
on public.memories for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'approved'
  )
);

create policy "Approved users can update their encrypted memories"
on public.memories for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'approved'
  )
)
with check (user_id = auth.uid());

create policy "Approved users can delete their encrypted memories"
on public.memories for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'approved'
  )
);

-- For self-service signup, new profiles default to approved.
-- After creating your own account, run this once in SQL Editor if you need admin access:
-- update public.profiles set is_admin = true, status = 'approved' where email = 'you@example.com';
