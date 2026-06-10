import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Fix common copy/paste typos in the Supabase project URL from .env files. */
function normalizeSupabaseUrl(raw: string): string {
  const url = raw.trim();
  if (url.startsWith("ttps://")) return `h${url}`;
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function projectRefFromSupabaseUrl(url: string): string | null {
  return url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;
}

function projectRefFromSupabaseKey(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials");
  }

  const urlRef = projectRefFromSupabaseUrl(supabaseUrl);
  const keyRef = projectRefFromSupabaseKey(supabaseKey);
  if (urlRef && keyRef && urlRef !== keyRef) {
    throw new Error(
      `Supabase project mismatch: NEXT_PUBLIC_SUPABASE_URL is for "${urlRef}" but NEXT_PUBLIC_SUPABASE_ANON_KEY is for "${keyRef}". Re-copy the anon/publishable key from that project's Supabase dashboard (Settings → API).`
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

let client: SupabaseClient | undefined;

function getSupabase(): SupabaseClient {
  if (!client) client = createSupabaseClient();
  return client;
}

/** Lazy singleton so env is read at request time, not during `next build`. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const instance = getSupabase();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
});
