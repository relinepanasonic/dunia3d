"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase, configured } from "@/lib/supabase";
import { STYLES, type Building, type Duel, type Poll, type Report } from "@/lib/game";

type Cm = { id: number; day: number | null; ig_user: string; text: string; likes: number; status: string; platform?: string; used_day?: number | null };
type Ep = { day: number; title: string | null; caption: string | null; hashtags?: string[] | null; video_url: string | null; status: string; platforms: Record<string, { id?: string; error?: string }> | null };
const PLATS = ["instagram", "tiktok", "youtube"] as const;
type Plat = (typeof PLATS)[number];
const PLAT_LABEL: Record<Plat, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };
const MKEYS = ["followers", "likes", "shares", "comments", "views"] as const;
type MRow = Record<(typeof MKEYS)[number], number>;
const MLABEL: Record<(typeof MKEYS)[number], string> = { followers: "Follower", likes: "Total like", shares: "Total share", comments: "Total komen", views: "Total views" };
const zeroRow = (): MRow => ({ followers: 0, likes: 0, shares: 0, comments: 0, views: 0 });
const fullCaption = (e: Ep) => [e.caption ?? "", (e.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n");
type Opt = { label: string; building_name: string; style: number; pajak: number };

const blankOpt = (): Opt => ({ label: "", building_name: "", style: 0, pajak: 150 });

export default function Admin() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [blds, setBlds] = useState<Building[]>([]);
  const [cms, setCms] = useState<Cm[]>([]); const [eps, setEps] = useState<Ep[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]); const [reports, setReports] = useState<Report[]>([]);
  const [lastDay, setLastDay] = useState(0);
  const [man, setMan] = useState<Record<Plat, MRow>>({ instagram: zeroRow(), tiktok: zeroRow(), youtube: zeroRow() });
  const [manDay, setManDay] = useState<Record<string, number>>({});
  const [dl, setDl] = useState<Record<string, Record<string, Record<Plat, number>>>>({});
  const [nc, setNc] = useState({ ig_user: "", text: "", likes: 0, platform: "instagram" });
  const [np, setNp] = useState({ title: "", question: "", closes_day: 0, quorum: 3, kind: "building" });
  const [brand, setBrand] = useState("");
  const [duels, setDuels] = useState<Duel[]>([]);
  const [du, setDu] = useState({ day: 0, min: 0, a: "", b: "", cname: "", cstyle: 0, cpitch: "" });
  const [opts, setOpts] = useState<Opt[]>([blankOpt(), blankOpt()]);

  const load = useCallback(async () => {
    const [b, c, e, a, p, r, s, br, dl] = await Promise.all([
      supabase.from("ng_buildings").select("*").order("slot"),
      supabase.from("ng_comments").select("*").order("likes", { ascending: false }).limit(100),
      supabase.from("ng_episodes").select("*").order("day", { ascending: false }),
      supabase.from("ng_admins").select("email"),
      supabase.from("ng_polls").select("*, ng_poll_options(*)").order("created_at", { ascending: false }),
      supabase.from("ng_reports").select("*").order("day", { ascending: false }).limit(5),
      supabase.from("ng_snapshots").select("day").order("day", { ascending: false }).limit(1),
      supabase.from("ng_state").select("value").eq("key", "brand").maybeSingle(),
      supabase.from("ng_duels").select("*").order("day", { ascending: false }).limit(8),
    ]);
    const ms = await supabase.from("ng_manual_stats").select("*").order("day", { ascending: false }).limit(60);
    if (!ms.error) {
      const seen: Record<string, number> = {}; const next = { instagram: zeroRow(), tiktok: zeroRow(), youtube: zeroRow() } as Record<Plat, MRow>;
      for (const r of ms.data ?? []) if (!(r.platform in seen)) { seen[r.platform] = r.day; next[r.platform as Plat] = Object.fromEntries(MKEYS.map((k) => [k, r[k] ?? 0])) as MRow; }
      setMan(next); setManDay(seen);
    }
    const dlInit: Record<string, Record<string, Record<Plat, number>>> = {};
    for (const x of (dl.data ?? []) as Duel[]) {
      dlInit[x.id] = Object.fromEntries(x.options.map((o) => [o.side, { instagram: 0, tiktok: 0, youtube: 0, ...(o.manual_likes ?? {}) }]));
    }
    setDl(dlInit);
    setDuels((dl.data ?? []) as Duel[]);
    setBrand(((br.data?.value as { name?: string } | null)?.name) ?? "");
    setBlds((b.data ?? []) as Building[]); setCms((c.data ?? []) as Cm[]); setEps((e.data ?? []) as Ep[]);
    setPolls((p.data ?? []) as Poll[]); setReports((r.data ?? []) as Report[]);
    const ld = s.data?.[0]?.day ?? 0; setLastDay(ld); setNp((x) => (x.closes_day ? x : { ...x, closes_day: ld + 2 }));
    setIsAdmin((a.data ?? []).length > 0);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user.email ?? null); if (data.session) load(); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setUser(s?.user.email ?? null); if (s) load(); });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const ok = (m: string) => { setMsg(m); setErr(""); }; const bad = (m: string) => { setErr(m); setMsg(""); };
  async function login() { const { error } = await supabase.auth.signInWithPassword({ email, password: pw }); error ? bad(error.message) : ok("Masuk."); }

  async function saveManual() {
    const day = lastDay + 1;
    const rows = PLATS.filter((p) => MKEYS.some((k) => man[p][k] > 0)).map((p) => ({ day, platform: p, ...man[p], updated_at: new Date().toISOString() }));
    if (!rows.length) return bad("Isi minimal satu platform.");
    const { error } = await supabase.from("ng_manual_stats").upsert(rows, { onConflict: "day,platform" });
    error ? bad(error.message) : (ok(`Angka disimpan untuk run hari ke-${day} (${rows.map((r) => PLAT_LABEL[r.platform]).join(", ")}).`), load());
  }
  async function saveDuelLikes(x: Duel) {
    const m = dl[x.id] ?? {};
    const options = x.options.map((o) => {
      const ml = m[o.side] ?? { instagram: 0, tiktok: 0, youtube: 0 };
      return { ...o, manual_likes: ml, likes: Object.values(ml).reduce((s, v) => s + (+v || 0), 0) };
    });
    const { error } = await supabase.from("ng_duels").update({ options }).eq("id", x.id);
    error ? bad(error.message) : (ok(`Like duel Day ${x.day} disimpan: ${options.map((o) => `${o.side}=${o.likes}`).join(", ")}.`), load());
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); ok(`${what} disalin.`); } catch { bad("Tidak bisa menyalin; pilih teksnya manual."); }
  }
  async function markPosted(day: number) {
    const { error } = await supabase.from("ng_episodes").update({ status: "published", platforms: { manual: { id: "posted by hand" } } }).eq("day", day);
    error ? bad(error.message) : (ok(`Day ${day} ditandai sudah diposting manual.`), load());
  }
  async function addComment() {
    if (!nc.ig_user || !nc.text) return bad("Isi user dan komen.");
    const { error } = await supabase.from("ng_comments").insert({ ...nc, ig_user: nc.ig_user.replace(/^@/, "").trim(), status: "approved" });
    error ? bad(error.message) : (ok("Komen ditambah; dihitung di run berikutnya."), setNc({ ...nc, ig_user: "", text: "", likes: 0 }), load());
  }
  async function setStatus(id: number, status: string) { const { error } = await supabase.from("ng_comments").update({ status }).eq("id", id); error ? bad(error.message) : load(); }
  async function saveBuilding(b: Building) {
    const { error } = await supabase.from("ng_buildings").update({ pajak: b.pajak, inspirasi: b.inspirasi, penduduk: b.penduduk, pengaruh: b.pengaruh }).eq("id", b.id);
    error ? bad(error.message) : ok(`${b.name} diperbarui.`);
  }
  async function setEp(day: number, status: string) { const { error } = await supabase.from("ng_episodes").update({ status }).eq("day", day); error ? bad(error.message) : (ok(`Day ${day}: ${status}`), load()); }

  async function createPoll() {
    const clean = opts.filter((o) => o.label.trim());
    if (!np.title.trim() || !np.question.trim() || clean.length < 2) return bad("Isi judul, pertanyaan, dan minimal 2 opsi.");
    const { data, error } = await supabase.from("ng_polls").insert({ title: np.title, question: np.question, closes_day: np.closes_day, quorum: np.quorum, status: "open", kind: np.kind }).select().single();
    if (error || !data) return bad(error?.message ?? "Gagal membuat polling.");
    const { error: e2 } = await supabase.from("ng_poll_options").insert(clean.map((o, i) => ({
      poll_id: data.id, idx: i, label: o.label.trim(), building_name: o.building_name.trim() || o.label.trim(), style: np.kind === "name" ? 0 : o.style, pajak: np.kind === "name" ? 0 : o.pajak,
      keywords: o.label.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
    })));
    if (e2) return bad(e2.message);
    ok("Polling dibuat. Episode berikutnya akan mengumumkannya; hasil dihitung saat tutup."); setNp({ title: "", question: "", closes_day: lastDay + 2, quorum: 3, kind: "building" }); setOpts([blankOpt(), blankOpt()]); load();
  }
  async function createDuel() {
    const day = du.day || lastDay + 1;
    const pick = (id: string) => blds.find((x) => x.id === id);
    const A = pick(du.a), B = du.b === "custom" ? null : pick(du.b);
    if (!A || (!B && !du.cname.trim())) return bad("Pilih bangunan A dan B (atau isi nama bangunan custom untuk B).");
    const opt = (side: string, x: Building) => ({ side, building_id: x.id, name: x.name, style: x.style ?? 0 });
    const options = [opt("A", A), B ? opt("B", B) : { side: "B", building_id: "custom_" + Date.now(), name: du.cname.trim(), style: du.cstyle, custom: true, pitch: du.cpitch ? [du.cpitch] : undefined }];
    const { error } = await supabase.from("ng_duels").upsert({ day, status: "planned", min_likes: du.min || 30, options }, { onConflict: "day" });
    error ? bad(error.message) : (ok(`Duel Day ${day} dijadwalkan: ${options[0].name} vs ${options[1].name}. Dua reel dibuat otomatis di run harian.`), load());
  }
  async function cancelDuel(id: number) { const { error } = await supabase.from("ng_duels").update({ status: "cancelled" }).eq("id", id); error ? bad(error.message) : load(); }
  async function saveBrand() {
    const name = brand.trim();
    if (name.length < 2 || name.length > 30) return bad("Nama negara 2-30 karakter.");
    const { error } = await supabase.from("ng_state").upsert({ key: "brand", value: { name }, updated_at: new Date().toISOString() });
    error ? bad(error.message) : ok(`Nama negara diubah menjadi "${name}". Tampil di website sekarang, di video mulai run berikutnya.`);
  }
  async function cancelPoll(id: number) { const { error } = await supabase.from("ng_polls").update({ status: "cancelled" }).eq("id", id); error ? bad(error.message) : load(); }
  async function closeNext(id: number) { const { error } = await supabase.from("ng_polls").update({ closes_day: lastDay + 1 }).eq("id", id); error ? bad(error.message) : (ok("Polling ditutup pada run berikutnya."), load()); }

  if (!configured) return <div className="wrap"><p className="empty">Supabase env belum diset.</p></div>;
  if (!user) return (
    <div className="wrap"><h1>Admin</h1>
      <div className="card form" style={{ maxWidth: 420, marginTop: 16 }}>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></label>
        <label>Password<input value={pw} onChange={(e) => setPw(e.target.value)} type="password" /></label>
        <button onClick={login}>Masuk</button>
      </div>
      {err && <p className="msg err">{err}</p>}<p className="empty"><Link href="/">← Halaman publik</Link></p>
    </div>
  );
  if (!isAdmin) return <div className="wrap"><h1>Admin</h1><p className="empty">{user} bukan admin. Tambahkan emailnya ke tabel ng_admins.</p><button className="ghost" onClick={() => supabase.auth.signOut()}>Keluar</button></div>;

  return (
    <div className="wrap">
      <div className="page-head"><div><h1>Admin</h1><div className="sub">{user}</div></div><button className="ghost" onClick={() => supabase.auth.signOut()}>Keluar</button></div>
      {msg && <p className="msg">{msg}</p>}{err && <p className="msg err">{err}</p>}

      <h2>Mode manual: angka dari aplikasi</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <p className="empty" style={{ marginTop: 0 }}>Buka tiap aplikasi sebelum 00:01 WIB dan salin angka <b>total akun</b> (bukan kenaikan harian). Run hari ke-{lastDay + 1} memakai angka ini untuk platform yang API-nya belum terhubung. Kosongkan platform yang belum dipakai.</p>
        <table><thead><tr><th>Platform</th>{MKEYS.map((k) => <th key={k}>{MLABEL[k]}</th>)}<th>Terakhir</th></tr></thead><tbody>
          {PLATS.map((p) => (
            <tr key={p}><td>{PLAT_LABEL[p]}</td>
              {MKEYS.map((k) => <td key={k}><input type="number" min={0} value={man[p][k]} onChange={(e) => setMan({ ...man, [p]: { ...man[p], [k]: Math.max(0, +e.target.value) } })} style={{ width: 96 }} /></td>)}
              <td className="empty">{manDay[p] != null ? `hari ke-${manDay[p]}` : "-"}</td></tr>
          ))}
        </tbody></table>
        <div className="form" style={{ marginTop: 10 }}><button onClick={saveManual}>Simpan angka untuk hari ke-{lastDay + 1}</button></div>
        <p className="empty" style={{ marginBottom: 0 }}>Instagram: Profil → Dasbor profesional → Insight (like/share/komen), follower di profil. TikTok: Profil (follower, like) dan Analitik. YouTube: Studio → Analitik.</p>
      </div>

      <h2>Duel reel (minggu 1)</h2>
      <div className="card">
        <p className="empty" style={{ marginTop: 0 }}>Tanpa isian, run harian otomatis memilih dua bangunan berikutnya dan menghitung minimal like dari jumlah follower. Isi di sini untuk memilih sendiri.</p>
        <div className="form">
          <label>Untuk hari ke-<input type="number" min={lastDay + 1} value={du.day || lastDay + 1} onChange={(e) => setDu({ ...du, day: +e.target.value })} /></label>
          <label>Minimal like<input type="number" min={1} value={du.min || ""} placeholder="auto" onChange={(e) => setDu({ ...du, min: +e.target.value })} /></label>
          <label>Kandidat A<select value={du.a} onChange={(e) => setDu({ ...du, a: e.target.value })}><option value="">pilih…</option>{blds.filter((x) => x.built_day == null).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Kandidat B<select value={du.b} onChange={(e) => setDu({ ...du, b: e.target.value })}><option value="">pilih…</option>{blds.filter((x) => x.built_day == null && x.id !== du.a).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}<option value="custom">+ Custom…</option></select></label>
          {du.b === "custom" && <>
            <label>Nama custom<input value={du.cname} onChange={(e) => setDu({ ...du, cname: e.target.value })} placeholder="Free Meal Center" /></label>
            <label>Model 3D<select value={du.cstyle} onChange={(e) => setDu({ ...du, cstyle: +e.target.value })}>{STYLES.map((s, k) => <option key={k} value={k}>{s}</option>)}</select></label>
            <label style={{ flex: 1 }}>Kalimat promosi<input value={du.cpitch} onChange={(e) => setDu({ ...du, cpitch: e.target.value })} placeholder="Makan gratis untuk semua warga." style={{ width: "100%" }} /></label>
          </>}
          <button onClick={createDuel}>Jadwalkan duel</button>
        </div>
        {duels.length > 0 && <table style={{ marginTop: 12 }}><thead><tr><th>Day</th><th>A vs B</th><th>Minimal</th><th>Status</th><th>Like A / B</th><th /></tr></thead><tbody>
          {duels.map((x) => <tr key={x.id}><td>{x.day}</td><td>{x.options.map((o) => o.name).join(" vs ")}</td><td>{x.min_likes}</td><td><span className="badge">{x.status}</span></td>
            <td>{x.options.map((o) => x.result?.likes?.[o.side] ?? o.likes ?? 0).join(" / ")}</td>
            <td>{(x.status === "planned" || x.status === "open") && <button className="ghost" onClick={() => cancelDuel(x.id)}>Batalkan</button>}</td></tr>)}
        </tbody></table>}
        {duels.filter((x) => x.status === "open").map((x) => (
          <div key={x.id} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <b>Duel Day {x.day} (berlangsung)</b>
            <p className="empty" style={{ margin: "4px 0 8px" }}>Posting dua reel ini, lalu salin jumlah like tiap reel dari tiap aplikasi sebelum run berikutnya (pemenang dihitung dari angka ini).</p>
            <table><thead><tr><th>Reel</th><th>Video</th>{PLATS.map((p) => <th key={p}>Like {PLAT_LABEL[p]}</th>)}<th>Total</th></tr></thead><tbody>
              {x.options.map((o) => {
                const ml = dl[x.id]?.[o.side] ?? { instagram: 0, tiktok: 0, youtube: 0 };
                const cap = o.caption;
                return (
                  <tr key={o.side}><td>{o.side}) {o.name}</td>
                    <td>{o.video_url ? <a href={o.video_url} download target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Unduh</a> : "-"}{cap && <> · <button className="ghost" onClick={() => copy(cap, `Caption reel ${o.side}`)}>Salin caption</button></>}</td>
                    {PLATS.map((p) => <td key={p}><input type="number" min={0} value={ml[p] ?? 0} style={{ width: 80 }}
                      onChange={(e) => setDl({ ...dl, [x.id]: { ...(dl[x.id] ?? {}), [o.side]: { ...ml, [p]: Math.max(0, +e.target.value) } } })} /></td>)}
                    <td>{Object.values(ml).reduce((s, v) => s + (+v || 0), 0)}</td></tr>
                );
              })}
            </tbody></table>
            <div className="form" style={{ marginTop: 8 }}><button onClick={() => saveDuelLikes(x)}>Simpan like duel</button></div>
          </div>
        ))}
      </div>

      <h2>Nama negara</h2>
      <div className="card form">
        <label style={{ flex: 1 }}>Nama saat ini<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Negara Gue" style={{ width: "100%" }} /></label>
        <button onClick={saveBrand}>Simpan nama</button>
        <p className="empty" style={{ width: "100%", margin: 0 }}>Cara resmi: buat polling jenis &quot;Nama negara&quot; di bawah. Pemenangnya otomatis menjadi nama negara saat polling ditutup.</p>
      </div>

      <h2>Event / polling baru</h2>
      <div className="card">
        <div className="form">
          <label style={{ flex: 1 }}>Judul<input value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} placeholder="Free Meal vs Tower Technology" /></label>
          <label style={{ flex: 2 }}>Pertanyaan<input value={np.question} onChange={(e) => setNp({ ...np, question: e.target.value })} placeholder="Enakan bangun Free Meal dulu atau Tower Technology?" style={{ width: "100%" }} /></label>
          <label>Tutup di hari ke-<input type="number" min={lastDay + 1} value={np.closes_day} onChange={(e) => setNp({ ...np, closes_day: +e.target.value })} /></label>
          <label>Kuorum<input type="number" min={1} value={np.quorum} onChange={(e) => setNp({ ...np, quorum: +e.target.value })} /></label>
          <label>Jenis<select value={np.kind} onChange={(e) => setNp({ ...np, kind: e.target.value })}><option value="building">Bangunan</option><option value="name">Nama negara</option></select></label>
        </div>
        <table style={{ marginTop: 12 }}><thead><tr><th /><th>{np.kind === "name" ? "Usulan nama" : "Pilihan"}</th>{np.kind === "building" && <><th>Nama bangunan jika menang</th><th>Model 3D</th><th>Biaya pajak</th></>}</tr></thead><tbody>
          {opts.map((o, i) => (
            <tr key={i}><td>{String.fromCharCode(65 + i)}</td>
              <td><input value={o.label} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td>
              {np.kind === "building" && <><td><input value={o.building_name} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, building_name: e.target.value } : x))} /></td>
              <td><select value={o.style} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, style: +e.target.value } : x))}>{STYLES.map((s, k) => <option key={k} value={k}>{s}</option>)}</select></td>
              <td><input type="number" min={0} value={o.pajak} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, pajak: +e.target.value } : x))} /></td></>}</tr>
          ))}
        </tbody></table>
        <div className="form" style={{ marginTop: 10 }}>
          {opts.length < (np.kind === "name" ? 6 : 4) && <button className="ghost" onClick={() => setOpts([...opts, blankOpt()])}>+ Opsi</button>}
          <button onClick={createPoll}>Buat polling</button>
        </div>
        <p className="empty">Warga voting lewat komen (huruf pilihan atau nama). Hasil dihitung otomatis saat tutup, bangunan pemenang dibuat, dan laporan muncul di sini dan di video.</p>
      </div>
      <div className="card" style={{ marginTop: 10, overflowX: "auto" }}>
        {polls.length ? <table><thead><tr><th>Polling</th><th>Status</th><th>Suara</th><th /></tr></thead><tbody>
          {polls.map((p) => (
            <tr key={p.id}><td>{p.title} {p.kind === "name" && <span className="badge">nama negara</span>}<div className="empty">tutup hari ke-{p.closes_day ?? "?"}</div></td><td><span className="badge">{p.status}</span></td>
              <td>{[...(p.ng_poll_options ?? [])].sort((a, b) => a.idx - b.idx).map((o) => `${o.label}: ${o.votes}`).join(" · ")}</td>
              <td>{p.status === "open" && <><button className="ghost" onClick={() => closeNext(p.id)}>Tutup di run berikutnya</button> <button className="ghost" onClick={() => cancelPoll(p.id)}>Batalkan</button></>}</td></tr>
          ))}
        </tbody></table> : <p className="empty">Belum ada polling.</p>}
      </div>

      <h2>Episode (persetujuan upload)</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        {eps.length ? <table><thead><tr><th>Day</th><th>Judul</th><th>Status</th><th>Platform</th><th /></tr></thead><tbody>
          {eps.map((e) => (
            <tr key={e.day}><td>{e.day}</td><td>{e.title}</td><td><span className="badge">{e.status}</span></td>
              <td>{Object.entries(e.platforms ?? {}).map(([k, v]) => `${k}: ${v.id ?? v.error ?? "-"}`).join(" · ")}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {e.video_url && <a href={e.video_url} download target="_blank" rel="noreferrer" style={{ color: "var(--accent)", marginRight: 8 }}>Unduh video</a>}
                {e.caption && <button className="ghost" onClick={() => copy(fullCaption(e), `Caption Day ${e.day}`)}>Salin caption</button>}{" "}
                {e.status !== "published" && <button className="ghost" onClick={() => markPosted(e.day)}>Sudah diposting manual</button>}{" "}
                {e.status === "draft" && <button onClick={() => setEp(e.day, "approved")}>Setujui upload otomatis</button>}</td></tr>
          ))}
        </tbody></table> : <p className="empty">Belum ada episode. Pipeline akan mengisi tabel ini.</p>}
      </div>

      <h2>Laporan terbaru</h2>
      {reports.map((r) => <div className="card" key={r.id} style={{ marginBottom: 10 }}><b>{r.title}</b><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, margin: "8px 0 0" }}>{r.body}</pre></div>)}

      <h2>Syarat bangunan (threshold)</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table><thead><tr><th>Bangunan</th><th>Pajak</th><th>Komen min.</th><th>Penduduk</th><th>Pengaruh</th><th /></tr></thead><tbody>
          {blds.map((b, i) => (
            <tr key={b.id}><td>{b.name}{b.custom ? " ★" : ""}</td>
              {(["pajak", "inspirasi", "penduduk", "pengaruh"] as const).map((k) => (
                <td key={k}><input type="number" min={0} value={b[k]} onChange={(e) => setBlds(blds.map((x, j) => j === i ? { ...x, [k]: +e.target.value } : x))} /></td>
              ))}
              <td><button onClick={() => saveBuilding(b)}>Simpan</button></td></tr>
          ))}
        </tbody></table>
        <p className="empty">Catatan: pipeline membaca syarat dari series/game.json; samakan perubahan di sana (sinkronisasi dua arah menyusul).</p>
      </div>

      <h2>Komen / ide manual</h2>
      <div className="card form" style={{ marginBottom: 12 }}>
        <label>Platform<select value={nc.platform} onChange={(e) => setNc({ ...nc, platform: e.target.value })}>{PLATS.map((p) => <option key={p} value={p}>{PLAT_LABEL[p]}</option>)}</select></label>
        <label>User<input value={nc.ig_user} onChange={(e) => setNc({ ...nc, ig_user: e.target.value })} placeholder="tanpa @" /></label>
        <label style={{ flex: 1 }}>Komen<input value={nc.text} onChange={(e) => setNc({ ...nc, text: e.target.value })} /></label>
        <label>Like<input type="number" min={0} value={nc.likes} onChange={(e) => setNc({ ...nc, likes: +e.target.value })} /></label>
        <button onClick={addComment}>Tambah</button>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <p className="empty" style={{ marginTop: 0 }}>Salin komen penting (vote polling, kode NG-…, ide) dari aplikasi. Tiap komen dihitung sekali (koin, suara) di run berikutnya.</p>
        <table><thead><tr><th>User</th><th>Komen</th><th>Like</th><th>Status</th><th>Dihitung</th><th /></tr></thead><tbody>
          {cms.map((c) => (
            <tr key={c.id}><td>@{c.ig_user} <span className="badge">{PLAT_LABEL[(c.platform ?? "instagram") as Plat] ?? c.platform}</span></td><td>{c.text}</td><td>{c.likes}</td><td><span className="badge">{c.status}</span></td>
              <td className="empty">{c.used_day != null ? `hari ke-${c.used_day}` : "belum"}</td>
              <td>{c.status !== "approved" && <button className="ghost" onClick={() => setStatus(c.id, "approved")}>Setujui</button>} <button className="ghost" onClick={() => setStatus(c.id, "rejected")}>Tolak</button></td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
