-- Visibilité des onglets du dashboard
create table if not exists public.nav_visibility (
  key text primary key,
  hidden boolean not null default false,
  updated_at timestamptz not null default now()
);

grant select on public.nav_visibility to authenticated, anon;
grant all on public.nav_visibility to service_role;

alter table public.nav_visibility enable row level security;

drop policy if exists "nav_visibility read" on public.nav_visibility;
create policy "nav_visibility read"
  on public.nav_visibility for select
  to authenticated, anon
  using (true);

drop policy if exists "nav_visibility admin" on public.nav_visibility;
create policy "nav_visibility admin"
  on public.nav_visibility for all
  to authenticated
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

insert into public.nav_visibility (key, hidden) values
  ('dashboard', false),
  ('credit', false),
  ('transactions', false),
  ('products', false),
  ('securite', false),
  ('collab', false)
on conflict (key) do nothing;
