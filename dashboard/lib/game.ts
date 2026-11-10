export type Building = {
  id: string; name: string; pajak: number; inspirasi: number; penduduk: number; pengaruh: number;
  slot: number; built_day: number | null; style?: number; custom?: boolean;
};
export type Snapshot = {
  day: number; followers: number; likes: number; shares: number; comments: number; penduduk: number;
  pajak: number; pengaruh: number; inspirasi: number; inspirasi_ep: number; tier: string | null; score: number;
};
export type PlatformStat = { day: number; platform: string; followers: number; likes: number; shares: number; comments: number; views: number };
export type Citizen = { platform: string; handle: string; coins: number; pengaruh: number; comments: number; comment_likes: number; mentions: number; votes: number };
export type PollOption = { id: number; idx: number; label: string; building_name: string | null; style: number; pajak: number; votes: number };
export type Poll = { id: number; title: string; question: string; status: string; closes_day: number | null; quorum: number; winner_idx: number | null; ng_poll_options: PollOption[] };
export type Report = { id: number; day: number; kind: string; title: string; body: string };

export const STYLES = ["Kedai / dome", "Menara energi", "Stasiun maglev", "Klinik hologram", "Kampus berundak", "Kedutaan", "Stadion hover", "Pelabuhan orbit"];

export const KPI = [
  { key: "penduduk", ig: "Follower", label: "Penduduk", desc: "Follow (IG+YT+TikTok) = penduduk negara", color: "#37e9ff" },
  { key: "pajak", ig: "Like", label: "Pajak", desc: "Like (semua platform) = kas negara", color: "#d7ff3a" },
  { key: "pengaruh", ig: "Share", label: "Pengaruh", desc: "Share (semua platform) = pengaruh dunia", color: "#ff4fd8" },
  { key: "inspirasi", ig: "Komen", label: "Inspirasi", desc: "Komen (semua platform) = ide pembangunan", color: "#ffb23a" },
] as const;

export const TIERS = [
  { name: "Dusun Digital", min: 0 }, { name: "Kota Neon", min: 100 },
  { name: "Metropolis", min: 1000 }, { name: "Megapolis Dunia", min: 10000 },
];

export function nextTier(penduduk: number) {
  return TIERS.find((t) => t.min > penduduk) ?? null;
}

/** Requirement progress for a building given the latest snapshot. */
export function requirements(b: Building, s: Snapshot | null) {
  const cur = { pajak: s?.pajak ?? 0, inspirasi: s?.inspirasi_ep ?? 0, penduduk: s?.penduduk ?? 0, pengaruh: s?.pengaruh ?? 0 };
  const rows = (["pajak", "inspirasi", "penduduk", "pengaruh"] as const)
    .filter((k) => b[k] > 0)
    .map((k) => ({ key: k, have: cur[k], need: b[k], pct: Math.min(100, Math.round((cur[k] / b[k]) * 100)) }));
  return { rows, ready: rows.every((r) => r.have >= r.need) };
}

export const HOUSES = [
  { level: 1, name: "Pod Kecil", cost: 0 },
  { level: 2, name: "Pod Solar", cost: 50 },
  { level: 3, name: "Pod Taman", cost: 150 },
  { level: 4, name: "Vila Apung", cost: 400 },
  { level: 5, name: "Mansion Oktagon", cost: 1000 },
];
export type WorldCitizen = Citizen & { level?: number; spent?: number };
/** Level stored by the daily job; before that, derive it from coins (every citizen owns at least a free pod). */
export function levelOf(c: WorldCitizen) {
  if (c.level) return c.level;
  let lvl = 1, left = c.coins;
  for (const h of HOUSES.slice(1)) { if (left >= h.cost) { left -= h.cost; lvl = h.level; } else break; }
  return lvl;
}
