import { canonicalContactEmail } from "@/lib/canonical-contacts";
import { findAgentIdByName } from "@/lib/agents";
import type { Contact, ExtractedData, TransactionParty } from "@/lib/types";
import { makeParty, seedPartiesFromExtraction } from "@/lib/types";

export const OTHER_SIDE_TITLE_UNKNOWN = "Unknown";

const COLLIN_AGENT_ID = "collin-anderson";
const DEREK_JOPP_AGENT_ID = "derek-jopp";
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

export function resolveTitleContactNameForAgent(agentName: string | null): string | null {
  const agentId = findAgentIdByName(agentName);
  if (agentId === COLLIN_AGENT_ID) return COLLIN_TITLE_CONTACT_NAME;
  // Derek uses varying title companies — only seed from extraction or email screenshots.
  if (agentId === DEREK_JOPP_AGENT_ID) return null;
  return DEFAULT_TITLE_CONTACT_NAME;
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

export type TitleContactInfo = {
  company: string;
  name: string;
  email: string;
  phone: string;
};

export function hasTitleContactInfo(info: TitleContactInfo): boolean {
  return !!(
    info.company.trim() ||
    info.name.trim() ||
    info.email.trim() ||
    info.phone.trim()
  );
}

/** Map extracted title fields to a side, routing legacy titleCompany to the other side. */
export function titleInfoForSide(
  d: ExtractedData,
  side: "buyer" | "seller"
): TitleContactInfo {
  const empty: TitleContactInfo = { company: "", name: "", email: "", phone: "" };

  if (side === "buyer") {
    const direct: TitleContactInfo = {
      company: d.buyerTitleCompany ?? "",
      name: d.buyerTitleCloserName ?? "",
      email: d.buyerTitleCloserEmail ?? "",
      phone: d.buyerTitleCloserPhone ?? "",
    };
    if (hasTitleContactInfo(direct)) return direct;
  } else {
    const direct: TitleContactInfo = {
      company: d.sellerTitleCompany ?? "",
      name: d.sellerTitleCloserName ?? "",
      email: d.sellerTitleCloserEmail ?? "",
      phone: d.sellerTitleCloserPhone ?? "",
    };
    if (hasTitleContactInfo(direct)) return direct;
  }

  const legacyCompany = d.titleCompany?.trim();
  const hasSideSpecificCompany = !!(
    d.buyerTitleCompany?.trim() || d.sellerTitleCompany?.trim()
  );
  if (!legacyCompany || hasSideSpecificCompany) return empty;

  const ourSide = resolveTeamSteadySide(d);
  const otherSide: "buyer" | "seller" = ourSide === "buyer" ? "seller" : "buyer";
  if (side !== otherSide) return empty;

  return {
    company: legacyCompany,
    name: (d.sellerTitleCloserName ?? d.buyerTitleCloserName ?? "").trim(),
    email: (d.sellerTitleCloserEmail ?? d.buyerTitleCloserEmail ?? "").trim(),
    phone: (d.sellerTitleCloserPhone ?? d.buyerTitleCloserPhone ?? "").trim(),
  };
}

function titlePartyFromExtraction(
  d: ExtractedData,
  side: "buyer" | "seller"
): TransactionParty | null {
  const info = titleInfoForSide(d, side);
  if (!hasTitleContactInfo(info)) return null;
  const role = side === "buyer" ? "buyer_title" : "seller_title";
  return makeParty({
    role,
    name: info.name,
    company: info.company,
    email: info.email,
    phone: info.phone,
  });
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

    // Company-only match when the document names a different loan officer.
    if (extractedName && !nameMatch) continue;

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
): TransactionParty {
  const role = side === "buyer" ? "buyer_title" : "seller_title";
  const fromExtraction = titlePartyFromExtraction(d, side);
  if (fromExtraction) return fromExtraction;

  const agentName = side === "buyer" ? d.buyerAgentName : d.listingAgentName;
  const titleContactName = resolveTitleContactNameForAgent(agentName);
  if (titleContactName) {
    const titleContact = findPreferredContactByName(contacts, titleContactName);
    if (titleContact) return contactToParty(titleContact, role);
  }

  return makeParty({
    role,
    name: "",
    company: OTHER_SIDE_TITLE_UNKNOWN,
    email: "",
    phone: "",
  });
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

    if (titleContactName) {
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
      const ourTitleRole = ourSide === "buyer" ? "buyer_title" : "seller_title";
      const otherTitleRole = otherSide === "buyer" ? "buyer_title" : "seller_title";

      if (!parties.some((p) => p.role === ourTitleRole)) {
        parties.push(ourSideTitleParty(d, contacts, ourSide));
      }
      if (!parties.some((p) => p.role === otherTitleRole)) {
        parties.push(otherSideTitleParty(ourSide));
      }
    }
  } else {
    const ourSide = resolveTeamSteadySide(d);
    const otherSide = ourSide === "buyer" ? "seller" : "buyer";
    const ourTitleRole   = ourSide   === "buyer" ? "buyer_title"  : "seller_title";
    const otherTitleRole = otherSide === "buyer" ? "buyer_title"  : "seller_title";

    if (!parties.some((p) => p.role === ourTitleRole)) {
      parties.push(ourSideTitleParty(d, contacts, ourSide));
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
