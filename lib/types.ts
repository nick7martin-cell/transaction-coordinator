import type { CommissionResult } from "@/lib/commission";
import { teamSteadyEmailFor } from "@/lib/agents";

export type FinancingType = "conventional" | "FHA" | "VA" | "cash" | null;

export interface ExtractedData {
  propertyAddress: string | null;
  purchasePrice: number | null;
  closingDate: string | null;
  acceptanceDate: string | null;
  inspectionPeriodDays: number | null;
  inspectionContingencyExpirationDate: string | null;
  earnestMoney: number | null;
  earnestMoneyDueDate: string | null;
  financingType: FinancingType;
  financingPercentage: number | null;
  buyerBrokerCommissionPct: number | null;
  mlsNumber: string | null;
  pidNumber: string | null;
  buyerNames: string[];
  buyerEmails: string[];
  buyerPhones: string[];
  buyerAgentName: string | null;
  buyerAgentBrokerage: string | null;
  buyerAgentEmail: string | null;
  buyerAgentPhone: string | null;
  sellerNames: string[];
  sellerEmails: string[];
  sellerPhones: string[];
  listingAgentName: string | null;
  listingAgentBrokerage: string | null;
  listingAgentEmail: string | null;
  listingAgentPhone: string | null;
  /** True when the same brokerage / licensee represents both sides. */
  dualAgency: boolean;
  contingencies: string[];
  titleCompany: string | null;
  /** True when a pre-approval letter is included in the uploaded PDF. */
  hasPreApprovalLetter: boolean;
  /** Loan officer / lender contact from pre-approval letter (when detected). */
  lenderName: string | null;
  lenderCompany: string | null;
  lenderEmail: string | null;
  lenderPhone: string | null;
  confidence: number;
  flaggedForReview: boolean;
  errors: string[];
}

export type PersistedTransactionStatus = "active" | "closed" | "cancelled";

export interface Transaction {
  id: string;
  document_type: string;
  file_name: string;
  extracted_data: ExtractedData;
  flagged_for_review: boolean;
  /** Persisted lifecycle status (active, closed, cancelled). */
  status?: PersistedTransactionStatus | null;
  /** When true, closing-date auto-close is skipped (manual status change). */
  status_manual?: boolean;
  confidence: number;
  created_at: string;
  /** Custom property photo from transaction_meta.worksheet (data URL or hosted URL). */
  propertyPhotoUrl?: string | null;
  /** Team Steady agent from transaction_meta.commission (when loaded). */
  teamSteadyAgentName?: string | null;
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  type: "lender" | "title";
  company_name: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

// ── Transaction meta ──────────────────────────────────────────────────────────

export interface WorksheetOverrides {
  mlsNumber?: string;
  pidNumber?: string;
  sellerEmails?: string;
  sellerPhones?: string;
  buyerEmails?: string;
  buyerPhones?: string;
  listingAgentEmail?: string;
  listingAgentPhone?: string;
  listingAgentAddress?: string;
  buyerAgentEmail?: string;
  buyerAgentPhone?: string;
  teamAgentEmail?: string;
  teamAgentPhone?: string;
  notes?: string;
  [key: string]: string | undefined;
}

export interface TransactionMeta {
  transaction_id: string;
  lender_contact_id: string | null;
  /** Buyer's (Team Steady side) title company contact */
  title_contact_id: string | null;
  /** Seller's (other side) title company contact */
  seller_title_contact_id: string | null;
  commission: CommissionResult | null;
  worksheet: WorksheetOverrides | null;
  /** Editable, per-transaction roster of all parties (source of truth for the
   *  Transaction Parties cards and the Transaction Contacts list). */
  parties: TransactionParty[] | null;
  updated_at: string;
}

// ── Transaction parties (editable contacts roster) ─────────────────────────────

export type PartyRole =
  | "buyer"
  | "seller"
  | "buyer_agent"
  | "listing_agent"
  | "lender"
  | "buyer_title"
  | "seller_title"
  | "other"
  /** Dual agency: agent present but role not yet confirmed by the coordinator. */
  | "agent_unconfirmed";

export interface TransactionParty {
  id: string;
  name: string;
  role: PartyRole;
  company: string;
  email: string;
  phone: string;
}

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  buyer: "Buyer",
  seller: "Seller",
  buyer_agent: "Buyer's Agent",
  listing_agent: "Listing Agent",
  lender: "Lender",
  buyer_title: "Buyer's Title Company",
  seller_title: "Seller's Title Company",
  other: "Other",
  agent_unconfirmed: "Needs Confirmation",
};

/** Options shown in the role dropdown (the explicit set requested). */
export const PARTY_ROLE_OPTIONS: { value: PartyRole; label: string }[] = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "buyer_agent", label: "Buyer's Agent" },
  { value: "listing_agent", label: "Listing Agent" },
  { value: "lender", label: "Lender" },
  { value: "buyer_title", label: "Buyer's Title Company" },
  { value: "seller_title", label: "Seller's Title Company" },
  { value: "other", label: "Other" },
];

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function makeParty(p: Omit<TransactionParty, "id">): TransactionParty {
  return { id: randomId(), ...withTeamSteadyEmail(p) };
}

/** Fill in a Team Steady agent email when the name matches and no email is set. */
export function withTeamSteadyEmail<T extends { name: string; email: string }>(p: T): T {
  if (p.email) return p;
  const email = teamSteadyEmailFor(p.name);
  return email ? { ...p, email } : p;
}

/** Dual agency = same brokerage OR same licensee on both sides. */
export function detectDualAgency(d: ExtractedData): boolean {
  if (d.dualAgency) return true;
  const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
  const ba = norm(d.buyerAgentBrokerage);
  const la = norm(d.listingAgentBrokerage);
  if (ba && la && ba === la) return true;
  const bn = norm(d.buyerAgentName);
  const ln = norm(d.listingAgentName);
  if (bn && ln && bn === ln) return true;
  return false;
}

/**
 * Build the initial parties roster from extracted data. On dual-agency
 * transactions agent roles are intentionally left "Needs Confirmation" rather
 * than guessed.
 */
export function seedPartiesFromExtraction(d: ExtractedData): TransactionParty[] {
  const dual = detectDualAgency(d);
  const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
  const parties: TransactionParty[] = [];

  d.buyerNames.forEach((name, i) =>
    parties.push(
      makeParty({ name, role: "buyer", company: "", email: d.buyerEmails[i] ?? "", phone: d.buyerPhones[i] ?? "" })
    )
  );
  d.sellerNames.forEach((name, i) =>
    parties.push(
      makeParty({ name, role: "seller", company: "", email: d.sellerEmails[i] ?? "", phone: d.sellerPhones[i] ?? "" })
    )
  );

  const sameAgent =
    !!d.buyerAgentName && !!d.listingAgentName && norm(d.buyerAgentName) === norm(d.listingAgentName);

  if (d.buyerAgentName) {
    parties.push(
      makeParty({
        name: d.buyerAgentName,
        role: dual ? "agent_unconfirmed" : "buyer_agent",
        company: d.buyerAgentBrokerage ?? "",
        email: d.buyerAgentEmail ?? "",
        phone: d.buyerAgentPhone ?? "",
      })
    );
  }
  // Skip a duplicate listing-agent row when it's literally the same person.
  if (d.listingAgentName && !sameAgent) {
    parties.push(
      makeParty({
        name: d.listingAgentName,
        role: dual ? "agent_unconfirmed" : "listing_agent",
        company: d.listingAgentBrokerage ?? "",
        email: d.listingAgentEmail ?? "",
        phone: d.listingAgentPhone ?? "",
      })
    );
  }

  return parties;
}

function normPartyName(name: string): string {
  return name.trim().toLowerCase();
}

function partyListHasName(parties: TransactionParty[], name: string): boolean {
  const n = normPartyName(name);
  if (!n) return true;
  return parties.some((p) => normPartyName(p.name) === n);
}

/**
 * Add buyers, sellers, and agents from extracted data to an existing parties
 * roster. Skips any contact whose name already appears on the list.
 */
export function mergePartiesFromExtraction(
  existing: TransactionParty[],
  d: ExtractedData
): { parties: TransactionParty[]; added: { label: string; name: string }[] } {
  const parties = [...existing];
  const added: { label: string; name: string }[] = [];
  const dual = detectDualAgency(d);
  const norm = normPartyName;

  d.buyerNames.forEach((name, i) => {
    const trimmed = name?.trim();
    if (!trimmed || partyListHasName(parties, trimmed)) return;
    parties.push(
      makeParty({
        name: trimmed,
        role: "buyer",
        company: "",
        email: d.buyerEmails[i] ?? "",
        phone: d.buyerPhones[i] ?? "",
      })
    );
    added.push({ label: "Buyer", name: trimmed });
  });

  d.sellerNames.forEach((name, i) => {
    const trimmed = name?.trim();
    if (!trimmed || partyListHasName(parties, trimmed)) return;
    parties.push(
      makeParty({
        name: trimmed,
        role: "seller",
        company: "",
        email: d.sellerEmails[i] ?? "",
        phone: d.sellerPhones[i] ?? "",
      })
    );
    added.push({ label: "Seller", name: trimmed });
  });

  const sameAgent =
    !!d.buyerAgentName &&
    !!d.listingAgentName &&
    norm(d.buyerAgentName) === norm(d.listingAgentName);

  if (d.buyerAgentName?.trim() && !partyListHasName(parties, d.buyerAgentName)) {
    const trimmed = d.buyerAgentName.trim();
    parties.push(
      makeParty({
        name: trimmed,
        role: dual ? "agent_unconfirmed" : "buyer_agent",
        company: d.buyerAgentBrokerage ?? "",
        email: d.buyerAgentEmail ?? "",
        phone: d.buyerAgentPhone ?? "",
      })
    );
    added.push({
      label: dual ? "Agent (needs confirmation)" : "Buyer's Agent",
      name: trimmed,
    });
  }

  if (
    d.listingAgentName?.trim() &&
    !sameAgent &&
    !partyListHasName(parties, d.listingAgentName)
  ) {
    const trimmed = d.listingAgentName.trim();
    parties.push(
      makeParty({
        name: trimmed,
        role: dual ? "agent_unconfirmed" : "listing_agent",
        company: d.listingAgentBrokerage ?? "",
        email: d.listingAgentEmail ?? "",
        phone: d.listingAgentPhone ?? "",
      })
    );
    added.push({
      label: dual ? "Agent (needs confirmation)" : "Listing Agent",
      name: trimmed,
    });
  }

  return { parties, added };
}

// ── Coercion ──────────────────────────────────────────────────────────────────
// Handles both camelCase (current) and snake_case (legacy) field names so that
// records created before field renames still display correctly.

export function coerceExtractedData(
  raw: Partial<ExtractedData> | Record<string, unknown>
): ExtractedData {
  const r = raw as Record<string, unknown>;

  function str(a: string, b?: string): string | null {
    const v = r[a] ?? (b ? r[b] : undefined) ?? null;
    return typeof v === "string" ? v : null;
  }
  function num(a: string, b?: string): number | null {
    const v = r[a] ?? (b ? r[b] : undefined) ?? null;
    return typeof v === "number" ? v : null;
  }
  function arr(a: string, b?: string): string[] {
    const v = r[a] ?? (b ? r[b] : undefined);
    return Array.isArray(v) ? v.map(String) : [];
  }

  return {
    propertyAddress:                     str("propertyAddress", "property_address"),
    purchasePrice:                        num("purchasePrice", "purchase_price"),
    closingDate:                          str("closingDate", "closing_date"),
    acceptanceDate:                       str("acceptanceDate", "acceptance_date"),
    inspectionPeriodDays:                 num("inspectionPeriodDays", "inspection_period_days"),
    inspectionContingencyExpirationDate:  str("inspectionContingencyExpirationDate", "inspection_contingency_expiration_date"),
    earnestMoney:                         num("earnestMoney", "earnest_money"),
    earnestMoneyDueDate:                  str("earnestMoneyDueDate", "earnest_money_due_date"),
    financingType:                        (str("financingType", "financing_type") as FinancingType),
    financingPercentage:                  num("financingPercentage", "financing_percentage"),
    buyerBrokerCommissionPct:             num("buyerBrokerCommissionPct", "buyer_broker_commission_pct"),
    mlsNumber:                            str("mlsNumber", "mls_number"),
    pidNumber:                            str("pidNumber", "pid_number"),
    buyerNames:                           arr("buyerNames", "buyer_names"),
    buyerEmails:                          arr("buyerEmails", "buyer_emails"),
    buyerPhones:                          arr("buyerPhones", "buyer_phones"),
    buyerAgentName:                       str("buyerAgentName", "buyer_agent_name"),
    buyerAgentBrokerage:                  str("buyerAgentBrokerage", "buyer_agent_brokerage"),
    buyerAgentEmail:                      str("buyerAgentEmail", "buyer_agent_email"),
    buyerAgentPhone:                      str("buyerAgentPhone", "buyer_agent_phone"),
    sellerNames:                          arr("sellerNames", "seller_names"),
    sellerEmails:                         arr("sellerEmails", "seller_emails"),
    sellerPhones:                         arr("sellerPhones", "seller_phones"),
    listingAgentName:                     str("listingAgentName", "listing_agent_name"),
    listingAgentBrokerage:                str("listingAgentBrokerage", "listing_agent_brokerage"),
    listingAgentEmail:                    str("listingAgentEmail", "listing_agent_email"),
    listingAgentPhone:                    str("listingAgentPhone", "listing_agent_phone"),
    dualAgency:                           Boolean(r.dualAgency ?? r.dual_agency),
    contingencies:                        arr("contingencies"),
    titleCompany:                         str("titleCompany", "title_company"),
    hasPreApprovalLetter:                 Boolean(r.hasPreApprovalLetter ?? r.has_pre_approval_letter),
    lenderName:                           str("lenderName", "lender_name"),
    lenderCompany:                        str("lenderCompany", "lender_company"),
    lenderEmail:                          str("lenderEmail", "lender_email"),
    lenderPhone:                          str("lenderPhone", "lender_phone"),
    confidence:   typeof r.confidence === "number" ? Math.min(1, Math.max(0, r.confidence)) : 0,
    flaggedForReview: Boolean(r.flaggedForReview ?? r.flagged_for_review),
    errors: arr("errors"),
  };
}
