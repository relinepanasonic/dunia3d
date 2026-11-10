-- Negara Gue, part 3: houses (free pod for every citizen, upgradable) + daily dividend.
alter table public.ng_citizens add column if not exists level int not null default 1 check (level between 1 and 5);
alter table public.ng_citizens add column if not exists spent int not null default 0;
alter table public.ng_activity add column if not exists dividend int not null default 0;
