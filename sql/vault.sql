-- Coffre SlowRun : comptes billetterie + cartes bancaires
-- A exécuter dans le projet Supabase de production.

create table if not exists public.vault_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  label text,
  email text not null,
  password text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_name text not null,
  cardholder text not null,
  card_number text not null,
  exp_month text not null,
  exp_year text not null,
  cvv text not null,
  billing_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.vault_accounts to authenticated;
grant select, insert, update, delete on public.vault_cards to authenticated;
grant all on public.vault_accounts to service_role;
grant all on public.vault_cards to service_role;

alter table public.vault_accounts enable row level security;
alter table public.vault_cards enable row level security;

create or replace function public.is_admin_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false)
$$;

drop policy if exists "vault_accounts owner" on public.vault_accounts;
create policy "vault_accounts owner" on public.vault_accounts
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin_user(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin_user(auth.uid()));

drop policy if exists "vault_cards owner" on public.vault_cards;
create policy "vault_cards owner" on public.vault_cards
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin_user(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin_user(auth.uid()));

create index if not exists vault_accounts_user_idx on public.vault_accounts(user_id);
create index if not exists vault_cards_user_idx on public.vault_cards(user_id);
