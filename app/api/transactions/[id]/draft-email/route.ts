import { createTransactionGmailDraft } from "@/lib/gmail/create-transaction-draft";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await createTransactionGmailDraft(id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[gmail] draft-email failed", id, err);
    const message = err instanceof Error ? err.message : "Failed to create draft";
    return Response.json({ error: message }, { status: 500 });
  }
}
