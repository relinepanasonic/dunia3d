-- Negara Gue: gamified IG country dashboard.
-- All tables are prefixed ng_ so they can live safely next to other apps in the same Supabase project.
-- Mapping: followers=penduduk, likes=pajak, shares=pengaruh, comments=inspirasi.

create table if not exists public.ng_admins (email text primary key);

create or replace function public.ng_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ng_admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.ng_is_admin() from public, anon;
grant execute on function public.ng_is_admin() to authenticated;

create table if not exists public.ng_buildings (
  id text primary key,
  name text not null,
  pajak int not null check (pajak >= 0),
  inspirasi int not null check (inspirasi >= 0),   -- min comments in the episode to build
  penduduk int not null check (penduduk >= 0),
  pengaruh int not null default 0 check (pengaruh >= 0),
  slot int not null unique,
  built_day int,
  built_at timestamptz
);

create table if not exists public.ng_snapshots (
  id bigint generated always as identity primary key,
  day int not null unique,
  followers int not null default 0,
  likes int not null default 0,
  shares int not null default 0,
  comments int not null default 0,
  penduduk int not null default 0,
  pajak int not null default 0,          -- treasury after spending
  pengaruh int not null default 0,
  inspirasi int not null default 0,      -- cumulative
  inspirasi_ep int not null default 0,   -- earned this episode (used for build requirement)
  tier text,
  created_at timestamptz not null default now()
);

create table if not exists public.ng_inputs (   -- latest IG totals entered by an admin (or a sync job)
  id bigint generated always as identity primary key,
  followers int not null, likes int not null, shares int not null, comments int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ng_comments (
  id bigint generated always as identity primary key,
  day int,
  ig_user text not null,
  text text not null,
  likes int not null default 0,
  status text not null default 'new' check (status in ('new', 'approved', 'rejected', 'built')),
  created_at timestamptz not null default now()
);

create table if not exists public.ng_episodes (
  day int primary key,
  title text,
  caption text,
  video_url text,
  ig_media_id text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published')),
  created_at timestamptz not null default now()
);

-- ---------- RLS: public read of public data, admin write ----------
alter table public.ng_admins enable row level security;
alter table public.ng_buildings enable row level security;
alter table public.ng_snapshots enable row level security;
alter table public.ng_inputs enable row level security;
alter table public.ng_comments enable row level security;
alter table public.ng_episodes enable row level security;

create policy ng_buildings_read on public.ng_buildings for select using (true);
create policy ng_snapshots_read on public.ng_snapshots for select using (true);
create policy ng_comments_read on public.ng_comments for select using (status in ('approved', 'built'));
create policy ng_episodes_read on public.ng_episodes for select using (status = 'published');

create policy ng_buildings_admin on public.ng_buildings for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());
create policy ng_snapshots_admin on public.ng_snapshots for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());
create policy ng_inputs_admin on public.ng_inputs for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());
create policy ng_comments_admin on public.ng_comments for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());
create policy ng_episodes_admin on public.ng_episodes for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());
create policy ng_admins_self on public.ng_admins for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ---------- seed: building catalog (mirrors series/game.json) ----------
insert into public.ng_buildings (id, name, pajak, inspirasi, penduduk, pengaruh, slot) values
  ('kedai_nutrisi',   'Kedai Nutrisi',   40,   3,  20,   0,   0),
  ('menara_energi',   'Menara Energi',   120,  6,  60,   0,   1),
  ('stasiun_maglev',  'Stasiun Maglev',  250,  10, 150,  10,  2),
  ('klinik_hologram', 'Klinik Hologram', 400,  15, 300,  15,  3),
  ('kampus_ai',       'Kampus AI',       700,  20, 500,  30,  4),
  ('kedutaan',        'Kedutaan Dunia',  900,  25, 800,  100, 5),
  ('stadion_hover',   'Stadion Hover',   1500, 35, 1200, 150, 6),
  ('pelabuhan_orbit', 'Pelabuhan Orbit', 3000, 50, 3000, 300, 7)
on conflict (id) do nothing;
