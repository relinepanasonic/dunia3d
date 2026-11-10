-- Negara Gue, part 6: week-1 "duel" voting. Two presentation reels (A and B) compete on likes; the winner is built
-- if it reaches the minimum like number (yes/no gate). Likes come from each platform's own like counter per reel.
create table if not exists public.ng_duels (
  id bigint generated always as identity primary key,
  day int not null unique,                       -- the day the two reels are published
  status text not null default 'planned' check (status in ('planned', 'open', 'resolved', 'cancelled')),
  min_likes int not null default 30,
  followers_at_start int not null default 0,
  options jsonb not null default '[]'::jsonb,    -- [{side:'A',building_id,name,style,pitch:[..],custom,video_url,media:{instagram:'..'},likes:0}, ...]
  winner text check (winner in ('A', 'B')),
  result jsonb,                                  -- {likes:{A,B}, built:bool, reason:text}
  created_at timestamptz not null default now()
);
alter table public.ng_duels enable row level security;
drop policy if exists ng_duels_read on public.ng_duels;
create policy ng_duels_read on public.ng_duels for select using (status <> 'cancelled');
drop policy if exists ng_duels_admin on public.ng_duels;
create policy ng_duels_admin on public.ng_duels for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());
