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
  if (typeof window !== "undefined") {
    throw new Error("Supabase client is server-only");
  }

  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const urlRef = projectRefFromSupabaseUrl(supabaseUrl);
  const keyRef = projectRefFromSupabaseKey(serviceRoleKey);
  if (urlRef && keyRef && urlRef !== keyRef) {
    throw new Error(
      `Supabase project mismatch: NEXT_PUBLIC_SUPABASE_URL is for "${urlRef}" but SUPABASE_SERVICE_ROLE_KEY is for "${keyRef}". Re-copy keys from Supabase → Settings → API.`
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let client: SupabaseClient | undefined;

function getSupabase(): SupabaseClient {
  if (!client) client = createSupabaseClient();
  return client;
}

/** Lazy server-side singleton (service role — never import from client components). */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const instance = getSupabase();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
});
