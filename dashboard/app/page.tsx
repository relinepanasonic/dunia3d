import { supabase, configured } from "@/lib/supabase";
import HomeView, { type HomeData } from "@/components/HomeView";
import type { Building, Citizen, PlatformStat, Poll, Report, Snapshot } from "@/lib/game";

export const revalidate = 60;

export default async function Home() {
  if (!configured) {
    return <div className="wrap"><h1>Dashboard</h1><p className="empty">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).</p></div>;
  }
  const [snaps, blds, cits, polls, reps, plats] = await Promise.all([
    supabase.from("ng_snapshots").select("*").order("day", { ascending: true }),
    supabase.from("ng_buildings").select("*").order("slot", { ascending: true }),
    supabase.from("ng_citizens").select("*").limit(500),
    supabase.from("ng_polls").select("*, ng_poll_options(*)").order("created_at", { ascending: false }).limit(8),
    supabase.from("ng_reports").select("*").order("day", { ascending: false }).limit(4),
    supabase.from("ng_platform_stats").select("*").order("day", { ascending: false }).limit(9),
  ]);
  const history = (snaps.data ?? []) as Snapshot[];
  const latest = history.at(-1);
  const data: HomeData = {
    history, buildings: (blds.data ?? []) as Building[], citizens: (cits.data ?? []) as Citizen[],
    polls: (polls.data ?? []) as Poll[], reports: (reps.data ?? []) as Report[],
    platRows: ((plats.data ?? []) as PlatformStat[]).filter((p) => p.day === latest?.day),
  };
  return <HomeView d={data} />;
}
