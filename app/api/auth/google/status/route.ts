import { getGmailConnectionStatus } from "@/lib/gmail/oauth-client";

export async function GET() {
  try {
    const status = await getGmailConnectionStatus();
    return Response.json(status);
  } catch (err) {
    console.error("[gmail] status check failed", err);
    return Response.json({ connected: false, email: null });
  }
}
