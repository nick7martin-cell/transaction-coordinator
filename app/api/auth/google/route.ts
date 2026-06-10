import { getGoogleAuthUrl } from "@/lib/gmail/oauth-client";

export async function GET() {
  try {
    const url = getGoogleAuthUrl();
    return Response.redirect(url);
  } catch (err) {
    console.error("[gmail] auth redirect failed", err);
    return Response.json(
      { error: "Gmail OAuth is not configured" },
      { status: 500 }
    );
  }
}
