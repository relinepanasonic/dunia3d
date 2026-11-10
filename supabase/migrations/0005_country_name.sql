-- Negara Gue, part 5: the country name is chosen by a citizen poll.
-- ng_polls.kind = 'building' (winner is built) or 'name' (winner becomes the country name).
alter table public.ng_polls add column if not exists kind text not null default 'building' check (kind in ('building', 'name'));

-- The brand row in ng_state is readable by everyone (the site header needs it); everything else in ng_state stays private.
insert into public.ng_state (key, value) values ('brand', '{"name": "Negara Gue"}'::jsonb) on conflict (key) do nothing;
drop policy if exists ng_state_brand_read on public.ng_state;
create policy ng_state_brand_read on public.ng_state for select using (key = 'brand');
