-- À exécuter dans le SQL Editor du projet de production (jisiahjqkxuctzmrsqzd)
-- Rechargement crypto (USDT TRC20) — 100% maison, matching par montant unique
create table if not exists public.crypto_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_eur numeric not null,
  amount_usdt numeric not null,
  address text not null,
  network text not null default 'TRC20',
  status text not null default 'pending',
  tx_hash text,
  paid_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists crypto_payments_user_idx on public.crypto_payments(user_id);
create index if not exists crypto_payments_status_idx on public.crypto_payments(status);
create unique index if not exists crypto_payments_tx_hash_key on public.crypto_payments(tx_hash) where tx_hash is not null;

grant select on public.crypto_payments to authenticated;
grant all on public.crypto_payments to service_role;

alter table public.crypto_payments enable row level security;

drop policy if exists "Users read own crypto payments" on public.crypto_payments;
create policy "Users read own crypto payments"
on public.crypto_payments
for select
to authenticated
using (auth.uid() = user_id);
