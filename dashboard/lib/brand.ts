import { supabase, configured } from "./supabase";

export const DEFAULT_BRAND = "Negara Gue";
/** Country name chosen by citizens (ng_state key 'brand'); falls back to the working name. */
export async function getBrand(): Promise<string> {
  if (!configured) return DEFAULT_BRAND;
  const { data } = await supabase.from("ng_state").select("value").eq("key", "brand").maybeSingle();
  return ((data?.value as { name?: string } | null)?.name || DEFAULT_BRAND).trim();
}
