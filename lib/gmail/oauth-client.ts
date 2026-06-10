import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/gmail/token-crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/userinfo.email",
];

const GMAIL_ROW_ID = "default";

export type StoredGmailCredentials = {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
};

function getRedirectUri(): string {
  const uri = process.env.GOOGLE_REDIRECT_URI;
  if (!uri) throw new Error("GOOGLE_REDIRECT_URI is not configured");
  return uri;
}

export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  }
  return new OAuth2Client(clientId, clientSecret, getRedirectUri());
}

export function getGoogleAuthUrl(): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
  });
}

export async function saveTokensFromCode(code: string): Promise<string> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google did not return access and refresh tokens");
  }

  client.setCredentials(tokens);
  const userinfo = await client.request<{ email?: string }>({
    url: "https://www.googleapis.com/oauth2/v2/userinfo",
  });
  const email = userinfo.data.email;
  if (!email) throw new Error("Could not read Google account email");

  const { error } = await supabase.from("gmail_integration").upsert(
    {
      id: GMAIL_ROW_ID,
      email,
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(error.message);
  return email;
}

export async function getGmailConnectionStatus(): Promise<{
  connected: boolean;
  email: string | null;
}> {
  const { data, error } = await supabase
    .from("gmail_integration")
    .select("email")
    .eq("id", GMAIL_ROW_ID)
    .maybeSingle();

  if (error || !data?.email) return { connected: false, email: null };
  return { connected: true, email: data.email as string };
}

async function persistRefreshedTokens(
  accessToken: string,
  expiryDate: number | null
): Promise<void> {
  await supabase
    .from("gmail_integration")
    .update({
      access_token_encrypted: encryptToken(accessToken),
      expires_at: expiryDate ? new Date(expiryDate).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", GMAIL_ROW_ID);
}

/** Load OAuth credentials, refreshing the access token when expired. */
export async function getAuthorizedGmailClient(): Promise<{
  client: OAuth2Client;
  email: string;
} | null> {
  const { data, error } = await supabase
    .from("gmail_integration")
    .select("email, access_token_encrypted, refresh_token_encrypted, expires_at")
    .eq("id", GMAIL_ROW_ID)
    .maybeSingle();

  if (error || !data) return null;

  const client = createOAuth2Client();
  const accessToken = decryptToken(data.access_token_encrypted as string);
  const refreshToken = decryptToken(data.refresh_token_encrypted as string);
  const expiryDate = data.expires_at
    ? new Date(data.expires_at as string).getTime()
    : null;

  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate ?? undefined,
  });

  const needsRefresh =
    !expiryDate || expiryDate <= Date.now() + 60_000;

  if (needsRefresh) {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) return null;
    client.setCredentials(credentials);
    await persistRefreshedTokens(
      credentials.access_token,
      credentials.expiry_date ?? null
    );
  }

  return { client, email: data.email as string };
}
