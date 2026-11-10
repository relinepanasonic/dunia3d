# Negara Gue dashboard (Next.js + Supabase, deploy on Vercel)

Public page: live country status. `/admin`: enter IG totals, edit building thresholds, approve comments/episodes.

1. Apply `../supabase/migrations/0001_negara_gue.sql` to your Supabase project.
2. Create an admin user in Supabase Auth, then `insert into ng_admins(email) values ('you@example.com');`
3. `cp .env.example .env.local`, fill URL + anon key. `npm run dev` -> http://localhost:3100
4. Deploy: `vercel` (set the same two env vars in the Vercel project).

Pipeline side (service-role key, never in the browser): set SUPABASE_URL / SUPABASE_SERVICE_KEY in the root `.env`,
then `python -I pipeline.py episode --day 3 --from-supabase --sync`.
