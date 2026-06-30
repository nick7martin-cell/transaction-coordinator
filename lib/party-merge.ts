import { OTHER_SIDE_TITLE_UNKNOWN, titleInfoForSide } from "@/lib/transaction-seed";
import { sanitizeContactField } from "@/lib/format";
import {
  detectDualAgency,
  makeParty,
  type ExtractedData,
  type TransactionParty,
} from "@/lib/types";

export type PartyMergeEntry = { label: string; name: string; detail?: string };

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function isBlank(value: string | null | undefined): boolean {
  return !sanitizeContactField(value);
}

function partyListHasName(parties: TransactionParty[], name: string): boolean {
  const n = normName(name);
  if (!n) return true;
  return parties.some((p) => normName(p.name) === n);
}

function findPartyByRoleAndName(
  parties: TransactionParty[],
  role: TransactionParty["role"],
  name: string
): TransactionParty | undefined {
  const n = normName(name);
  return parties.find((p) => p.role === role && normName(p.name) === n);
}

function findPartyByRole(
  parties: TransactionParty[],
  role: TransactionParty["role"]
): TransactionParty | undefined {
  return parties.find((p) => p.role === role);
}

function fillBlankFields(
  party: TransactionParty,
  patch: Partial<Pick<TransactionParty, "name" | "company" | "email" | "phone">>
): { party: TransactionParty; updated: string[] } {
  const next = { ...party };
  const updated: string[] = [];

  for (const key of ["name", "company", "email", "phone"] as const) {
    const value = patch[key]?.trim();
    if (value && isBlank(next[key])) {
      next[key] = value;
      updated.push(key);
    }
  }

  return { party: next, updated };
}

function applyPartyUpdate(
  parties: TransactionParty[],
  id: string,
  next: TransactionParty
): TransactionParty[] {
  return parties.map((p) => (p.id === id ? next : p));
}

function hasTitleInfo(info: {
  company: string;
  name: string;
  email: string;
  phone: string;
}): boolean {
  return !!(info.company.trim() || info.name.trim() || info.email.trim() || info.phone.trim());
}

/** Default Watermark/Ingrid seed — replace when supplemental extraction names a different title co. */
function isDefaultSeededTitle(party: TransactionParty): boolean {
  const name = normName(party.name);
  const company = party.company.trim().toLowerCase();
  const email = party.email.trim().toLowerCase();
  return (
    (name.includes("ingrid") && name.includes("bredeson")) ||
    company.includes("watermark") ||
    email.includes("wmtitle.com")
  );
}

function extractedTitleDiffers(
  existing: TransactionParty,
  info: { company: string; name: string; email: string; phone: string }
): boolean {
  if (info.company.trim() && normName(info.company) !== normName(existing.company)) return true;
  if (info.name.trim() && normName(info.name) !== normName(existing.name)) return true;
  if (
    info.email.trim() &&
    info.email.trim().toLowerCase() !== existing.email.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

function mergeTitleParty(
  parties: TransactionParty[],
  role: "buyer_title" | "seller_title",
  info: { company: string; name: string; email: string; phone: string },
  added: PartyMergeEntry[],
  updated: PartyMergeEntry[]
): TransactionParty[] {
  if (!hasTitleInfo(info)) return parties;

  const label = role === "buyer_title" ? "Buyer's title" : "Seller's title";
  let next = [...parties];
  const existing = findPartyByRole(next, role);

  if (existing) {
    const isUnknownSlot = existing.company === OTHER_SIDE_TITLE_UNKNOWN;

    const replaceDefault =
      isDefaultSeededTitle(existing) && extractedTitleDiffers(existing, info);

    if (isUnknownSlot || replaceDefault) {
      next = applyPartyUpdate(next, existing.id, {
        ...existing,
        company: info.company || (isUnknownSlot ? "" : existing.company),
        name: info.name || existing.name,
        email: info.email || existing.email,
        phone: info.phone || existing.phone,
      });
      updated.push({
        label,
        name: info.name || info.company || existing.name || existing.company || role,
        detail: replaceDefault
          ? "replaced default title contact from extraction"
          : "contact info from extraction",
      });
      return next;
    }

    const { party, updated: fields } = fillBlankFields(existing, {
      company: info.company,
      name: info.name,
      email: info.email,
      phone: info.phone,
    });

    if (fields.length > 0) {
      next = applyPartyUpdate(next, existing.id, party);
      updated.push({
        label,
        name: party.name || party.company || role,
        detail: fields.join(", "),
      });
    }
    return next;
  }

  next.push(
    makeParty({
      role,
      name: info.name,
      company: info.company,
      email: info.email,
      phone: info.phone,
    })
  );
  added.push({
    label,
    name: info.name || info.company || role,
  });
  return next;
}

function mergeLenderParty(
  parties: TransactionParty[],
  d: ExtractedData,
  added: PartyMergeEntry[],
  updated: PartyMergeEntry[]
): TransactionParty[] {
  const incoming = {
    name: sanitizeContactField(d.lenderName ?? ""),
    company: sanitizeContactField(d.lenderCompany ?? ""),
    email: sanitizeContactField(d.lenderEmail ?? ""),
    phone: sanitizeContactField(d.lenderPhone ?? ""),
  };
  const hasLender = !!(incoming.name || incoming.company || incoming.email || incoming.phone);
  if (!hasLender) return parties;

  let next = [...parties];
  const existing = findPartyByRole(next, "lender");

  if (existing) {
    const nameDiffers =
      !!incoming.name &&
      !!existing.name.trim() &&
      normName(incoming.name) !== normName(existing.name);
    const emailDiffers =
      !!incoming.email &&
      !!existing.email.trim() &&
      incoming.email.toLowerCase() !== existing.email.trim().toLowerCase();

    if (nameDiffers || (emailDiffers && incoming.name)) {
      const replaced = {
        ...existing,
        name: incoming.name || existing.name,
        company: incoming.company || existing.company,
        email: incoming.email || existing.email,
        phone: incoming.phone || existing.phone,
      };
      next = applyPartyUpdate(next, existing.id, replaced);
      updated.push({
        label: "Lender",
        name: replaced.name || replaced.company || "Lender",
        detail: "replaced lender from supplemental extraction",
      });
      return next;
    }

    const { party, updated: fields } = fillBlankFields(existing, incoming);
    if (fields.length > 0) {
      next = applyPartyUpdate(next, existing.id, party);
      updated.push({
        label: "Lender",
        name: party.name || party.company || "Lender",
        detail: fields.join(", "),
      });
    }
    return next;
  }

  next.push(
    makeParty({
      role: "lender",
      name: incoming.name,
      company: incoming.company,
      email: incoming.email,
      phone: incoming.phone,
    })
  );
  added.push({
    label: "Lender",
    name: incoming.name || incoming.company || "Lender",
  });
  return next;
}

/**
 * Merge extracted party contact info into an existing roster.
 * Adds new parties and fills blank fields; lender/title defaults can be replaced
 * when supplemental extraction names a different contact.
 */
export function mergePartiesFromExtraction(
  existing: TransactionParty[],
  d: ExtractedData
): { parties: TransactionParty[]; added: PartyMergeEntry[]; updated: PartyMergeEntry[] } {
  let parties = [...existing];
  const added: PartyMergeEntry[] = [];
  const updated: PartyMergeEntry[] = [];
  const dual = detectDualAgency(d);

  d.buyerNames.forEach((name, i) => {
    const trimmed = name?.trim();
    if (!trimmed) return;

    const existingBuyer = findPartyByRoleAndName(parties, "buyer", trimmed);
    if (existingBuyer) {
      const { party, updated: fields } = fillBlankFields(existingBuyer, {
        email: sanitizeContactField(d.buyerEmails[i]),
        phone: sanitizeContactField(d.buyerPhones[i]),
      });
      if (fields.length > 0) {
        parties = applyPartyUpdate(parties, existingBuyer.id, party);
        updated.push({ label: "Buyer", name: trimmed, detail: fields.join(", ") });
      }
      return;
    }

    if (partyListHasName(parties, trimmed)) return;
    parties.push(
      makeParty({
        name: trimmed,
        role: "buyer",
        company: "",
        email: sanitizeContactField(d.buyerEmails[i]),
        phone: sanitizeContactField(d.buyerPhones[i]),
      })
    );
    added.push({ label: "Buyer", name: trimmed });
  });

  d.sellerNames.forEach((name, i) => {
    const trimmed = name?.trim();
    if (!trimmed) return;

    const existingSeller = findPartyByRoleAndName(parties, "seller", trimmed);
    if (existingSeller) {
      const { party, updated: fields } = fillBlankFields(existingSeller, {
        email: sanitizeContactField(d.sellerEmails[i]),
        phone: sanitizeContactField(d.sellerPhones[i]),
      });
      if (fields.length > 0) {
        parties = applyPartyUpdate(parties, existingSeller.id, party);
        updated.push({ label: "Seller", name: trimmed, detail: fields.join(", ") });
      }
      return;
    }

    if (partyListHasName(parties, trimmed)) return;
    parties.push(
      makeParty({
        name: trimmed,
        role: "seller",
        company: "",
        email: sanitizeContactField(d.sellerEmails[i]),
        phone: sanitizeContactField(d.sellerPhones[i]),
      })
    );
    added.push({ label: "Seller", name: trimmed });
  });

  const sameAgent =
    !!d.buyerAgentName &&
    !!d.listingAgentName &&
    normName(d.buyerAgentName) === normName(d.listingAgentName);

  if (d.buyerAgentName?.trim()) {
    const trimmed = d.buyerAgentName.trim();
    const role = dual ? "agent_unconfirmed" : "buyer_agent";
    const existingAgent =
      findPartyByRoleAndName(parties, role, trimmed) ??
      findPartyByRoleAndName(parties, "buyer_agent", trimmed) ??
      findPartyByRoleAndName(parties, "agent_unconfirmed", trimmed);

    if (existingAgent) {
      const { party, updated: fields } = fillBlankFields(existingAgent, {
        company: d.buyerAgentBrokerage ?? "",
        email: d.buyerAgentEmail ?? "",
        phone: d.buyerAgentPhone ?? "",
      });
      if (fields.length > 0) {
        parties = applyPartyUpdate(parties, existingAgent.id, party);
        updated.push({
          label: dual ? "Agent (needs confirmation)" : "Buyer's agent",
          name: trimmed,
          detail: fields.join(", "),
        });
      }
    } else if (!partyListHasName(parties, trimmed)) {
      parties.push(
        makeParty({
          name: trimmed,
          role,
          company: d.buyerAgentBrokerage ?? "",
          email: d.buyerAgentEmail ?? "",
          phone: d.buyerAgentPhone ?? "",
        })
      );
      added.push({
        label: dual ? "Agent (needs confirmation)" : "Buyer's agent",
        name: trimmed,
      });
    }
  }

  if (d.listingAgentName?.trim() && !sameAgent) {
    const trimmed = d.listingAgentName.trim();
    const role = dual ? "agent_unconfirmed" : "listing_agent";
    const existingAgent =
      findPartyByRoleAndName(parties, role, trimmed) ??
      findPartyByRoleAndName(parties, "listing_agent", trimmed) ??
      findPartyByRoleAndName(parties, "agent_unconfirmed", trimmed);

    if (existingAgent) {
      const { party, updated: fields } = fillBlankFields(existingAgent, {
        company: d.listingAgentBrokerage ?? "",
        email: d.listingAgentEmail ?? "",
        phone: d.listingAgentPhone ?? "",
      });
      if (fields.length > 0) {
        parties = applyPartyUpdate(parties, existingAgent.id, party);
        updated.push({
          label: dual ? "Agent (needs confirmation)" : "Listing agent",
          name: trimmed,
          detail: fields.join(", "),
        });
      }
    } else if (!partyListHasName(parties, trimmed)) {
      parties.push(
        makeParty({
          name: trimmed,
          role,
          company: d.listingAgentBrokerage ?? "",
          email: d.listingAgentEmail ?? "",
          phone: d.listingAgentPhone ?? "",
        })
      );
      added.push({
        label: dual ? "Agent (needs confirmation)" : "Listing agent",
        name: trimmed,
      });
    }
  }

  parties = mergeTitleParty(
    parties,
    "buyer_title",
    titleInfoForSide(d, "buyer"),
    added,
    updated
  );
  parties = mergeTitleParty(
    parties,
    "seller_title",
    titleInfoForSide(d, "seller"),
    added,
    updated
  );
  parties = mergeLenderParty(parties, d, added, updated);

  return { parties, added, updated };
}
