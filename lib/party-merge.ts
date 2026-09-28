import {
  canonicalContactEmail,
  canonicalIngridPartyFields,
  isIngridWatermarkContact,
  normalizePartyContact,
} from "@/lib/canonical-contacts";
import { OTHER_SIDE_TITLE_UNKNOWN, titleInfoForSide } from "@/lib/transaction-seed";
import { sanitizeContactField } from "@/lib/format";
import {
  detectDualAgency,
  makeParty,
  type ExtractedData,
  type TransactionParty,
} from "@/lib/types";

export type PartyMergeEntry = { label: string; name: string; detail?: string };

type TitleContactInfo = {
  company: string;
  name: string;
  email: string;
  phone: string;
};

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function normEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim().toLowerCase();
  return e.replace(/\.con$/, ".com");
}

function isBlank(value: string | null | undefined): boolean {
  return !sanitizeContactField(value);
}

function partyListHasName(parties: TransactionParty[], name: string): boolean {
  const n = normName(name);
  if (!n) return true;
  return parties.some((p) => normName(p.name) === n);
}

/** Dedupe by exact name, shared email, or known canonical identities (e.g. Ingrid). */
function rosterAlreadyHasPerson(
  parties: TransactionParty[],
  name: string,
  email?: string,
  company?: string
): boolean {
  if (partyListHasName(parties, name)) return true;

  const emailNorm = normEmail(canonicalContactEmail(name, email ?? "", company));
  if (emailNorm) {
    if (
      parties.some(
        (p) => normEmail(canonicalContactEmail(p.name, p.email, p.company)) === emailNorm
      )
    ) {
      return true;
    }
  }

  if (isIngridWatermarkContact(name, email, company)) {
    return parties.some((p) => isIngridWatermarkContact(p.name, p.email, p.company));
  }

  return false;
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

function preferLongerName(existing: string, incoming: string): string {
  const ex = existing.trim();
  const inc = incoming.trim();
  if (!inc) return ex;
  if (!ex) return inc;
  if (normName(ex) === normName(inc)) return ex.length >= inc.length ? ex : inc;

  const exParts = ex.split(/\s+/);
  const incParts = inc.split(/\s+/);
  if (
    incParts.length === 1 &&
    exParts.length > 1 &&
    normName(exParts[0]) === normName(incParts[0])
  ) {
    return ex;
  }
  return inc.length >= ex.length ? inc : ex;
}

function applyPartyUpdate(
  parties: TransactionParty[],
  id: string,
  next: TransactionParty
): TransactionParty[] {
  return parties.map((p) => (p.id === id ? normalizePartyContact(next) : p));
}

function hasTitleInfo(info: TitleContactInfo): boolean {
  return !!(info.company.trim() || info.name.trim() || info.email.trim() || info.phone.trim());
}

function normalizeTitleInfo(info: TitleContactInfo): TitleContactInfo {
  if (isIngridWatermarkContact(info.name, info.email, info.company)) {
    return canonicalIngridPartyFields(info);
  }
  return {
    company: sanitizeContactField(info.company),
    name: sanitizeContactField(info.name),
    email: sanitizeContactField(info.email),
    phone: sanitizeContactField(info.phone),
  };
}

/** Auto-seeded Team Steady title contacts — replace when supplemental extraction names someone else. */
function isReplaceableDefaultTitle(party: TransactionParty): boolean {
  if (isIngridWatermarkContact(party.name, party.email, party.company)) return true;

  const name = normName(party.name);
  const company = party.company.trim().toLowerCase();
  const email = party.email.trim().toLowerCase();
  return (
    (name.includes("lacey") && name.includes("rentz")) ||
    company.includes("all american title") ||
    email.includes("allamericantitleco.com")
  );
}

function extractedTitleDiffers(
  existing: TransactionParty,
  info: TitleContactInfo
): boolean {
  if (
    isIngridWatermarkContact(existing.name, existing.email, existing.company) &&
    isIngridWatermarkContact(info.name, info.email, info.company)
  ) {
    return false;
  }

  if (info.company.trim() && normName(info.company) !== normName(existing.company)) return true;
  if (info.name.trim() && normName(info.name) !== normName(existing.name)) {
    const preferred = preferLongerName(existing.name, info.name);
    if (normName(preferred) !== normName(existing.name)) return true;
  }
  if (
    info.email.trim() &&
    normEmail(info.email) !== normEmail(existing.email) &&
    normEmail(canonicalContactEmail(info.name, info.email, info.company)) !==
      normEmail(canonicalContactEmail(existing.name, existing.email, existing.company))
  ) {
    return true;
  }
  return false;
}

function mergeTitleParty(
  parties: TransactionParty[],
  role: "buyer_title" | "seller_title",
  rawInfo: TitleContactInfo,
  added: PartyMergeEntry[],
  updated: PartyMergeEntry[]
): TransactionParty[] {
  const info = normalizeTitleInfo(rawInfo);
  if (!hasTitleInfo(info)) return parties;

  const label = role === "buyer_title" ? "Buyer's title" : "Seller's title";
  let next = [...parties];
  const existing = findPartyByRole(next, role);

  if (existing) {
    const isUnknownSlot = existing.company === OTHER_SIDE_TITLE_UNKNOWN;

    const sameIngridDefault =
      isIngridWatermarkContact(existing.name, existing.email, existing.company) &&
      isIngridWatermarkContact(info.name, info.email, info.company);

    const replaceDefault =
      !sameIngridDefault &&
      isReplaceableDefaultTitle(existing) &&
      extractedTitleDiffers(existing, info);

    if (sameIngridDefault) {
      const merged = normalizePartyContact({
        ...existing,
        ...fillBlankFields(existing, info).party,
        ...canonicalIngridPartyFields(existing),
      });
      next = applyPartyUpdate(next, existing.id, merged);
      updated.push({
        label,
        name: merged.name || merged.company || role,
        detail: "canonical Watermark / Ingrid contact",
      });
      return next;
    }

    if (isUnknownSlot || replaceDefault) {
      next = applyPartyUpdate(next, existing.id, {
        ...existing,
        company: info.company || (isUnknownSlot ? "" : existing.company),
        name: preferLongerName(existing.name, info.name) || existing.name,
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
    const withName = {
      ...party,
      name: preferLongerName(party.name, info.name) || party.name,
    };

    if (fields.length > 0 || withName.name !== party.name) {
      next = applyPartyUpdate(next, existing.id, withName);
      updated.push({
        label,
        name: withName.name || withName.company || role,
        detail: fields.length > 0 ? fields.join(", ") : "name",
      });
    }
    return next;
  }

  next.push(
    normalizePartyContact(
      makeParty({
        role,
        name: info.name,
        company: info.company,
        email: info.email,
        phone: info.phone,
      })
    )
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

function isExtractedSellerSideTitleCloser(
  name: string,
  email: string,
  d: ExtractedData
): boolean {
  const sellerTitle = normalizeTitleInfo(titleInfoForSide(d, "seller"));
  if (!hasTitleInfo(sellerTitle)) return false;

  const emailNorm = normEmail(email);
  const companyNorm = normName(sellerTitle.company);
  if (companyNorm.includes("all american") && emailNorm.includes("allamericantitle")) {
    return true;
  }
  if (emailNorm.includes("teamjade@")) return true;

  const closerNorm = normName(sellerTitle.name);
  const first = normName(name.split(/\s+/)[0] ?? "");
  if (first && closerNorm.includes(first) && emailNorm.includes("allamericantitle")) {
    return true;
  }
  return false;
}

function rolePriority(role: TransactionParty["role"]): number {
  switch (role) {
    case "buyer_title":
      return 100;
    case "seller_title":
      return 90;
    case "buyer_agent":
    case "listing_agent":
      return 80;
    case "agent_unconfirmed":
      return 70;
    case "lender":
      return 60;
    case "buyer":
    case "seller":
      return 20;
    default:
      return 10;
  }
}

function mergeTwoParties(keep: TransactionParty, drop: TransactionParty): TransactionParty {
  const primary = rolePriority(keep.role) >= rolePriority(drop.role) ? keep : drop;
  const secondary = primary.id === keep.id ? drop : keep;
  const filled = fillBlankFields(primary, {
    name: secondary.name,
    company: secondary.company,
    email: secondary.email,
    phone: secondary.phone,
  }).party;
  return normalizePartyContact({
    ...filled,
    name: preferLongerName(filled.name, secondary.name),
    role: primary.role,
  });
}

function dedupeRoster(parties: TransactionParty[]): TransactionParty[] {
  let next = parties.map(normalizePartyContact);

  const ingrid = next.filter((p) => isIngridWatermarkContact(p.name, p.email, p.company));
  if (ingrid.length > 1) {
    const keep =
      ingrid.find((p) => p.role === "buyer_title") ??
      ingrid.sort((a, b) => rolePriority(b.role) - rolePriority(a.role))[0];
    const canonical = normalizePartyContact({
      ...keep,
      ...canonicalIngridPartyFields(keep),
      role: keep.role === "seller_title" ? keep.role : "buyer_title",
    });
    next = next.filter(
      (p) => !isIngridWatermarkContact(p.name, p.email, p.company) || p.id === keep.id
    );
    next = next.map((p) => (p.id === keep.id ? canonical : p));
  }

  const byEmail = new Map<string, TransactionParty>();
  const noEmail: TransactionParty[] = [];

  for (const p of next) {
    const email = normEmail(canonicalContactEmail(p.name, p.email, p.company));
    if (!email) {
      noEmail.push(p);
      continue;
    }
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, p);
      continue;
    }
    byEmail.set(email, mergeTwoParties(existing, p));
  }

  next = [...byEmail.values(), ...noEmail];

  for (const role of ["buyer_title", "seller_title"] as const) {
    const slots = next.filter((p) => p.role === role);
    if (slots.length <= 1) continue;
    const keep = slots.sort((a, b) => {
      const score = (p: TransactionParty) =>
        (p.email ? 4 : 0) + (p.phone ? 2 : 0) + (p.name ? 1 : 0);
      return score(b) - score(a);
    })[0];
    next = next.filter((p) => p.role !== role || p.id === keep.id);
  }

  return next.map(normalizePartyContact);
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

    const email = sanitizeContactField(d.buyerEmails[i]);
    if (rosterAlreadyHasPerson(parties, trimmed, email)) return;

    const existingBuyer = findPartyByRoleAndName(parties, "buyer", trimmed);
    if (existingBuyer) {
      const { party, updated: fields } = fillBlankFields(existingBuyer, {
        email,
        phone: sanitizeContactField(d.buyerPhones[i]),
      });
      if (fields.length > 0) {
        parties = applyPartyUpdate(parties, existingBuyer.id, party);
        updated.push({ label: "Buyer", name: trimmed, detail: fields.join(", ") });
      }
      return;
    }

    parties.push(
      makeParty({
        name: trimmed,
        role: "buyer",
        company: "",
        email,
        phone: sanitizeContactField(d.buyerPhones[i]),
      })
    );
    added.push({ label: "Buyer", name: trimmed });
  });

  d.sellerNames.forEach((name, i) => {
    const trimmed = name?.trim();
    if (!trimmed) return;

    const email = sanitizeContactField(d.sellerEmails[i]);
    if (isExtractedSellerSideTitleCloser(trimmed, email, d)) return;
    if (rosterAlreadyHasPerson(parties, trimmed, email)) return;

    const existingSeller = findPartyByRoleAndName(parties, "seller", trimmed);
    if (existingSeller) {
      const { party, updated: fields } = fillBlankFields(existingSeller, {
        email,
        phone: sanitizeContactField(d.sellerPhones[i]),
      });
      if (fields.length > 0) {
        parties = applyPartyUpdate(parties, existingSeller.id, party);
        updated.push({ label: "Seller", name: trimmed, detail: fields.join(", ") });
      }
      return;
    }

    parties.push(
      makeParty({
        name: trimmed,
        role: "seller",
        company: "",
        email,
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
    } else if (!rosterAlreadyHasPerson(parties, trimmed, d.buyerAgentEmail ?? "")) {
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
    } else if (!rosterAlreadyHasPerson(parties, trimmed, d.listingAgentEmail ?? "")) {
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

  parties = dedupeRoster(parties);

  return { parties, added, updated };
}
