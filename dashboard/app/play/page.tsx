"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, configured } from "@/lib/supabase";
import { HOUSES, type Poll } from "@/lib/game";

type Account = { user_id: string; username: string; ref_code: string; claim_code: string; citizen_id: number | null; verified: boolean; claimed_platform: string | null; claimed_handle: string | null };
type Tx = { id: number; amount: number; reason: string; created_at: string };
type Pod = { level: number; coins: number; pengaruh: number };

const REASON: Record<string, string> = { signup: "Bonus daftar", checkin: "Check-in harian", referral: "Teman daftar lewat linkmu", click: "Klik linkmu", vote: "Suara polling", claim: "Akun IG terhubung", upgrade: "Upgrade rumah" };
const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);

export default function Play() { return <Suspense fallback={<div className="wrap"><p className="empty">Memuat…</p></div>}><PlayInner /></Suspense>; }

function PlayInner() {
  const params = useSearchParams();
  const [session, setSession] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [username, setUsername] = useState("");
  const [acc, setAcc] = useState<Account | null>(null); const [pod, setPod] = useState<Pod | null>(null);
  const [bal, setBal] = useState(0); const [txs, setTxs] = useState<Tx[]>([]); const [polls, setPolls] = useState<Poll[]>([]);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ref = params.get("ref") ?? (typeof window !== "undefined" ? localStorage.getItem("ng_ref") : null);

  const ok = (m: string) => { setMsg(m); setErr(""); }; const bad = (m: string) => { setErr(m); setMsg(""); };

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("ng_accounts").select("*").maybeSingle();
    setAcc((a as Account) ?? null);
    if (!a) return;
    const [b, t, p, c] = await Promise.all([
      supabase.rpc("ng_balance"),
      supabase.from("ng_wallet_tx").select("*").order("id", { ascending: false }).limit(15),
      supabase.from("ng_polls").select("*, ng_poll_options(*)").eq("status", "open"),
      supabase.from("ng_citizens").select("level,coins,pengaruh").eq("id", (a as Account).citizen_id ?? -1).maybeSingle(),
    ]);
    setBal((b.data as number) ?? 0); setTxs((t.data ?? []) as Tx[]); setPolls((p.data ?? []) as Poll[]); setPod((c.data as Pod) ?? null);
  }, []);

  const createProfile = useCallback(async (name: string) => {
    const { error } = await supabase.rpc("ng_signup_profile", { p_username: name, p_ref: ref });
    if (error) { bad(error.message); return false; }
    localStorage.removeItem("ng_pending_username"); localStorage.removeItem("ng_ref"); ok("Selamat datang! Rumah pod gratis sudah dibuat."); await load(); return true;
  }, [ref, load]);

  useEffect(() => {
    if (!configured) return;
    const init = async (has: boolean) => {
      setSession(has);
      if (!has) return;
      await load();
      const pending = localStorage.getItem("ng_pending_username");
      const { data: a } = await supabase.from("ng_accounts").select("user_id").maybeSingle();
      if (!a && pending) await createProfile(pending);
    };
    supabase.auth.getSession().then(({ data }) => init(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { init(!!s); });
    return () => sub.subscription.unsubscribe();
  }, [load, createProfile]);

  async function submit() {
    setBusy(true); setErr(""); setMsg("");
    try {
      if (mode === "signup") {
        if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) return bad("Username 3-20 karakter: huruf, angka, _ atau .");
        localStorage.setItem("ng_pending_username", username);
        const { data, error } = await supabase.auth.signUp({ email, password: pw });
        if (error) return bad(error.message);
        if (!data.session) ok("Cek emailmu untuk konfirmasi, lalu masuk. Rumah podmu menunggu!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) bad(error.message);
      }
    } finally { setBusy(false); }
  }
  async function act(fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, done: (d: Record<string, unknown>) => string) {
    setBusy(true);
    const { data, error } = await fn(); setBusy(false);
    if (error) return bad(error.message);
    ok(done((data ?? {}) as Record<string, unknown>)); load();
  }

  if (!configured) return <div className="wrap"><p className="empty">Supabase belum dikonfigurasi.</p></div>;
  if (session === null) return <div className="wrap"><p className="empty">Memuat…</p></div>;

  const link = typeof window !== "undefined" && acc ? `${window.location.origin}/r/${acc.ref_code}` : "";
  const next = pod && pod.level < 5 ? HOUSES[pod.level] : null;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="page-head"><div><h1>Jadi Warga</h1><div className="sub">Rumah pod gratis, dompet koin, check-in harian, dan link referral.</div></div></div>
      {msg && <p className="msg">{msg}</p>}{err && <p className="msg err">{err}</p>}

      {!session && (
        <div className="card form" style={{ marginTop: 16, maxWidth: 440 }}>
          <div style={{ width: "100%", fontWeight: 700 }}>{mode === "signup" ? "Daftar dan dapat rumah pod gratis + 20 koin" : "Masuk"}</div>
          {ref && mode === "signup" && <div className="empty" style={{ width: "100%" }}>Kamu diundang lewat link teman. Dia dapat bonus saat kamu daftar 🎁</div>}
          {mode === "signup" && <label style={{ width: "100%" }}>Username (nama rumahmu)<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="mis. budi_neon" style={{ width: "100%" }} /></label>}
          <label style={{ width: "100%" }}>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ width: "100%" }}>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: "100%" }} /></label>
          <button disabled={busy} onClick={submit}>{mode === "signup" ? "Daftar" : "Masuk"}</button>
          <button className="ghost" onClick={() => setMode(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "Sudah punya akun" : "Belum punya akun"}</button>
        </div>
      )}

      {session && !acc && (
        <div className="card form" style={{ marginTop: 16, maxWidth: 440 }}>
          <div style={{ width: "100%", fontWeight: 700 }}>Pilih username untuk rumah podmu</div>
          <label style={{ width: "100%" }}>Username<input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: "100%" }} /></label>
          <button disabled={busy} onClick={() => createProfile(username)}>Buat rumah gratis</button>
        </div>
      )}

      {session && acc && (
        <>
          <div className="grid g2" style={{ marginTop: 16 }}>
            <div className="card kpi" style={{ borderColor: "var(--lime)" }}>
              <div className="l">Dompet · @{acc.username}</div>
              <div className="n" style={{ color: "var(--lime)" }}>{fmt(bal)} <span style={{ fontSize: 16 }}>koin</span></div>
              <div className="d">Koin dari check-in, link referral, polling, dan dividen pajak (like + share seluruh warga).</div>
            </div>
            <div className="card kpi" style={{ borderColor: "var(--line)" }}>
              <div className="l">Rumahmu</div>
              <div className="n">{pod ? HOUSES[pod.level - 1].name : "…"}</div>
              <div className="d">Level {pod?.level ?? 1} dari 5{next ? ` · upgrade ke ${next.name}: ${next.cost} koin` : " · level maksimum"}</div>
              {next && <button style={{ marginTop: 10 }} disabled={busy || bal < next.cost} onClick={() => act(() => supabase.rpc("ng_upgrade"), (d) => `Rumahmu naik ke level ${d.level}!`)}>{bal < next.cost ? `Kurang ${next.cost - bal} koin` : `Upgrade (${next.cost} koin)`}</button>}
            </div>
          </div>

          <h2>Check-in harian</h2>
          <div className="card form"><button disabled={busy} onClick={() => act(() => supabase.rpc("ng_checkin"), (d) => (d.already ? "Hari ini sudah check-in. Kembali besok!" : `+${d.amount} koin! Streak ${d.streak} hari.`))}>Check-in sekarang</button>
            <span className="empty">+10 koin, +2 per hari berturut-turut (maks +30).</span></div>

          <h2>Ajak teman (share yang terverifikasi)</h2>
          <div className="card">
            <div className="form"><input readOnly value={link} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.currentTarget.select()} /><button onClick={() => { navigator.clipboard?.writeText(link); ok("Link disalin."); }}>Salin</button></div>
            <p className="empty">+1 koin per pengunjung unik (maks 20 per hari) dan +25 koin saat temanmu mendaftar. Bagikan di story, WhatsApp, atau komentar.</p>
          </div>

          {polls.length > 0 && <h2>Polling terbuka</h2>}
          {polls.map((p) => (
            <div className="card" key={p.id} style={{ marginBottom: 10 }}>
              <b>{p.title}</b><div className="empty">{p.question}</div>
              <div className="form" style={{ marginTop: 8 }}>
                {[...(p.ng_poll_options ?? [])].sort((a, b) => a.idx - b.idx).map((o) => (
                  <button key={o.id} className="ghost" disabled={busy} onClick={() => act(() => supabase.rpc("ng_vote_web", { p_poll: p.id, p_idx: o.idx }), (d) => (d.already ? "Kamu sudah memilih di polling ini." : "Suaramu tercatat! +3 koin."))}>{String.fromCharCode(65 + o.idx)}) {o.label} ({o.votes})</button>
                ))}
              </div>
            </div>
          ))}

          <h2>Hubungkan akun Instagram / YouTube</h2>
          <div className="card">
            {acc.verified ? <p>Terhubung ke <b>@{acc.claimed_handle}</b> ({acc.claimed_platform}) ✅</p> : (<>
              <p className="empty">Tulis kode ini di komentar video terbaru kami. Saat laporan harian berjalan, akunmu terhubung dan rumahmu dipindah ke akun itu.</p>
              <div className="tier" style={{ display: "inline-block", fontSize: 20, letterSpacing: 2 }}>{acc.claim_code}</div>
            </>)}
          </div>

          <h2>Riwayat koin</h2>
          <div className="card">
            {txs.length ? <table><tbody>{txs.map((t) => <tr key={t.id}><td>{REASON[t.reason] ?? t.reason}</td><td style={{ color: t.amount < 0 ? "#ff7a8a" : "var(--lime)" }}>{t.amount > 0 ? "+" : ""}{t.amount}</td><td className="empty">{new Date(t.created_at).toLocaleDateString("id-ID")}</td></tr>)}</tbody></table> : <p className="empty">Belum ada transaksi.</p>}
          </div>
          <p style={{ marginTop: 20 }}><button className="ghost" onClick={() => supabase.auth.signOut()}>Keluar</button></p>
        </>
      )}
    </div>
  );
}
