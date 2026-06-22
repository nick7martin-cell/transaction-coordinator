import { createIntroEmGmailDraft } from "@/lib/gmail/create-intro-em-draft";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await createIntroEmGmailDraft(id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[gmail] draft-intro-em failed", id, err);
    const message = err instanceof Error ? err.message : "Failed to create draft";
    return Response.json({ error: message }, { status: 500 });
  }
}
