import { findAgentIdByName, HUBERT_EMAIL } from "@/lib/agents";
import { sanitizeContactField } from "@/lib/format";
import type { Contact, TransactionParty } from "@/lib/types";

export const INGRID_WATERMARK_EMAIL = "teamingrid@wmtitle.com";
export const INGRID_BREDESON_NAME = "Ingrid Bredeson";
const INGRID_WATERMARK_COMPANY = "Watermark Title";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function normalizeEmailForMatch(email: string | null | undefined): string {
  return norm(email).replace(/\.con$/, ".com");
}

/** True when this row is Team Steady's default Watermark closer (Ingrid). */
export function isIngridWatermarkContact(
  contactName: string | null | undefined,
  email: string | null | undefined,
  companyName?: string | null
): boolean {
  const e = normalizeEmailForMatch(email);
  if (e === INGRID_WATERMARK_EMAIL || e.includes("teamingrid@") || e.includes("@wmtitle.")) {
    return true;
  }

  const name = norm(contactName);
  const company = norm(companyName);
  if (name === "ingrid bredeson" || name === "ingrid") {
    if (!company || company.includes("watermark")) return true;
  }
  if (company.includes("watermark") && name.startsWith("ingrid")) return true;

  return false;
}

/** Canonical email for known contacts; falls back to the stored value. */
export function canonicalContactEmail(
  contactName: string | null | undefined,
  email: string | null | undefined,
  companyName?: string | null
): string {
  if (isIngridWatermarkContact(contactName, email, companyName)) return INGRID_WATERMARK_EMAIL;
  if (findAgentIdByName(contactName) === "hubert-ngabirano") return HUBERT_EMAIL;
  return sanitizeContactField(email);
}

/** Canonical display + contact fields for Ingrid at Watermark. */
export function canonicalIngridPartyFields(
  party: Pick<TransactionParty, "name" | "email" | "company" | "phone">
): Pick<TransactionParty, "name" | "email" | "company" | "phone"> {
  const company = sanitizeContactField(party.company);
  return {
    name: INGRID_BREDESON_NAME,
    email: INGRID_WATERMARK_EMAIL,
    company:
      company && norm(company).includes("watermark") ? company : INGRID_WATERMARK_COMPANY,
    phone: sanitizeContactField(party.phone),
  };
}

export function normalizeContact(contact: Contact): Contact {
  const email = canonicalContactEmail(
    contact.contact_name,
    contact.email,
    contact.company_name
  );
  let contact_name = contact.contact_name;
  if (isIngridWatermarkContact(contact.contact_name, contact.email, contact.company_name)) {
    contact_name = INGRID_BREDESON_NAME;
  }
  if (email === (contact.email ?? "") && contact_name === contact.contact_name) return contact;
  return { ...contact, email, contact_name };
}

export function normalizePartyContact(party: TransactionParty): TransactionParty {
  let next = party;
  if (isIngridWatermarkContact(party.name, party.email, party.company)) {
    next = { ...party, ...canonicalIngridPartyFields(party) };
  }
  const email = canonicalContactEmail(next.name, next.email, next.company);
  const phone = sanitizeContactField(next.phone);
  if (email === next.email && phone === next.phone) return next;
  return { ...next, email, phone };
}

export function normalizePartyEmail(party: TransactionParty): TransactionParty {
  return normalizePartyContact(party);
}

export function normalizeParties(parties: TransactionParty[]): TransactionParty[] {
  return parties.map(normalizePartyContact);
}
