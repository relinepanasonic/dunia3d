"use client";
import Link from "next/link";
import { useState } from "react";
import { KPI, nextTier, requirements, type Building, type Citizen, type PlatformStat, type Poll, type Report, type Snapshot } from "@/lib/game";

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const PLAT: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", web: "Web" };
type Tab = "ringkasan" | "polling" | "warga" | "laporan";
const TABS: [Tab, string][] = [["ringkasan", "Ringkasan"], ["polling", "Polling"], ["warga", "Warga"], ["laporan", "Laporan"]];

export type HomeData = { history: Snapshot[]; buildings: Building[]; citizens: Citizen[]; polls: Poll[]; reports: Report[]; platRows: PlatformStat[] };

export default function HomeView({ d }: { d: HomeData }) {
  const [tab, setTab] = useState<Tab>("ringkasan");
  const latest = d.history.at(-1) ?? null;
  const next = d.buildings.find((b) => b.built_day == null) ?? null;
  const req = next ? requirements(next, latest) : null;
  const tn = latest ? nextTier(latest.penduduk) : null;
  const openPolls = d.polls.filter((p) => p.status === "open");
  const closed = d.polls.filter((p) => p.status === "closed");
  const topInfluence = [...d.citizens].sort((a, b) => b.pengaruh - a.pengaruh).slice(0, 10);
  const topCoins = [...d.citizens].sort((a, b) => b.coins - a.coins).slice(0, 10);

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Hari ke-{latest?.day ?? 0} · {latest?.tier ?? "Dusun Digital"}{tn && latest ? ` · ${fmt(tn.min - latest.penduduk)} penduduk lagi ke ${tn.name}` : ""}</div>
        </div>
        <div className="seg" role="tablist">{TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>)}</div>
      </div>

      {tab === "ringkasan" && (<>
        <div className="card hero">
          <div className="l" style={{ color: "var(--dim)", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600 }}>Skor negara · IG + YouTube + TikTok</div>
          <div className="big" style={{ color: "var(--lime)", marginTop: 8 }}>{fmt(latest?.score ?? 0)}</div>
        </div>
        <div className="grid g4" style={{ marginTop: 12 }}>
          {KPI.map((k) => (
            <div className="card kpi" key={k.key}>
              <div className="l">{k.label} · {k.ig}</div>
              <div className="n" style={{ color: k.color }}>{fmt(latest ? (latest as never)[k.key] : 0)}</div>
              <div className="d">{k.desc}</div>
            </div>
          ))}
        </div>
        {d.platRows.length > 0 && (
          <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
            <table><thead><tr><th>Platform</th><th>Follower</th><th>Like</th><th>Share</th><th>Komen</th><th>Views</th></tr></thead><tbody>
              {d.platRows.map((p) => <tr key={p.platform}><td>{PLAT[p.platform] ?? p.platform}</td><td>{fmt(p.followers)}</td><td>{fmt(p.likes)}</td><td>{fmt(p.shares)}</td><td>{fmt(p.comments)}</td><td>{fmt(p.views)}</td></tr>)}
            </tbody></table>
          </div>
        )}

        <h2>Target pembangunan berikutnya</h2>
        <div className="card">
          {next && req ? (<>
            <b style={{ fontSize: 20 }}>{next.name}</b> <span className={`badge ${req.ready ? "ok" : ""}`}>{req.ready ? "siap dibangun" : "belum cukup"}</span>
            {req.rows.map((r) => (
              <div key={r.key}>
                <div className="row"><span style={{ textTransform: "capitalize" }}>{r.key}</span><span>{fmt(r.have)} / {fmt(r.need)}</span></div>
                <div className="bar"><i style={{ width: `${r.pct}%`, background: r.pct >= 100 ? "var(--lime)" : "var(--accent)" }} /></div>
              </div>
            ))}
          </>) : <p className="empty">Semua bangunan sudah berdiri 🎉</p>}
        </div>

        <h2>Bangunan</h2>
        <div className="card"><table><tbody>
          {d.buildings.map((b) => <tr key={b.id}><td>{b.name}{b.custom ? " ★" : ""}</td><td style={{ textAlign: "right" }}>{b.built_day != null ? <span className="badge ok">Day {b.built_day}</span> : <span className="badge lock">terkunci</span>}</td></tr>)}
        </tbody></table><p className="empty" style={{ margin: "8px 0 0" }}>★ = dibangun dari hasil polling warga.</p></div>

        <h2>Riwayat penduduk</h2>
        <div className="card">{d.history.length > 1 ? <Spark data={d.history.map((h) => h.penduduk)} /> : <p className="empty">Butuh minimal 2 hari data.</p>}</div>
      </>)}

      {tab === "polling" && (<>
        <h2>Terbuka</h2>
        {openPolls.length ? openPolls.map((p) => <PollCard key={p.id} p={p} />) : <div className="card"><p className="empty" style={{ margin: 0 }}>Belum ada polling terbuka. Admin bisa membuatnya dari halaman Admin.</p></div>}
        <h2>Selesai</h2>
        {closed.length ? closed.map((p) => <PollCard key={p.id} p={p} />) : <div className="card"><p className="empty" style={{ margin: 0 }}>Belum ada hasil polling.</p></div>}
      </>)}

      {tab === "warga" && (
        <div className="grid g2">
          <div>
            <h2>Paling berpengaruh</h2>
            <div className="card">
              {topInfluence.length ? <table><thead><tr><th>Warga</th><th>Pengaruh</th><th>Mention</th></tr></thead><tbody>
                {topInfluence.map((c) => <tr key={c.platform + c.handle}><td>@{c.handle} <span className="badge">{PLAT[c.platform] ?? c.platform}</span></td><td>{fmt(c.pengaruh)}</td><td>{c.mentions}</td></tr>)}
              </tbody></table> : <p className="empty">Belum ada data warga.</p>}
              <p className="empty">Pengaruh = tag/mention akun negara (+5) dan like pada komen mereka.</p>
            </div>
          </div>
          <div>
            <h2>Koin terbanyak</h2>
            <div className="card">
              {topCoins.length ? <table><thead><tr><th>Warga</th><th>Koin</th><th>Komen</th></tr></thead><tbody>
                {topCoins.map((c) => <tr key={c.platform + c.handle}><td>@{c.handle}</td><td>{fmt(c.coins)}</td><td>{c.comments}</td></tr>)}
              </tbody></table> : <p className="empty">Belum ada data warga.</p>}
              <p className="empty">Koin dari komen, suara polling, dividen pajak (like + share), check-in dan referral. <Link href="/play" style={{ color: "var(--accent)" }}>Jadi warga →</Link></p>
            </div>
          </div>
        </div>
      )}

      {tab === "laporan" && (<>
        <h2>Laporan terbaru</h2>
        {d.reports.length ? d.reports.map((r) => (
          <div className="card" key={r.id} style={{ marginBottom: 10 }}>
            <b>{r.title}</b>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, color: "var(--text)", margin: "10px 0 0", lineHeight: 1.6 }}>{r.body}</pre>
          </div>
        )) : <div className="card"><p className="empty" style={{ margin: 0 }}>Belum ada laporan.</p></div>}
      </>)}
    </div>
  );
}

function PollCard({ p }: { p: Poll }) {
  const opts = [...(p.ng_poll_options ?? [])].sort((a, b) => a.idx - b.idx);
  const total = opts.reduce((s, o) => s + o.votes, 0);
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <b style={{ fontSize: 18 }}>{p.title}</b> {p.kind === "name" && <span className="badge">nama negara</span>} <span className={`badge ${p.status === "closed" ? "ok" : ""}`}>{p.status === "open" ? `tutup hari ke-${p.closes_day ?? "?"}` : "selesai"}</span>
      <div className="empty" style={{ marginTop: 4 }}>{p.question}</div>
      {opts.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        return (
          <div key={o.id}>
            <div className="row"><span>{String.fromCharCode(65 + o.idx)}) {o.label}{p.winner_idx === o.idx ? " 🏆" : ""}</span><span>{o.votes} suara · {pct}%</span></div>
            <div className="bar"><i style={{ width: `${pct}%`, background: p.winner_idx === o.idx ? "var(--lime)" : "var(--accent)" }} /></div>
          </div>
        );
      })}
      {p.status === "open" && <p className="empty" style={{ marginBottom: 0 }}>Voting: komen huruf/nama pilihan di video terbaru, atau vote di <Link href="/play" style={{ color: "var(--accent)" }}>halaman Warga</Link> (kuorum {p.quorum}).</p>}
    </div>
  );
}

function Spark({ data }: { data: number[] }) {
  const w = 600, h = 120, max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 10) - 5}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="120" role="img" aria-label="Riwayat penduduk"><polyline points={pts} fill="none" stroke="#7dd3fc" strokeWidth="3" strokeLinejoin="round" /></svg>;
}
