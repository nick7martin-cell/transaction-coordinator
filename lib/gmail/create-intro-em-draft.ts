import type { OAuth2Client } from "google-auth-library";
import { findAgentIdByName } from "@/lib/agents";
import { createGmailDraft } from "@/lib/gmail/create-draft";
import {
  buildIntroEmEmailDraft,
  resolveIntroEmAgentId,
  type IntroEmAgentId,
} from "@/lib/gmail/intro-em-draft";
import { getAuthorizedGmailClient } from "@/lib/gmail/oauth-client";
import { resolveTeamSteadySide } from "@/lib/transaction-seed";
import { supabase } from "@/lib/supabase";
import { coerceExtractedData } from "@/lib/types";

type Party = { role: string; name: string; email: string };

function buyerAgentNameFromParties(parties: Party[]): string | null {
  const buyerAgent = parties.find((p) => p.role === "buyer_agent");
  if (buyerAgent?.name?.trim()) return buyerAgent.name.trim();

  const unconfirmed = parties.find(
    (p) => p.role === "agent_unconfirmed" && findAgentIdByName(p.name)
  );
  return unconfirmed?.name?.trim() ?? null;
}

async function fetchHtmlSignature(client: OAuth2Client): Promise<string | undefined> {
  try {
    const res = await client.request<{
      sendAs: Array<{ isDefault?: boolean; signature?: string }>;
    }>({
      url: "https://www.googleapis.com/gmail/v1/users/me/settings/sendAs",
    });
    const defaultAlias = res.data.sendAs?.find((a) => a.isDefault);
    return defaultAlias?.signature || undefined;
  } catch (err) {
    console.error("[gmail] failed to fetch signature — sending draft without:", err);
    return undefined;
  }
}

/**
 * Create the buyer intro / earnest money / insurance Gmail draft.
 * Only valid for buy-side deals with Lucas, Luke, Brett, or Jadde as buyer's agent.
 */
export async function createIntroEmGmailDraft(transactionId: string): Promise<void> {
  const auth = await getAuthorizedGmailClient();
  if (!auth) {
    throw new Error("Gmail is not connected");
  }

  const [{ data: txn, error: txnError }, { data: extraction, error: extError }, { data: meta, error: metaError }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("earnest_money")
        .eq("id", transactionId)
        .maybeSingle(),
      supabase
        .from("extractions")
        .select("extracted_data")
        .eq("id", transactionId)
        .maybeSingle(),
      supabase
        .from("transaction_meta")
        .select("worksheet")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
    ]);

  if (txnError || extError || metaError) {
    throw new Error(
      (txnError ?? extError ?? metaError)?.message ?? "Failed to load transaction"
    );
  }
  if (!extraction) {
    throw new Error("Transaction not found");
  }

  const extracted = coerceExtractedData(extraction.extracted_data);
  if (resolveTeamSteadySide(extracted) !== "buyer") {
    throw new Error("Intro email is only available for buy-side transactions");
  }

  const ws = (meta?.worksheet ?? {}) as Record<string, unknown>;
  const parties = Array.isArray(ws._parties) ? (ws._parties as Party[]) : [];

  const buyerAgentName =
    buyerAgentNameFromParties(parties) ?? extracted.buyerAgentName;
  const agentId = resolveIntroEmAgentId(buyerAgentName);
  if (!agentId) {
    throw new Error(
      "Intro email is only available when Lucas, Luke, Brett, or Jadde is the buyer's agent"
    );
  }

  const buyerParties = parties.filter((p) => p.role === "buyer");
  const buyerNames =
    buyerParties.length > 0
      ? buyerParties.map((p) => p.name).filter(Boolean)
      : extracted.buyerNames;
  const buyerEmails =
    buyerParties.length > 0
      ? buyerParties.map((p) => p.email).filter((e) => e?.trim())
      : extracted.buyerEmails;

  if (buyerEmails.length === 0) {
    throw new Error("Add buyer email addresses in Transaction Contacts before drafting");
  }

  const earnestMoney =
    typeof txn?.earnest_money === "number"
      ? txn.earnest_money
      : extracted.earnestMoney;

  const draft = buildIntroEmEmailDraft({
    buyerFirstNames: buyerNames,
    buyerEmails,
    earnestMoney,
    agentId: agentId as IntroEmAgentId,
  });

  const htmlSignature = await fetchHtmlSignature(auth.client);
  await createGmailDraft(auth.client, draft, undefined, htmlSignature);
}
