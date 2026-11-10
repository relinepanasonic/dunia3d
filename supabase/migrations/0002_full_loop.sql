-- Negara Gue, part 2: multi-platform stats, citizens (coins/influence), polls/events, reports, pipeline state.
-- Run after 0001. Safe to re-run.

-- ---------- pipeline state (series bible lives here so CI is stateless) ----------
create table if not exists public.ng_state (key text primary key, value jsonb not null, updated_at timestamptz not null default now());

-- ---------- per-platform daily totals (cumulative, as read at 00:01) ----------
create table if not exists public.ng_platform_stats (
  id bigint generated always as identity primary key,
  day int not null,
  platform text not null check (platform in ('instagram', 'youtube', 'tiktok')),
  followers int not null default 0, likes int not null default 0, shares int not null default 0,
  comments int not null default 0, views int not null default 0,
  created_at timestamptz not null default now(),
  unique (day, platform)
);

-- ---------- citizens: only what the platforms actually expose (commenters + mentions) ----------
create table if not exists public.ng_activity (       -- per person per day, overwritten on re-run (idempotent)
  id bigint generated always as identity primary key,
  day int not null, platform text not null, handle text not null,
  comments int not null default 0, comment_likes int not null default 0,
  mentions int not null default 0, votes int not null default 0,
  unique (day, platform, handle)
);
create table if not exists public.ng_citizens (
  id bigint generated always as identity primary key,
  platform text not null, handle text not null,
  coins int not null default 0, pengaruh int not null default 0,
  comments int not null default 0, comment_likes int not null default 0, mentions int not null default 0, votes int not null default 0,
  first_day int, last_day int,
  unique (platform, handle)
);

-- ---------- polls / events requested from the dashboard ----------
create table if not exists public.ng_polls (
  id bigint generated always as identity primary key,
  title text not null,
  question text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  opens_day int,            -- first episode day that announces it (null = next episode)
  closes_day int,           -- closes during the 00:01 run of this day
  quorum int not null default 3,
  winner_idx int,
  result jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.ng_poll_options (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.ng_polls (id) on delete cascade,
  idx int not null,
  label text not null,                 -- e.g. "Free Meal"
  keywords text[] not null default '{}',
  building_name text,                  -- building created if this option wins
  style int not null default 0 check (style between 0 and 7),
  pajak int not null default 100, inspirasi int not null default 0, penduduk int not null default 0, pengaruh int not null default 0,
  votes int not null default 0,
  unique (poll_id, idx)
);
create table if not exists public.ng_votes (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.ng_polls (id) on delete cascade,
  option_idx int not null, platform text not null, handle text not null, source_id text,
  created_at timestamptz not null default now(),
  unique (poll_id, platform, handle)   -- one vote per person
);

-- ---------- reports ----------
create table if not exists public.ng_reports (
  id bigint generated always as identity primary key,
  day int not null, kind text not null check (kind in ('daily', 'poll')), title text not null,
  body text not null, data jsonb,
  created_at timestamptz not null default now(),
  unique (day, kind)
);

-- ---------- extend existing tables ----------
alter table public.ng_buildings add column if not exists style int not null default 0;
alter table public.ng_buildings add column if not exists custom boolean not null default false;
alter table public.ng_buildings add column if not exists poll_id bigint;
alter table public.ng_episodes add column if not exists platforms jsonb not null default '{}'::jsonb;  -- {"instagram":{"id":..,"status":..},...}
alter table public.ng_snapshots add column if not exists score int not null default 0;

-- ---------- RLS ----------
alter table public.ng_state enable row level security;
alter table public.ng_platform_stats enable row level security;
alter table public.ng_activity enable row level security;
alter table public.ng_citizens enable row level security;
alter table public.ng_polls enable row level security;
alter table public.ng_poll_options enable row level security;
alter table public.ng_votes enable row level security;
alter table public.ng_reports enable row level security;

drop policy if exists ng_platform_stats_read on public.ng_platform_stats;
create policy ng_platform_stats_read on public.ng_platform_stats for select using (true);
drop policy if exists ng_citizens_read on public.ng_citizens;
create policy ng_citizens_read on public.ng_citizens for select using (true);
drop policy if exists ng_polls_read on public.ng_polls;
create policy ng_polls_read on public.ng_polls for select using (status <> 'cancelled');
drop policy if exists ng_poll_options_read on public.ng_poll_options;
create policy ng_poll_options_read on public.ng_poll_options for select using (true);
drop policy if exists ng_reports_read on public.ng_reports;
create policy ng_reports_read on public.ng_reports for select using (true);
-- ng_state, ng_activity, ng_votes: no public policy (service role / admin only)

do $$
declare t text;
begin
  foreach t in array array['ng_state','ng_platform_stats','ng_activity','ng_citizens','ng_polls','ng_poll_options','ng_votes','ng_reports'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin())', t || '_admin', t);
  end loop;
end $$;

-- ---------- storage bucket for rendered reels (public URL needed by Instagram) ----------
insert into storage.buckets (id, name, public) values ('reels', 'reels', true) on conflict (id) do nothing;
