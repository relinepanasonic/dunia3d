-- Negara Gue, part 7: manual mode. Until the Instagram / YouTube / TikTok APIs are approved, an admin types the
-- numbers from each app into the dashboard and posts the videos by hand. The daily run uses these numbers for every
-- platform whose API is not connected.

-- account totals per platform, as read from the app (cumulative numbers, not daily gains)
create table if not exists public.ng_manual_stats (
  day int not null,                 -- the run day these numbers are for (normally "next run")
  platform text not null check (platform in ('instagram', 'youtube', 'tiktok')),
  followers int not null default 0 check (followers >= 0),
  likes int not null default 0 check (likes >= 0),       -- total likes on all posts
  shares int not null default 0 check (shares >= 0),
  comments int not null default 0 check (comments >= 0),
  views int not null default 0 check (views >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, platform)
);
alter table public.ng_manual_stats enable row level security;
drop policy if exists ng_manual_stats_admin on public.ng_manual_stats;
create policy ng_manual_stats_admin on public.ng_manual_stats for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());

-- comments typed in by hand: which platform, and which run already counted them (so coins are paid once)
alter table public.ng_comments add column if not exists platform text not null default 'instagram';
alter table public.ng_comments add column if not exists used_day int;

-- full caption for manual posting
alter table public.ng_episodes add column if not exists hashtags jsonb;
