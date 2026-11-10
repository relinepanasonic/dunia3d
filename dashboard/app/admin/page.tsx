"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase, configured } from "@/lib/supabase";
import { STYLES, type Building, type Poll, type Report } from "@/lib/game";

type Cm = { id: number; day: number | null; ig_user: string; text: string; likes: number; status: string };
type Ep = { day: number; title: string | null; caption: string | null; video_url: string | null; status: string; platforms: Record<string, { id?: string; error?: string }> | null };
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
  const [ig, setIg] = useState({ followers: 0, likes: 0, shares: 0, comments: 0 });
  const [nc, setNc] = useState({ ig_user: "", text: "", likes: 0 });
  const [np, setNp] = useState({ title: "", question: "", closes_day: 0, quorum: 3 });
  const [opts, setOpts] = useState<Opt[]>([blankOpt(), blankOpt()]);

  const load = useCallback(async () => {
    const [b, c, e, a, p, r, s] = await Promise.all([
      supabase.from("ng_buildings").select("*").order("slot"),
      supabase.from("ng_comments").select("*").order("likes", { ascending: false }).limit(100),
      supabase.from("ng_episodes").select("*").order("day", { ascending: false }),
      supabase.from("ng_admins").select("email"),
      supabase.from("ng_polls").select("*, ng_poll_options(*)").order("created_at", { ascending: false }),
      supabase.from("ng_reports").select("*").order("day", { ascending: false }).limit(5),
      supabase.from("ng_snapshots").select("day").order("day", { ascending: false }).limit(1),
    ]);
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

  async function saveInputs() {
    const { error } = await supabase.from("ng_inputs").insert(ig); error ? bad(error.message) : ok("Angka IG disimpan (dipakai jika platform belum terhubung).");
  }
  async function addComment() {
    if (!nc.ig_user || !nc.text) return bad("Isi user dan komen.");
    const { error } = await supabase.from("ng_comments").insert({ ...nc, status: "approved" }); error ? bad(error.message) : (ok("Komen ditambah."), setNc({ ig_user: "", text: "", likes: 0 }), load());
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
    const { data, error } = await supabase.from("ng_polls").insert({ title: np.title, question: np.question, closes_day: np.closes_day, quorum: np.quorum, status: "open" }).select().single();
    if (error || !data) return bad(error?.message ?? "Gagal membuat polling.");
    const { error: e2 } = await supabase.from("ng_poll_options").insert(clean.map((o, i) => ({
      poll_id: data.id, idx: i, label: o.label.trim(), building_name: o.building_name.trim() || o.label.trim(), style: o.style, pajak: o.pajak,
      keywords: o.label.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
    })));
    if (e2) return bad(e2.message);
    ok("Polling dibuat. Episode berikutnya akan mengumumkannya; hasil dihitung saat tutup."); setNp({ title: "", question: "", closes_day: lastDay + 2, quorum: 3 }); setOpts([blankOpt(), blankOpt()]); load();
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

      <h2>Event / polling baru</h2>
      <div className="card">
        <div className="form">
          <label style={{ flex: 1 }}>Judul<input value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} placeholder="Free Meal vs Tower Technology" /></label>
          <label style={{ flex: 2 }}>Pertanyaan<input value={np.question} onChange={(e) => setNp({ ...np, question: e.target.value })} placeholder="Enakan bangun Free Meal dulu atau Tower Technology?" style={{ width: "100%" }} /></label>
          <label>Tutup di hari ke-<input type="number" min={lastDay + 1} value={np.closes_day} onChange={(e) => setNp({ ...np, closes_day: +e.target.value })} /></label>
          <label>Kuorum<input type="number" min={1} value={np.quorum} onChange={(e) => setNp({ ...np, quorum: +e.target.value })} /></label>
        </div>
        <table style={{ marginTop: 12 }}><thead><tr><th /><th>Pilihan</th><th>Nama bangunan jika menang</th><th>Model 3D</th><th>Biaya pajak</th></tr></thead><tbody>
          {opts.map((o, i) => (
            <tr key={i}><td>{String.fromCharCode(65 + i)}</td>
              <td><input value={o.label} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td>
              <td><input value={o.building_name} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, building_name: e.target.value } : x))} /></td>
              <td><select value={o.style} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, style: +e.target.value } : x))}>{STYLES.map((s, k) => <option key={k} value={k}>{s}</option>)}</select></td>
              <td><input type="number" min={0} value={o.pajak} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, pajak: +e.target.value } : x))} /></td></tr>
          ))}
        </tbody></table>
        <div className="form" style={{ marginTop: 10 }}>
          {opts.length < 4 && <button className="ghost" onClick={() => setOpts([...opts, blankOpt()])}>+ Opsi</button>}
          <button onClick={createPoll}>Buat polling</button>
        </div>
        <p className="empty">Warga voting lewat komen (huruf pilihan atau nama). Hasil dihitung otomatis saat tutup, bangunan pemenang dibuat, dan laporan muncul di sini dan di video.</p>
      </div>
      <div className="card" style={{ marginTop: 10, overflowX: "auto" }}>
        {polls.length ? <table><thead><tr><th>Polling</th><th>Status</th><th>Suara</th><th /></tr></thead><tbody>
          {polls.map((p) => (
            <tr key={p.id}><td>{p.title}<div className="empty">tutup hari ke-{p.closes_day ?? "?"}</div></td><td><span className="badge">{p.status}</span></td>
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
              <td>{e.status === "draft" && <button onClick={() => setEp(e.day, "approved")}>Setujui upload</button>}</td></tr>
          ))}
        </tbody></table> : <p className="empty">Belum ada episode. Pipeline akan mengisi tabel ini.</p>}
      </div>

      <h2>Laporan terbaru</h2>
      {reports.map((r) => <div className="card" key={r.id} style={{ marginBottom: 10 }}><b>{r.title}</b><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, margin: "8px 0 0" }}>{r.body}</pre></div>)}

      <h2>Angka manual (cadangan jika platform belum terhubung)</h2>
      <div className="card form">
        {(["followers", "likes", "shares", "comments"] as const).map((k) => (
          <label key={k}>{{ followers: "Follower (penduduk)", likes: "Like (pajak)", shares: "Share (pengaruh)", comments: "Komen (inspirasi)" }[k]}
            <input type="number" min={0} value={ig[k]} onChange={(e) => setIg({ ...ig, [k]: +e.target.value })} /></label>
        ))}
        <button onClick={saveInputs}>Simpan</button>
      </div>

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
        <label>User<input value={nc.ig_user} onChange={(e) => setNc({ ...nc, ig_user: e.target.value })} /></label>
        <label style={{ flex: 1 }}>Komen<input value={nc.text} onChange={(e) => setNc({ ...nc, text: e.target.value })} /></label>
        <label>Like<input type="number" min={0} value={nc.likes} onChange={(e) => setNc({ ...nc, likes: +e.target.value })} /></label>
        <button onClick={addComment}>Tambah</button>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table><thead><tr><th>User</th><th>Komen</th><th>Like</th><th>Status</th><th /></tr></thead><tbody>
          {cms.map((c) => (
            <tr key={c.id}><td>@{c.ig_user}</td><td>{c.text}</td><td>{c.likes}</td><td><span className="badge">{c.status}</span></td>
              <td>{c.status !== "approved" && <button className="ghost" onClick={() => setStatus(c.id, "approved")}>Setujui</button>} <button className="ghost" onClick={() => setStatus(c.id, "rejected")}>Tolak</button></td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
