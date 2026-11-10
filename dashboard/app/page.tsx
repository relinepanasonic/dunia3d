import Link from "next/link";
import { supabase, configured } from "@/lib/supabase";
import { KPI, nextTier, requirements, type Building, type Citizen, type PlatformStat, type Poll, type Report, type Snapshot } from "@/lib/game";

export const revalidate = 60;

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const PLAT: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

export default async function Home() {
  if (!configured) {
    return <div className="wrap"><h1>Negara Gue</h1><p className="empty">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).</p></div>;
  }
  const [snaps, blds, cits, polls, reps, plats] = await Promise.all([
    supabase.from("ng_snapshots").select("*").order("day", { ascending: true }),
    supabase.from("ng_buildings").select("*").order("slot", { ascending: true }),
    supabase.from("ng_citizens").select("*").limit(500),
    supabase.from("ng_polls").select("*, ng_poll_options(*)").order("created_at", { ascending: false }).limit(6),
    supabase.from("ng_reports").select("*").order("day", { ascending: false }).limit(4),
    supabase.from("ng_platform_stats").select("*").order("day", { ascending: false }).limit(9),
  ]);
  const history = (snaps.data ?? []) as Snapshot[];
  const buildings = (blds.data ?? []) as Building[];
  const citizens = (cits.data ?? []) as Citizen[];
  const pollList = (polls.data ?? []) as Poll[];
  const reports = (reps.data ?? []) as Report[];
  const latest = history.at(-1) ?? null;
  const platRows = ((plats.data ?? []) as PlatformStat[]).filter((p) => p.day === latest?.day);
  const next = buildings.find((b) => b.built_day == null) ?? null;
  const req = next ? requirements(next, latest) : null;
  const tn = latest ? nextTier(latest.penduduk) : null;
  const openPolls = pollList.filter((p) => p.status === "open");
  const lastClosed = pollList.find((p) => p.status === "closed");
  const topInfluence = [...citizens].sort((a, b) => b.pengaruh - a.pengaruh).slice(0, 10);
  const topCoins = [...citizens].sort((a, b) => b.coins - a.coins).slice(0, 10);

  return (
    <div className="wrap">
      <div className="top">
        <div><h1>NEGARA GUE</h1><div className="empty">Hari ke-{latest?.day ?? 0} · status negara live</div></div>
        <Link href="/world" className="tier" style={{ textDecoration: "none", borderColor: "var(--lime)", color: "var(--lime)" }}>🌐 Lihat Dunia</Link>
        <div className="tier">{latest?.tier ?? "Dusun Digital"}{tn && latest ? ` → ${tn.name} (${fmt(tn.min - latest.penduduk)} lagi)` : ""}</div>
      </div>

      <h2>Skor negara (IG + YouTube + TikTok)</h2>
      <div className="card" style={{ textAlign: "center", borderColor: "var(--lime)" }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: "var(--lime)" }}>{fmt(latest?.score ?? 0)}</div>
        <div className="empty">satu angka gabungan dari semua platform</div>
      </div>
      <div className="grid g4" style={{ marginTop: 12 }}>
        {KPI.map((k) => (
          <div className="card kpi" key={k.key} style={{ borderColor: k.color }}>
            <div className="l">{k.label} · {k.ig}</div>
            <div className="n" style={{ color: k.color }}>{fmt(latest ? (latest as never)[k.key] : 0)}</div>
            <div className="d">{k.desc}</div>
          </div>
        ))}
      </div>
      {platRows.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <table><thead><tr><th>Platform</th><th>Follower</th><th>Like</th><th>Share</th><th>Komen</th><th>Views</th></tr></thead><tbody>
            {platRows.map((p) => <tr key={p.platform}><td>{PLAT[p.platform] ?? p.platform}</td><td>{fmt(p.followers)}</td><td>{fmt(p.likes)}</td><td>{fmt(p.shares)}</td><td>{fmt(p.comments)}</td><td>{fmt(p.views)}</td></tr>)}
          </tbody></table>
        </div>
      )}

      <h2>Polling warga</h2>
      {openPolls.length ? openPolls.map((p) => <PollCard key={p.id} p={p} />) : <p className="empty">Belum ada polling terbuka. Admin bisa membuatnya dari dashboard.</p>}
      {lastClosed && <><h2>Hasil polling terakhir</h2><PollCard p={lastClosed} /></>}

      <h2>Target pembangunan berikutnya</h2>
      <div className="card">
        {next && req ? (
          <>
            <b style={{ fontSize: 20 }}>{next.name}</b> <span className={`badge ${req.ready ? "ok" : ""}`}>{req.ready ? "siap dibangun" : "belum cukup"}</span>
            {req.rows.map((r) => (
              <div key={r.key}>
                <div className="row"><span style={{ textTransform: "capitalize" }}>{r.key}</span><span>{fmt(r.have)} / {fmt(r.need)}</span></div>
                <div className="bar"><i style={{ width: `${r.pct}%`, background: r.pct >= 100 ? "var(--lime)" : "var(--line)" }} /></div>
              </div>
            ))}
          </>
        ) : <p className="empty">Semua bangunan sudah berdiri 🎉</p>}
      </div>

      <div className="grid g2">
        <div>
          <h2>Warga paling berpengaruh</h2>
          <div className="card">
            {topInfluence.length ? <table><thead><tr><th>Warga</th><th>Pengaruh</th><th>Mention</th></tr></thead><tbody>
              {topInfluence.map((c) => <tr key={c.platform + c.handle}><td>@{c.handle} <span className="badge">{PLAT[c.platform] ?? c.platform}</span></td><td>{fmt(c.pengaruh)}</td><td>{c.mentions}</td></tr>)}
            </tbody></table> : <p className="empty">Belum ada data warga.</p>}
            <p className="empty">Pengaruh = mention/tag akun negara (+5) dan like pada komen mereka.</p>
          </div>
        </div>
        <div>
          <h2>Koin terbanyak</h2>
          <div className="card">
            {topCoins.length ? <table><thead><tr><th>Warga</th><th>Koin</th><th>Komen</th></tr></thead><tbody>
              {topCoins.map((c) => <tr key={c.platform + c.handle}><td>@{c.handle}</td><td>{fmt(c.coins)}</td><td>{c.comments}</td></tr>)}
            </tbody></table> : <p className="empty">Belum ada data warga.</p>}
            <p className="empty">Koin dari komen (+1), like pada komen (+2), dan suara polling (+3). Instagram tidak membuka data like/share per orang.</p>
          </div>
        </div>
      </div>

      <h2>Bangunan</h2>
      <div className="card">
        <table><tbody>
          {buildings.map((b) => (
            <tr key={b.id}><td>{b.name}{b.custom ? " ★" : ""}</td><td>{b.built_day != null ? <span className="badge ok">Day {b.built_day}</span> : <span className="badge lock">terkunci</span>}</td></tr>
          ))}
        </tbody></table>
        <p className="empty">★ = dibangun dari hasil polling warga.</p>
      </div>

      <h2>Laporan</h2>
      {reports.length ? reports.map((r) => (
        <div className="card" key={r.id} style={{ marginBottom: 10 }}>
          <b>{r.title}</b>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, color: "var(--text)", margin: "8px 0 0" }}>{r.body}</pre>
        </div>
      )) : <p className="empty">Belum ada laporan.</p>}

      <h2>Riwayat penduduk</h2>
      <div className="card">
        {history.length > 1 ? <Spark data={history.map((h) => h.penduduk)} /> : <p className="empty">Butuh minimal 2 hari data.</p>}
      </div>
      <p className="empty" style={{ marginTop: 24 }}><Link href="/admin">Admin</Link></p>
    </div>
  );
}

function PollCard({ p }: { p: Poll }) {
  const opts = [...(p.ng_poll_options ?? [])].sort((a, b) => a.idx - b.idx);
  const total = opts.reduce((s, o) => s + o.votes, 0);
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <b style={{ fontSize: 18 }}>{p.title}</b> <span className={`badge ${p.status === "closed" ? "ok" : ""}`}>{p.status === "open" ? `terbuka · tutup hari ke-${p.closes_day ?? "?"}` : "selesai"}</span>
      <div className="empty">{p.question}</div>
      {opts.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        return (
          <div key={o.id}>
            <div className="row"><span>{String.fromCharCode(65 + o.idx)}) {o.label}{p.winner_idx === o.idx ? " 🏆" : ""}</span><span>{o.votes} suara · {pct}%</span></div>
            <div className="bar"><i style={{ width: `${pct}%`, background: p.winner_idx === o.idx ? "var(--lime)" : "var(--line)" }} /></div>
          </div>
        );
      })}
      {p.status === "open" && <p className="empty">Cara voting: komen huruf atau nama pilihan di video terbaru (kuorum {p.quorum} suara). Satu orang satu suara.</p>}
    </div>
  );
}

function Spark({ data }: { data: number[] }) {
  const w = 600, h = 120, max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 10) - 5}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="120" role="img" aria-label="Riwayat penduduk"><polyline points={pts} fill="none" stroke="#37e9ff" strokeWidth="3" /></svg>;
}
