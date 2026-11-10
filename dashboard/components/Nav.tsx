"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, configured } from "@/lib/supabase";

const I = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const TABS = [
  { href: "/", label: "Dashboard", icon: I("M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z") },
  { href: "/world", label: "Dunia", icon: I("M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z") },
  { href: "/play", label: "Warga", icon: I("M16 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 11a4 4 0 100-8 4 4 0 000 8zM21 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8") },
  { href: "/admin", label: "Admin", icon: I("M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z") },
];

export default function Nav({ brand }: { brand: string }) {
  const path = usePathname();
  const [time, setTime] = useState("");
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setTime(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", minute: "2-digit" }).format(new Date()) + " GMT+7");
    tick(); const t = setInterval(tick, 20000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <nav className="nav">
      <div className="nav-in">
        <Link href="/" className="brand"><i /> {brand}</Link>
        {TABS.map((t) => <Link key={t.href} href={t.href} className={`tab${on(t.href) ? " on" : ""}`}>{t.icon}<span>{t.label}</span></Link>)}
        <div className="sp" />
        <span className="clock">{time}</span>
        <Link href="/play" className="cta">{user ? "Dompet saya" : "Jadi Warga"}</Link>
        <Link href="/play" className="avatar" title={user ?? "Masuk"}>{user ? user[0].toUpperCase() : "?"}</Link>
      </div>
    </nav>
  );
}
