-- À exécuter dans le SQL Editor du projet de production
-- Réseaux crypto activables/désactivables depuis le panel admin
create table if not exists public.crypto_networks (
  id text primary key,                 -- 'TRC20' | 'SOL'
  label text not null,                 -- affiché dans l'app
  token_symbol text not null,          -- USDT / USDC
  address text,                        -- adresse de réception
  contract text,                       -- contrat TRC20 ou mint SPL
  rate_eur numeric not null default 1.08, -- 1 € = X tokens
  enabled boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.crypto_networks to authenticated;
grant insert, update, delete on public.crypto_networks to authenticated;
grant all on public.crypto_networks to service_role;

alter table public.crypto_networks enable row level security;

drop policy if exists "Anyone authenticated can read networks" on public.crypto_networks;
create policy "Anyone authenticated can read networks"
on public.crypto_networks for select to authenticated using (true);

drop policy if exists "Admins manage networks" on public.crypto_networks;
create policy "Admins manage networks"
on public.crypto_networks for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

insert into public.crypto_networks (id, label, token_symbol, contract, rate_eur, enabled, sort_order)
values
  ('TRC20', 'USDT · TRON (TRC20)', 'USDT', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 1.08, true, 1),
  ('SOL',   'USDC · Solana (SPL)', 'USDC', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 1.08, false, 2)
on conflict (id) do nothing;
