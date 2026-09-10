/** Public Supabase URL + anon key — required for login sessions. */
export function supabaseAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      getSupabaseAnonKey()
  );
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}

/** Lock the site in production (and when explicitly required locally). */
export function authEnforced(): boolean {
  if (!supabaseAuthConfigured()) {
    return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  }
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.HANDLED_AUTH_REQUIRED === "1"
  );
}

/** Only this email may use Handled when set (recommended in production). */
export function allowedLoginEmail(): string | null {
  const raw = process.env.HANDLED_ALLOWED_EMAIL?.trim().toLowerCase();
  return raw || null;
}

export function isAllowedLoginEmail(email: string | null | undefined): boolean {
  const allowed = allowedLoginEmail();
  if (!allowed) return Boolean(email);
  return email?.trim().toLowerCase() === allowed;
}
