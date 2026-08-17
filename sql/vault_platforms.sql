-- Plateformes gérables depuis le panel admin (Sécurité)

create table if not exists public.vault_platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.vault_platforms to authenticated;
grant insert, update, delete on public.vault_platforms to authenticated;
grant all on public.vault_platforms to service_role;

alter table public.vault_platforms enable row level security;

drop policy if exists "vault_platforms read" on public.vault_platforms;
create policy "vault_platforms read" on public.vault_platforms
  for select to authenticated
  using (true);

drop policy if exists "vault_platforms admin write" on public.vault_platforms;
create policy "vault_platforms admin write" on public.vault_platforms
  for all to authenticated
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

insert into public.vault_platforms (name, sort_order)
values
  ('Ticketmaster', 1),
  ('Plénitude Arena', 2),
  ('Paris La Défense Arena', 3),
  ('Fnac Spectacles', 4),
  ('France Billet', 5),
  ('Live Nation', 6),
  ('Dice', 7),
  ('Weezevent', 8),
  ('Autre', 99)
on conflict (name) do nothing;
