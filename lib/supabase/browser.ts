import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or anon/publishable key");
  }
  return createBrowserClient(url, key);
}
