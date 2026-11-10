-- Negara Gue, part 4: citizen web app. Accounts, wallet ledger, referral links, in-app polls vote, house upgrades.
-- All money logic lives in SECURITY DEFINER functions so the browser (anon/authenticated key) cannot cheat.
-- Requires 0001-0003.

alter table public.ng_citizens add column if not exists owner uuid unique references auth.users (id) on delete set null;

create table if not exists public.ng_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  ref_code text not null unique,
  claim_code text not null unique,                  -- comment this on a reel to link your Instagram/YouTube handle
  citizen_id bigint references public.ng_citizens (id) on delete set null,
  verified boolean not null default false,
  claimed_platform text, claimed_handle text,
  referred_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ng_wallet_tx (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null,
  reason text not null,        -- signup | checkin | referral | click | vote | claim | upgrade
  ref text not null,           -- idempotency key per reason
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref)
);

create table if not exists public.ng_ref_clicks (
  code text not null, visitor text not null, day date not null,
  primary key (code, visitor, day)
);

alter table public.ng_accounts enable row level security;
alter table public.ng_wallet_tx enable row level security;
alter table public.ng_ref_clicks enable row level security;

drop policy if exists ng_accounts_own on public.ng_accounts;
create policy ng_accounts_own on public.ng_accounts for select to authenticated using (user_id = auth.uid());
drop policy if exists ng_accounts_admin on public.ng_accounts;
create policy ng_accounts_admin on public.ng_accounts for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());
drop policy if exists ng_wallet_own on public.ng_wallet_tx;
create policy ng_wallet_own on public.ng_wallet_tx for select to authenticated using (user_id = auth.uid());
drop policy if exists ng_wallet_admin on public.ng_wallet_tx;
create policy ng_wallet_admin on public.ng_wallet_tx for all to authenticated using (public.ng_is_admin()) with check (public.ng_is_admin());
-- no policy on ng_ref_clicks: only the functions below touch it

-- ---------------------------------------------------------------- helpers
create or replace function public.ng_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Jakarta')::date;
$$;

create or replace function public.ng_balance_of(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select c.coins - c.spent from ng_accounts a join ng_citizens c on c.id = a.citizen_id where a.user_id = uid), 0)
       + coalesce((select sum(amount) from ng_wallet_tx where user_id = uid), 0)::int;
$$;
revoke all on function public.ng_balance_of(uuid) from public, anon, authenticated;

create or replace function public.ng_balance() returns int
language sql stable security definer set search_path = public as $$
  select public.ng_balance_of(auth.uid());
$$;

-- ---------------------------------------------------------------- sign up: free pod + welcome coins (+ referral)
create or replace function public.ng_signup_profile(p_username text, p_ref text default null) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid bigint; rc text; cc text; refr uuid; acc ng_accounts;
begin
  if uid is null then raise exception 'login dulu'; end if;
  select * into acc from ng_accounts where user_id = uid;
  if found then return row_to_json(acc); end if;
  if p_username !~ '^[A-Za-z0-9_.]{3,20}$' then raise exception 'username 3-20 karakter: huruf, angka, _ atau .'; end if;
  if exists (select 1 from ng_citizens where lower(handle) = lower(p_username)) then raise exception 'username sudah dipakai'; end if;
  insert into ng_citizens (platform, handle, owner, level, first_day, last_day)
    values ('web', p_username, uid, 1, (select coalesce(max(day), 0) from ng_snapshots), (select coalesce(max(day), 0) from ng_snapshots))
    returning id into cid;
  rc := substr(md5(random()::text || uid::text), 1, 8);
  cc := 'NG-' || upper(substr(md5(random()::text || p_username), 1, 6));
  select user_id into refr from ng_accounts where ref_code = p_ref and user_id <> uid;
  insert into ng_accounts (user_id, username, ref_code, claim_code, citizen_id, referred_by) values (uid, p_username, rc, cc, cid, refr);
  insert into ng_wallet_tx (user_id, amount, reason, ref) values (uid, 20, 'signup', uid::text);
  if refr is not null then
    insert into ng_wallet_tx (user_id, amount, reason, ref) values (refr, 25, 'referral', uid::text) on conflict do nothing;
  end if;
  select * into acc from ng_accounts where user_id = uid;
  return row_to_json(acc);
end $$;

-- ---------------------------------------------------------------- daily check-in with streak bonus
create or replace function public.ng_checkin() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := public.ng_today(); d date; streak int := 0; amt int;
begin
  if uid is null then raise exception 'login dulu'; end if;
  if not exists (select 1 from ng_accounts where user_id = uid) then raise exception 'buat profil dulu'; end if;
  if exists (select 1 from ng_wallet_tx where user_id = uid and reason = 'checkin' and ref = today::text) then
    return json_build_object('already', true, 'balance', public.ng_balance_of(uid));
  end if;
  d := today - 1;
  while streak < 10 and exists (select 1 from ng_wallet_tx where user_id = uid and reason = 'checkin' and ref = d::text) loop
    streak := streak + 1; d := d - 1;
  end loop;
  amt := 10 + 2 * streak;
  insert into ng_wallet_tx (user_id, amount, reason, ref) values (uid, amt, 'checkin', today::text);
  return json_build_object('already', false, 'amount', amt, 'streak', streak + 1, 'balance', public.ng_balance_of(uid));
end $$;

-- ---------------------------------------------------------------- referral link click (anonymous visitors allowed; capped)
create or replace function public.ng_click(p_code text, p_visitor text) returns void
language plpgsql security definer set search_path = public as $$
declare owner_id uuid; v_day date := public.ng_today(); n int;
begin
  if p_visitor is null or length(p_visitor) < 8 then return; end if;
  select user_id into owner_id from ng_accounts where ref_code = p_code;
  if owner_id is null then return; end if;
  insert into ng_ref_clicks (code, visitor, day) values (p_code, p_visitor, v_day) on conflict do nothing;
  if not found then return; end if;
  select count(*) into n from ng_ref_clicks c where c.code = p_code and c.day = v_day;
  if n <= 20 then   -- max 20 click-coins per day per link
    insert into ng_wallet_tx (user_id, amount, reason, ref) values (owner_id, 1, 'click', p_visitor || ':' || v_day::text) on conflict do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------- upgrade house
create or replace function public.ng_upgrade() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid bigint; lvl int; cost int; bal int; costs int[] := array[0, 50, 150, 400, 1000];
begin
  if uid is null then raise exception 'login dulu'; end if;
  select citizen_id into cid from ng_accounts where user_id = uid;
  select level into lvl from ng_citizens where id = cid for update;
  if lvl is null then raise exception 'rumah tidak ditemukan'; end if;
  if lvl >= 5 then raise exception 'rumah sudah level maksimum'; end if;
  cost := costs[lvl + 1]; bal := public.ng_balance_of(uid);
  if bal < cost then raise exception 'koin kurang (butuh %, punya %)', cost, bal; end if;
  update ng_citizens set level = lvl + 1 where id = cid;
  insert into ng_wallet_tx (user_id, amount, reason, ref) values (uid, -cost, 'upgrade', (lvl + 1)::text);
  return json_build_object('level', lvl + 1, 'balance', public.ng_balance_of(uid));
end $$;

-- ---------------------------------------------------------------- vote in a poll from the web app
create or replace function public.ng_vote_web(p_poll bigint, p_idx int) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); uname text;
begin
  if uid is null then raise exception 'login dulu'; end if;
  select username into uname from ng_accounts where user_id = uid;
  if uname is null then raise exception 'buat profil dulu'; end if;
  if not exists (select 1 from ng_polls where id = p_poll and status = 'open') then raise exception 'polling sudah ditutup'; end if;
  if not exists (select 1 from ng_poll_options where poll_id = p_poll and idx = p_idx) then raise exception 'pilihan tidak ada'; end if;
  insert into ng_votes (poll_id, option_idx, platform, handle, source_id) values (p_poll, p_idx, 'web', uname, 'web') on conflict do nothing;
  if not found then return json_build_object('already', true); end if;
  update ng_poll_options set votes = votes + 1 where poll_id = p_poll and idx = p_idx;
  insert into ng_wallet_tx (user_id, amount, reason, ref) values (uid, 3, 'vote', p_poll::text) on conflict do nothing;
  return json_build_object('already', false, 'balance', public.ng_balance_of(uid));
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.ng_signup_profile(text, text), public.ng_checkin(), public.ng_upgrade(), public.ng_vote_web(bigint, int), public.ng_balance(), public.ng_click(text, text) from public, anon;
grant execute on function public.ng_signup_profile(text, text), public.ng_checkin(), public.ng_upgrade(), public.ng_vote_web(bigint, int), public.ng_balance() to authenticated;
grant execute on function public.ng_click(text, text) to anon, authenticated;
