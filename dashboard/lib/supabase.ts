import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const configured = Boolean(url && anon);
// Anon key only: all writes are gated by RLS (ng_is_admin()), so this is safe in the browser.
export const supabase = createClient(url || "http://localhost", anon || "anon", { auth: { persistSession: true } });
