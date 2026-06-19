import { canonicalContactEmail } from "@/lib/canonical-contacts";
import { findAgentIdByName } from "@/lib/agents";
import type { Contact, ExtractedData, TransactionParty } from "@/lib/types";
import { makeParty, seedPartiesFromExtraction } from "@/lib/types";

export const OTHER_SIDE_TITLE_UNKNOWN = "Unknown";

const COLLIN_AGENT_ID = "collin-anderson";
const DEFAULT_TITLE_CONTACT_NAME = "Ingrid Bredeson";
const COLLIN_TITLE_CONTACT_NAME = "Lacey Rentz";

const PREFERRED_LENDER_MATCHES = [
  { contactName: "Brett Reinhart", companyHint: "fairway" },
  { contactName: "Josh Little", companyHint: "edge" },
] as const;

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function findPreferredContactByName(
  contacts: Contact[],
  contactName: string
): Contact | undefined {
  const target = norm(contactName);
  return contacts.find((c) => norm(c.contact_name) === target);
}

export function resolveTitleContactNameForAgent(agentName: string | null): string {
  return findAgentIdByName(agentName) === COLLIN_AGENT_ID
    ? COLLIN_TITLE_CONTACT_NAME
    : DEFAULT_TITLE_CONTACT_NAME;
}

/**
 * Determine which side Team Steady represents on a transaction.
 * Returns "buyer" if a Team Steady agent is the buyer's agent,
 * "seller" if they are the listing agent, or "buyer" as a safe default
 * when neither agent name matches (single-agent upload, etc.).
 */
export function resolveTeamSteadySide(d: ExtractedData): "buyer" | "seller" {
  if (findAgentIdByName(d.buyerAgentName)) return "buyer";
  if (findAgentIdByName(d.listingAgentName)) return "seller";
  return "buyer";
}

export function contactToParty(
  contact: Contact,
  role: TransactionParty["role"]
): TransactionParty {
  return makeParty({
    name: contact.contact_name,
    role,
    company: contact.company_name,
    email: canonicalContactEmail(
      contact.contact_name,
      contact.email,
      contact.company_name
    ),
    phone: contact.phone ?? "",
  });
}

export function matchPreferredLender(
  d: ExtractedData,
  contacts: Contact[]
): Contact | null {
  if (!d.hasPreApprovalLetter) return null;

  const lenderContacts = contacts.filter((c) => c.type === "lender");
  const extractedName = norm(d.lenderName);
  const extractedCo = norm(d.lenderCompany);
  const extractedEmail = norm(d.lenderEmail);

  for (const pref of PREFERRED_LENDER_MATCHES) {
    const contact = findPreferredContactByName(lenderContacts, pref.contactName);
    if (!contact) continue;

    const prefName = norm(pref.contactName);
    const prefFirst = prefName.split(/\s+/)[0];
    const prefCo = norm(contact.company_name);

    const nameMatch =
      extractedName.includes(prefFirst) ||
      extractedName.includes(prefName) ||
      prefName.includes(extractedName);

    const companyMatch =
      extractedCo.includes(pref.companyHint) ||
      extractedCo.includes(prefCo) ||
      prefCo.includes(extractedCo);

    const emailMatch =
      !!extractedEmail && !!contact.email && norm(contact.email) === extractedEmail;

    if (nameMatch || companyMatch || emailMatch) return contact;
  }

  return null;
}

export function lenderPartyFromExtraction(
  d: ExtractedData,
  contacts: Contact[]
): TransactionParty | null {
  if (!d.hasPreApprovalLetter) return null;
  if (!d.lenderName && !d.lenderCompany) return null;

  const preferred = matchPreferredLender(d, contacts);
  if (preferred) return contactToParty(preferred, "lender");

  return makeParty({
    role: "lender",
    name: d.lenderName ?? "",
    company: d.lenderCompany ?? "",
    email: d.lenderEmail ?? "",
    phone: d.lenderPhone ?? "",
  });
}

function otherSideTitleParty(side: "buyer" | "seller"): TransactionParty {
  const role = side === "buyer" ? "seller_title" : "buyer_title";
  return makeParty({
    role,
    name: "",
    company: OTHER_SIDE_TITLE_UNKNOWN,
    email: "",
    phone: "",
  });
}

function ourSideTitleParty(
  d: ExtractedData,
  contacts: Contact[],
  side: "buyer" | "seller"
): TransactionParty | null {
  const agentName = side === "buyer" ? d.buyerAgentName : d.listingAgentName;
  const titleContactName = resolveTitleContactNameForAgent(agentName);
  const titleContact = findPreferredContactByName(contacts, titleContactName);
  const role = side === "buyer" ? "buyer_title" : "seller_title";
  return titleContact ? contactToParty(titleContact, role) : null;
}

/** Build the full initial parties roster for a newly created transaction. */
export function buildInitialParties(
  d: ExtractedData,
  contacts: Contact[]
): TransactionParty[] {
  const parties = seedPartiesFromExtraction(d);

  // Dual agency: Team Steady handles both sides — seed the preferred title
  // contact on both the buyer and seller title slots.
  const bothSidesTeamSteady =
    !!findAgentIdByName(d.buyerAgentName) && !!findAgentIdByName(d.listingAgentName);

  if (d.dualAgency || bothSidesTeamSteady) {
    const agentName = d.buyerAgentName ?? d.listingAgentName;
    const titleContactName = resolveTitleContactNameForAgent(agentName);
    const titleContact = findPreferredContactByName(contacts, titleContactName);

    if (titleContact) {
      if (!parties.some((p) => p.role === "buyer_title")) {
        parties.push(contactToParty(titleContact, "buyer_title"));
      }
      if (!parties.some((p) => p.role === "seller_title")) {
        parties.push(contactToParty(titleContact, "seller_title"));
      }
    }
  } else {
    const ourSide = resolveTeamSteadySide(d);
    const otherSide = ourSide === "buyer" ? "seller" : "buyer";
    const ourTitleRole   = ourSide   === "buyer" ? "buyer_title"  : "seller_title";
    const otherTitleRole = otherSide === "buyer" ? "buyer_title"  : "seller_title";

    if (!parties.some((p) => p.role === ourTitleRole)) {
      const titleParty = ourSideTitleParty(d, contacts, ourSide);
      if (titleParty) parties.push(titleParty);
    }
    if (!parties.some((p) => p.role === otherTitleRole)) {
      parties.push(otherSideTitleParty(ourSide));
    }
  }

  if (!parties.some((p) => p.role === "lender")) {
    const lender = lenderPartyFromExtraction(d, contacts);
    if (lender) parties.push(lender);
  }

  return parties;
}

/** Ensure default title parties exist on an existing roster (non-destructive). */
export function ensureDefaultTitleParties(parties: TransactionParty[]): TransactionParty[] {
  const result = [...parties];
  // For existing rosters we don't have extraction context; assume buyer side
  // (the common case) and add Unknown on the seller side if missing.
  if (!result.some((p) => p.role === "seller_title")) {
    result.push(otherSideTitleParty("buyer"));
  }
  return result;
}

/** Add lender from pre-approval extraction when roster has none yet. */
export function mergeLenderFromExtraction(
  parties: TransactionParty[],
  d: ExtractedData,
  contacts: Contact[]
): { parties: TransactionParty[]; added: { label: string; name: string } | null } {
  if (parties.some((p) => p.role === "lender")) {
    return { parties, added: null };
  }
  const lender = lenderPartyFromExtraction(d, contacts);
  if (!lender) return { parties, added: null };
  return {
    parties: [...parties, lender],
    added: { label: "Lender", name: lender.name || lender.company },
  };
}
