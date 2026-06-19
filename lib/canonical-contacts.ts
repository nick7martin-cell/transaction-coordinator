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
  return email ?? "";
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

export function normalizeParties(parties: TransactionParty[]): TransactionParty[] {
  return parties.map(normalizePartyEmail);
}
