import { buildOpeningEmailDraft } from "@/lib/gmail/draft-email";
import { createGmailDraft } from "@/lib/gmail/create-draft";
import { getAuthorizedGmailClient } from "@/lib/gmail/oauth-client";
import { findAgentIdByName } from "@/lib/agents";
import { supabase } from "@/lib/supabase";

function worksheetString(
  ws: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = ws?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

type Party = { role: string; name: string; company: string; email: string; phone: string };

/** Determine which side Team Steady's agent is on, using the parties roster. */
function resolveTeamSteadySide(parties: Party[]): "buyer" | "seller" {
  const buyerAgent   = parties.find((p) => p.role === "buyer_agent");
  const listingAgent = parties.find((p) => p.role === "listing_agent");
  if (buyerAgent?.name   && findAgentIdByName(buyerAgent.name))   return "buyer";
  if (listingAgent?.name && findAgentIdByName(listingAgent.name)) return "seller";
  return "buyer";
}

/**
 * Create a Gmail draft for a transaction using saved worksheet contacts.
 * Throws on failure so API routes can return errors to the client.
 */
export async function createTransactionGmailDraft(
  transactionId: string
): Promise<void> {
  const auth = await getAuthorizedGmailClient();
  if (!auth) {
    throw new Error("Gmail is not connected");
  }

  const [{ data: txn, error: txnError }, { data: meta, error: metaError }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("property_address, inspection_period_days")
        .eq("id", transactionId)
        .maybeSingle(),
      supabase
        .from("transaction_meta")
        .select("worksheet")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
    ]);

  if (txnError || metaError) {
    throw new Error((txnError ?? metaError)?.message ?? "Failed to load transaction");
  }
  if (!txn) {
    throw new Error("Transaction not found");
  }

  const ws      = (meta?.worksheet ?? {}) as Record<string, unknown>;
  const parties = Array.isArray(ws._parties) ? (ws._parties as Party[]) : [];

  const teamSteadySide  = resolveTeamSteadySide(parties);
  const buyerAgentParty = parties.find((p) => p.role === "buyer_agent");
  const buyerTitleParty = parties.find((p) => p.role === "buyer_title");

  const draft = buildOpeningEmailDraft({
    propertyAddress: (txn.property_address as string | null) ?? null,
    inspectionPeriodDays:
      typeof txn.inspection_period_days === "number"
        ? txn.inspection_period_days
        : null,
    lenderEmail:       worksheetString(ws, "lenderEmail"),
    buyerCloserEmail:  worksheetString(ws, "buyerCloserEmail"),
    sellerCloserEmail: worksheetString(ws, "sellerCloserEmail"),
    buyerAgentEmail:   worksheetString(ws, "buyerAgentEmail"),
    listingEmail:      worksheetString(ws, "listingEmail"),
    sellerTitleCo:     worksheetString(ws, "sellerTitleCo"),
    listingAssociate:  worksheetString(ws, "listingAssociate"),
    teamSteadySide,
    buyerAgentName:    buyerAgentParty?.name ?? null,
    buyerTitleCo:      buyerTitleParty?.company ?? null,
  });

  // Fetch the user's default Gmail signature. Falls back to no signature so
  // a settings API error never blocks draft creation.
  let htmlSignature: string | undefined;
  try {
    const res = await auth.client.request<{
      sendAs: Array<{ isDefault?: boolean; signature?: string }>;
    }>({
      url: "https://www.googleapis.com/gmail/v1/users/me/settings/sendAs",
    });
    const defaultAlias = res.data.sendAs?.find((a) => a.isDefault);
    if (defaultAlias?.signature) {
      htmlSignature = defaultAlias.signature;
    }
  } catch (err) {
    console.error("[gmail] failed to fetch signature — sending draft without:", err);
  }

  await createGmailDraft(auth.client, draft, undefined, htmlSignature);
}
