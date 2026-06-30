import { findAgentIdByName, HUBERT_EMAIL } from "@/lib/agents";
import { sanitizeContactField } from "@/lib/format";
import type { Contact, TransactionParty } from "@/lib/types";

export const INGRID_WATERMARK_EMAIL = "teamingrid@wmtitle.com";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function isIngridAtWatermark(
  contactName: string | null | undefined,
  companyName?: string | null
): boolean {
  const name = norm(contactName);
  if (name === "ingrid bredeson") return true;
  if (name === "ingrid" && norm(companyName).includes("watermark")) return true;
  return false;
}

/** Canonical email for known contacts; falls back to the stored value. */
export function canonicalContactEmail(
  contactName: string | null | undefined,
  email: string | null | undefined,
  companyName?: string | null
): string {
  if (isIngridAtWatermark(contactName, companyName)) return INGRID_WATERMARK_EMAIL;
  if (findAgentIdByName(contactName) === "hubert-ngabirano") return HUBERT_EMAIL;
  return sanitizeContactField(email);
}

export function normalizeContact(contact: Contact): Contact {
  const email = canonicalContactEmail(
    contact.contact_name,
    contact.email,
    contact.company_name
  );
  if (email === (contact.email ?? "")) return contact;
  return { ...contact, email };
}

export function normalizePartyEmail(party: TransactionParty): TransactionParty {
  const email = canonicalContactEmail(party.name, party.email, party.company);
  if (email === party.email) return party;
  return { ...party, email };
}

function normalizePartyContacts(party: TransactionParty): TransactionParty {
  const withEmail = normalizePartyEmail(party);
  const email = sanitizeContactField(withEmail.email);
  const phone = sanitizeContactField(withEmail.phone);
  if (email === withEmail.email && phone === withEmail.phone) return withEmail;
  return { ...withEmail, email, phone };
}

export function normalizeParties(parties: TransactionParty[]): TransactionParty[] {
  return parties.map(normalizePartyContacts);
}
