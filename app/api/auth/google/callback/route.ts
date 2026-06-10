import { saveTokensFromCode } from "@/lib/gmail/oauth-client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const settingsUrl = new URL("/settings", req.url);

  if (error) {
    settingsUrl.searchParams.set("gmail", "error");
    return Response.redirect(settingsUrl);
  }

  if (!code) {
    settingsUrl.searchParams.set("gmail", "error");
    return Response.redirect(settingsUrl);
  }

  try {
    const email = await saveTokensFromCode(code);
    settingsUrl.searchParams.set("gmail", "connected");
    settingsUrl.searchParams.set("email", email);
    return Response.redirect(settingsUrl);
  } catch (err) {
    console.error("[gmail] OAuth callback failed", err);
    settingsUrl.searchParams.set("gmail", "error");
    return Response.redirect(settingsUrl);
  }
}
