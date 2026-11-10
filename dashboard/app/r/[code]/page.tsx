"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/** Referral landing: counts one unique visit per visitor per day for the link owner, then sends the visitor to sign up. */
export default function Referral() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  useEffect(() => {
    (async () => {
      try {
        let v = localStorage.getItem("ng_visitor");
        if (!v) { v = crypto.randomUUID(); localStorage.setItem("ng_visitor", v); }
        localStorage.setItem("ng_ref", code);
        await supabase.rpc("ng_click", { p_code: code, p_visitor: v });
      } catch { /* never block the visitor */ }
      router.replace(`/play?ref=${encodeURIComponent(code)}`);
    })();
  }, [code, router]);
  return <div className="wrap"><p className="empty">Membuka negara…</p></div>;
}
