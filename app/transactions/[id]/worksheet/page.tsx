"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import {
  buildAgentNotes,
  buildOutsideReferralWorksheetFields,
  buildWorksheetReferralLines,
  formatMoney,
} from "@/lib/commission";
import { formatDate, worksheetPdfTitle } from "@/lib/format";
import {
  coerceExtractedData,
  detectDualAgency,
  seedPartiesFromExtraction,
  type Contact,
  type Transaction,
  type TransactionMeta,
  type TransactionParty,
} from "@/lib/types";
import {
  defaultCommissionCheckboxValues,
  WORKSHEET_FIELD_DEFAULTS,
  type CommissionCheckboxKey,
} from "@/lib/worksheet-defaults";
import { OTHER_SIDE_TITLE_UNKNOWN } from "@/lib/transaction-seed";
import { findAgentIdByName, teamSteadyEmailFor } from "@/lib/agents";

// ── Inline field (uncontrolled input that saves on blur) ──────────────────────

type FieldProps = {
  k: string;
  auto?: string | null;
  saved?: string;
  onSave: (k: string, v: string) => void;
  style?: React.CSSProperties;
  className?: string;
};

function F({ k, auto, saved, onSave, style, className = "" }: FieldProps) {
  const defaultValue = saved !== undefined && saved !== "" ? saved : (auto ?? "");
  return (
    <input
      type="text"
      defaultValue={defaultValue}
      onBlur={(e) => {
        if (e.target.value !== defaultValue) onSave(k, e.target.value);
      }}
      style={style}
      className={`ws-field ${className}`}
      data-ws-key={k}
    />
  );
}

function Cb({
  k,
  saved,
  onSave,
}: {
  k: string;
  saved?: string;
  onSave: (k: string, v: string) => void;
}) {
  const checked = saved === "true";
  const [isChecked, setIsChecked] = useState(checked);

  useEffect(() => {
    setIsChecked(checked);
  }, [checked]);

  return (
    <input
      type="checkbox"
      checked={isChecked}
      onChange={(e) => {
        const next = e.target.checked;
        setIsChecked(next);
        onSave(k, next ? "true" : "false");
      }}
      className="ws-checkbox"
      aria-label={`Applicable: ${k}`}
    />
  );
}

type MakeFieldProps = Omit<FieldProps, "onSave">;
type MF = (props: MakeFieldProps) => React.JSX.Element;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorksheetPage() {
  const params = useParams();
  const id = params.id as string;

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [meta, setMeta] = useState<TransactionMeta | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingIndicator, setSavingIndicator] = useState(false);
  const [worksheetOverrides, setWorksheetOverrides] = useState<Record<string, string>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOverrides = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      // Always pull the freshest saved state from Supabase (never cached).
      const [tRes, mRes, cRes] = await Promise.all([
        fetch(`/api/transactions/${id}`, { cache: "no-store" }),
        fetch(`/api/transactions/${id}/meta`, { cache: "no-store" }),
        fetch("/api/contacts", { cache: "no-store" }),
      ]);
      const [tData, mData, cData] = await Promise.all([
        tRes.json(), mRes.json(), cRes.json(),
      ]);
      if (!tRes.ok) { setError(tData.error || "Transaction not found"); return; }
      const m = mData.meta ?? null;
      console.log(
        `[worksheet] loaded ${Array.isArray(m?.parties) ? m.parties.length : 0} contacts` +
        `, commission ${m?.commission?.buyer || m?.commission?.seller ? "present" : "none"}`
      );
      setTransaction(tData.transaction);
      setMeta(m);
      setContacts(cData.contacts ?? []);
      setWorksheetOverrides({});
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addressForTitle =
    (meta?.worksheet?.propertyAddress ?? "").trim() ||
    (transaction ? coerceExtractedData(transaction.extracted_data).propertyAddress ?? "" : "");

  useEffect(() => {
    if (loading) return;
    const title = worksheetPdfTitle(addressForTitle);
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [loading, addressForTitle]);

  function saveField(k: string, v: string) {
    if (k === "propertyAddress") {
      document.title = worksheetPdfTitle(v);
    }
    pendingOverrides.current[k] = v;
    setWorksheetOverrides((prev) => ({ ...prev, [k]: v }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingIndicator(true);
    saveTimer.current = setTimeout(async () => {
      const patch = { ...pendingOverrides.current };
      pendingOverrides.current = {};
      await fetch(`/api/transactions/${id}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worksheet: patch }),
      });
      setSavingIndicator(false);
    }, 800);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (error || !transaction) {
    return <div className="p-8 text-red-600">{error || "Not found"}</div>;
  }

  const data = coerceExtractedData(transaction.extracted_data);
  const ws = { ...(meta?.worksheet ?? {}), ...worksheetOverrides };
  const commission = meta?.commission ?? null;

  const commissionCheckboxDefaults = defaultCommissionCheckboxValues(
    commission,
    data.financingType,
    data.buyerBrokerCommissionPct
  );

  function worksheetCheckboxValue(k: CommissionCheckboxKey): string {
    const saved = ws[k];
    if (saved === "true" || saved === "false") return saved;
    return commissionCheckboxDefaults[k];
  }

  // ── Parties roster is the source of truth for every contact field. ──────────
  // Falls back to the extraction only when no roster has been saved yet.
  const parties: TransactionParty[] =
    meta?.parties && meta.parties.length > 0
      ? meta.parties
      : seedPartiesFromExtraction(data);

  const buyers       = parties.filter((p) => p.role === "buyer");
  const sellers      = parties.filter((p) => p.role === "seller");
  const buyerAgent   = parties.find((p) => p.role === "buyer_agent") ?? null;
  const listingAgent = parties.find((p) => p.role === "listing_agent") ?? null;
  const lenderP      = parties.find((p) => p.role === "lender") ?? null;
  const buyerTitleP  = parties.find((p) => p.role === "buyer_title") ?? null;
  const sellerTitleP = parties.find((p) => p.role === "seller_title") ?? null;

  // Normalize a party or a legacy saved Contact into one shape for the form.
  type Info = { company: string; name: string; email: string; phone: string };
  const fromParty = (p: TransactionParty | null): Info | null =>
    p ? { company: p.company, name: p.name, email: p.email, phone: p.phone } : null;
  const fromContact = (c: Contact | null): Info | null =>
    c ? { company: c.company_name, name: c.contact_name, email: c.email ?? "", phone: c.phone ?? "" } : null;

  // Parties roster wins; fall back to legacy contact-id selections.
  const lender        = fromParty(lenderP)      ?? fromContact(contacts.find((c) => c.id === meta?.lender_contact_id) ?? null);
  const buyerTitleCo  = fromParty(buyerTitleP)  ?? fromContact(contacts.find((c) => c.id === meta?.title_contact_id) ?? null);
  const sellerTitleCo =
    fromParty(sellerTitleP) ??
    fromContact(contacts.find((c) => c.id === meta?.seller_title_contact_id) ?? null) ??
    (!sellerTitleP ? { company: OTHER_SIDE_TITLE_UNKNOWN, name: "", email: "", phone: "" } : null);

  const field: MF = (props) => (
    <F {...props} saved={ws[props.k]} onSave={saveField} />
  );
  const f = field;
  const cb = (k: CommissionCheckboxKey) => (
    <Cb k={k} saved={worksheetCheckboxValue(k)} onSave={saveField} />
  );
  // Plain (non-commission) checkbox bound to a free-form worksheet key.
  const cbox = (k: string) => <Cb k={k} saved={ws[k]} onSave={saveField} />;

  // Sale / earnest pre-population
  const salePriceStr = data.purchasePrice ? `$${formatMoney(data.purchasePrice)}` : "";
  const earnestStr   = data.earnestMoney  ? `$${formatMoney(data.earnestMoney)}`  : "";

  // Commission values (#7 — fall back to extraction data for dollar amount)
  const extractedBuyerDollars =
    data.purchasePrice && data.buyerBrokerCommissionPct
      ? formatMoney(data.purchasePrice * data.buyerBrokerCommissionPct / 100)
      : "";

  const buyerCommPct     = commission?.buyer?.commissionPct?.toString()
                         ?? (data.buyerBrokerCommissionPct?.toString() ?? "");
  const buyerCommDollars = commission?.buyer
                         ? formatMoney(commission.buyer.totalCommission)
                         : extractedBuyerDollars;
  const sellerCommPct    = commission?.seller?.commissionPct?.toString() ?? "";
  const sellerCommDollars= commission?.seller ? formatMoney(commission.seller.totalCommission) : "";

  // Referral "Paid to" — worksheet uses two lines when a mentor is involved.
  const sellingReferral = commission?.buyer
    ? buildWorksheetReferralLines(commission.buyer)
    : { line1: "", line2: "" };
  const listingReferral = commission?.seller
    ? buildWorksheetReferralLines(commission.seller)
    : { line1: "", line2: "" };

  const listingOutsideRef = commission?.seller
    ? buildOutsideReferralWorksheetFields(commission.seller)
    : null;
  const sellingOutsideRef = commission?.buyer
    ? buildOutsideReferralWorksheetFields(commission.buyer)
    : null;

  const commissionNotesLines: string[] = [];
  if (commission?.buyer)  commissionNotesLines.push(buildAgentNotes(commission.buyer));
  if (commission?.seller) commissionNotesLines.push(buildAgentNotes(commission.seller));
  const commissionNotesAuto = commissionNotesLines.join(" | ");

  const brokerCommPaidByAuto =
    commission?.side === "buyer"
      ? "BUYER"
      : commission?.side === "seller"
        ? "SELLER"
        : undefined;

  const REMAX_COMPANY = "RE/MAX Results";
  const REMAX_ADDRESS = "1609 Hennepin Ave, Minneapolis MN 55403";

  // For dual agency the same Team Steady agent covers both sides — find them
  // from any agent role so both company columns are auto-populated.
  const isDualAgency = detectDualAgency(data);
  const dualAgentParty = isDualAgency
    ? (buyerAgent ??
       listingAgent ??
       parties.find((p) => p.role === "agent_unconfirmed") ??
       null)
    : null;

  // Effective agents used for company column derivation.
  const effectiveBuyerAgent   = dualAgentParty ?? buyerAgent;
  const effectiveListingAgent = dualAgentParty ?? listingAgent;

  // Listing Company = listing agent. Selling Company = buyer's agent.
  // Team Steady agents get the canonical RE/MAX company, address, and email.
  const isTeamSteadyBuyerAgent   = !!findAgentIdByName(effectiveBuyerAgent?.name);
  const isTeamSteadyListingAgent = !!findAgentIdByName(effectiveListingAgent?.name);

  const listingCoAuto      = isTeamSteadyListingAgent ? REMAX_COMPANY : (effectiveListingAgent?.company ?? "");
  const listingAddressAuto = isTeamSteadyListingAgent ? REMAX_ADDRESS : "";
  const listingEmailAuto   = isTeamSteadyListingAgent
    ? (teamSteadyEmailFor(effectiveListingAgent?.name) ?? effectiveListingAgent?.email ?? "")
    : (effectiveListingAgent?.email ?? "");

  const sellingCoAuto        = isTeamSteadyBuyerAgent ? REMAX_COMPANY : (effectiveBuyerAgent?.company ?? "");
  const sellingAddressAuto   = isTeamSteadyBuyerAgent ? REMAX_ADDRESS : "";
  const sellingAssociateAuto = effectiveBuyerAgent?.name  ?? "";
  const sellingEmailAuto     = isTeamSteadyBuyerAgent
    ? (teamSteadyEmailFor(effectiveBuyerAgent?.name) ?? effectiveBuyerAgent?.email ?? "")
    : (effectiveBuyerAgent?.email ?? "");
  const sellingPhoneAuto     = effectiveBuyerAgent?.phone ?? "";

  function handlePrint() {
    const addressInput = document.querySelector<HTMLInputElement>(
      '.worksheet input[data-ws-key="propertyAddress"]'
    );
    document.title = worksheetPdfTitle(addressInput?.value || addressForTitle);
    window.print();
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between bg-slate-900 px-6 py-3 text-white">
        <div>
          <p className="font-semibold text-sm">Closing Worksheet — CWS 650</p>
          <p className="text-xs text-slate-400">{data.propertyAddress || transaction.file_name}</p>
        </div>
        <div className="flex items-center gap-3">
          {savingIndicator && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          )}
          <p className="text-xs text-slate-400">Click any underlined field to edit</p>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-white text-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-100 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print / Export PDF
          </button>
        </div>
      </div>

      {/* ── Printable Form (matches RE/MAX Results CWS 650 03/2025) ── */}
      <div className="worksheet mx-auto" style={{ width: "8.5in" }}>
       <div className="ws-content">

        {/* Header: RE/MAX Results logo left, CLOSING WORKSHEET centered */}
        <div className="ws-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/remax-results-logo.png" alt="RE/MAX Results" className="ws-logo" />
          <div>
            <div className="ws-title">CLOSING WORKSHEET</div>
            <div className="ws-subtitle">Must be typed and filled out completely.</div>
          </div>
        </div>

        {/* Sale Price / Final Acceptance Date / MLS# — column positions fixed;
            only the underline field widths are shortened to match the reference. */}
        <div className="ws-line">
          <div className="ws-seg" style={{ width: "2.5in" }}>
            <span className="ws-b">Sale Price $</span>
            {f({ k: "salePrice", auto: salePriceStr, style: { width: "0.95in" } })}
          </div>
          <div className="ws-seg" style={{ width: "3.4in" }}>
            <span className="ws-b">Final Acceptance Date:</span>
            {f({ k: "acceptanceDate", auto: formatDate(data.acceptanceDate), style: { width: "1.28in" } })}
          </div>
          <div className="ws-seg" style={{ flex: "1 1 0%" }}>
            <span className="ws-b">MLS#</span>
            {f({ k: "mlsNumber", className: "flex-1" })}
          </div>
        </div>

        {/* Earnest / Closing Date */}
        <div className="ws-line">
          <div className="ws-seg" style={{ width: "2.5in" }}>
            <span className="ws-b">Earnest $</span>
            {f({ k: "earnest", auto: earnestStr, style: { width: "1.15in" } })}
          </div>
          <div className="ws-seg" style={{ width: "3.4in" }}>
            <span className="ws-b">Closing Date:</span>
            {f({ k: "closingDate", auto: formatDate(data.closingDate), style: { width: "0.98in" } })}
          </div>
        </div>

        {/* Earnest deposited question */}
        <div className="ws-line">
          <span>Earnest Money deposited by broker within 3 business days from final acceptance date of PA?</span>
          <span className="ws-label ml-2">Yes</span>{cbox("earnestDepositedYes")}
          <span className="ws-label">No</span>{cbox("earnestDepositedNo")}
        </div>
        <div className="ws-line" style={{ justifyContent: "center" }}>
          <span className="ws-label">TrustFunds</span>{cbox("trustFunds")}
          <span className="ws-label ml-6">Check</span>{cbox("check")}
        </div>

        <div className="ws-divider" aria-hidden />

        {/* Property Address */}
        <div className="ws-line">
          <span className="ws-b ws-label">Property Address:</span>
          {f({ k: "propertyAddress", auto: data.propertyAddress, className: "flex-1" })}
        </div>

        {/* PID / Property Type / Year Built — 3-column grid for vertical alignment */}
        <div className="ws-prop-row">
          <div className="ws-prop-col">
            <span className="ws-label">PID #:</span>
            {f({ k: "pidNumber", auto: data.pidNumber, className: "flex-1" })}
          </div>
          <div className="ws-prop-col">
            <span className="ws-label">Property Type:</span>
            {f({ k: "propertyType", auto: WORKSHEET_FIELD_DEFAULTS.propertyType, className: "flex-1" })}
          </div>
          <div className="ws-prop-col">
            <span className="ws-label">Year Built:</span>
            {f({ k: "yearBuilt", className: "flex-1" })}
          </div>
        </div>

        {/* HOA / Self-Managed / Number of Loans — same column grid */}
        <div className="ws-prop-row">
          <div className="ws-prop-col">
            <span className="ws-label">HOA:&nbsp;&nbsp;Contact:</span>
            {f({ k: "hoaContact", className: "flex-1" })}
          </div>
          <div className="ws-prop-col">
            <span className="ws-label">Is HOA Self-Managed?</span>
            {f({ k: "hoaSelfManaged", className: "flex-1" })}
          </div>
          <div className="ws-prop-col">
            <span className="ws-label">Number of Loans on Property:</span>
            {f({ k: "numLoans", className: "flex-1" })}
          </div>
        </div>

        <div className="ws-divider" aria-hidden />

        {/* SELLER */}
        <div className="ws-line">
          <span className="ws-b">SELLER:</span>
          <span>(If married, both parties must sign Purchase Agreement &amp; Listing Contract)</span>
        </div>
        <div className="ws-two-col">
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">Name 1:</span>
              {f({ k: "seller1Name", auto: sellers[0]?.name ?? "", style: { width: "150px" } })}
              <span className="ws-b ws-label ml-4">Status:</span>
              {f({ k: "seller1Status", style: { width: "70px" } })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Email 1:</span>
              {f({ k: "seller1Email", auto: sellers[0]?.email ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Phone:</span>
              {f({ k: "seller1Phone", auto: sellers[0]?.phone ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Current Address:</span>
              {f({ k: "seller1Address", className: "flex-1" })}
            </div>
          </div>
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">Name 1:</span>
              {f({ k: "seller2Name", auto: sellers[1]?.name ?? "", style: { width: "150px" } })}
              <span className="ws-b ws-label ml-4">Status:</span>
              {f({ k: "seller2Status", style: { width: "70px" } })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Email 1:</span>
              {f({ k: "seller2Email", auto: sellers[1]?.email ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Phone:</span>
              {f({ k: "seller2Phone", auto: sellers[1]?.phone ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Current Address:</span>
              {f({ k: "seller2Address", className: "flex-1" })}
            </div>
          </div>
        </div>

        <div className="ws-divider" aria-hidden />

        {/* BUYER */}
        <div className="ws-line">
          <span className="ws-b">BUYER:</span>
        </div>
        <div className="ws-two-col">
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">Name 1:</span>
              {f({ k: "buyer1Name", auto: buyers[0]?.name ?? "", style: { width: "150px" } })}
              <span className="ws-b ws-label ml-4">Status:</span>
              {f({ k: "buyer1Status", style: { width: "70px" } })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Email 1:</span>
              {f({ k: "buyer1Email", auto: buyers[0]?.email ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Phone:</span>
              {f({ k: "buyer1Phone", auto: buyers[0]?.phone ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Current Address:</span>
              {f({ k: "buyer1Address", className: "flex-1" })}
            </div>
          </div>
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">Name 1:</span>
              {f({ k: "buyer2Name", auto: buyers[1]?.name ?? "", style: { width: "150px" } })}
              <span className="ws-b ws-label ml-4">Status:</span>
              {f({ k: "buyer2Status", style: { width: "70px" } })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Email 1:</span>
              {f({ k: "buyer2Email", auto: buyers[1]?.email ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Phone:</span>
              {f({ k: "buyer2Phone", auto: buyers[1]?.phone ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Current Address:</span>
              {f({ k: "buyer2Address", className: "flex-1" })}
            </div>
          </div>
        </div>

        <div className="ws-divider" aria-hidden />

        {/* EXISTING SELLER FINANCING | SELLER'S & BUYER'S TITLE COMPANY */}
        <div className="ws-two-col">
          <div className="ws-col">
            <div className="ws-subhead">EXISTING SELLER FINANCING</div>
            <div className="ws-line">
              <span className="ws-label">Mortgage Company:</span>
              {f({ k: "mortgageCo1", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Loan #:</span>
              {f({ k: "loanNum1", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Mortgage Company:</span>
              {f({ k: "mortgageCo2", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Loan #:</span>
              {f({ k: "loanNum2", className: "flex-1" })}
            </div>
          </div>
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">SELLER&apos;S TITLE COMPANY:</span>
              {f({ k: "sellerTitleCo", auto: sellerTitleCo?.company ?? OTHER_SIDE_TITLE_UNKNOWN, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Seller&apos;s Closer:</span>
              {f({ k: "sellerCloser", auto: sellerTitleCo?.name ?? "", style: { width: "130px" } })}
              <span className="ws-label ml-2">Ph:</span>
              {f({ k: "sellerCloserPh", auto: sellerTitleCo?.phone ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Email:</span>
              {f({ k: "sellerCloserEmail", auto: sellerTitleCo?.email ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-b ws-label">BUYER&apos;S TITLE COMPANY:</span>
              {f({ k: "buyerTitleCo", auto: buyerTitleCo?.company ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Buyer&apos;s Closer:</span>
              {f({ k: "buyerCloser", auto: buyerTitleCo?.name ?? "", style: { width: "130px" } })}
              <span className="ws-label ml-2">Ph:</span>
              {f({ k: "buyerCloserPh", auto: buyerTitleCo?.phone ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Email:</span>
              {f({ k: "buyerCloserEmail", auto: buyerTitleCo?.email ?? "", className: "flex-1" })}
            </div>
          </div>
        </div>

        {/* BUYER NEW FINANCING | CLOSING */}
        <div className="ws-two-col">
          <div className="ws-col">
            <div className="ws-subhead">BUYER NEW FINANCING</div>
            <div className="ws-line">
              <span className="ws-label">Lender:</span>
              {f({ k: "lender", auto: lender?.company, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Type of Financing:</span>
              {f({ k: "financingType", auto: data.financingType?.toUpperCase() ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Loan Officer:</span>
              {f({ k: "loanOfficer", auto: lender?.name, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Lender Email:</span>
              {f({ k: "lenderEmail", auto: lender?.email, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Lender Phone:</span>
              {f({ k: "lenderPhone", auto: lender?.phone, className: "flex-1" })}
            </div>
          </div>
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">CLOSING LOCATION:</span>
              {f({ k: "closingLocation", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-b ws-label">CLOSING NOTES:</span>
              {f({ k: "closingNotes", className: "flex-1" })}
            </div>
            <div className="ws-line">
              {f({ k: "closingNotes2", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Seller Paid Buyer Concessions = $</span>
              {f({ k: "concessionsDollars", auto: WORKSHEET_FIELD_DEFAULTS.concessionsDollars, style: { width: "90px" } })}
              <span className="ws-label ml-1">or</span>
              {f({ k: "concessionsPct", style: { width: "50px" } })}
              <span className="ws-label">%</span>
            </div>
            <div className="ws-line">
              <span className="ws-label">Home Warranty: Yes</span>
              {f({ k: "hwYes", style: { width: "44px" } })}
              <span className="ws-label ml-1">No</span>
              {f({ k: "hwNo", style: { width: "54px" } })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Home Warranty Co:</span>
              {f({ k: "homeWarrantyCo", className: "flex-1" })}
            </div>
          </div>
        </div>

        <div className="ws-divider" aria-hidden />

        {/* LISTING COMPANY | SELLING COMPANY */}
        <div className="ws-two-col">
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">LISTING COMPANY:</span>
              {f({ k: "listingCo", auto: listingCoAuto, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Address:</span>
              {f({ k: "listingAddress", auto: listingAddressAuto, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Associate:</span>
              {f({ k: "listingAssociate", auto: effectiveListingAgent?.name ?? "", className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">E-Mail:</span>
              {f({ k: "listingEmail", auto: listingEmailAuto, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Phone:</span>
              {f({ k: "listingPhone", auto: effectiveListingAgent?.phone ?? "", className: "flex-1" })}
            </div>
          </div>
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">SELLING COMPANY:</span>
              {f({ k: "sellingCo", auto: sellingCoAuto, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Address:</span>
              {f({ k: "sellingAddress", auto: sellingAddressAuto, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Associate:</span>
              {f({ k: "sellingAssociate", auto: sellingAssociateAuto, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">E-Mail:</span>
              {f({ k: "sellingEmail", auto: sellingEmailAuto, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Phone:</span>
              {f({ k: "sellingPhone", auto: sellingPhoneAuto, className: "flex-1" })}
            </div>
          </div>
        </div>

        {/* COMMISSIONS */}
        <div className="ws-line ws-commissions-head">
          <span className="ws-b">COMMISSIONS (Check and Complete as Applicable):</span>
        </div>

        <div className="ws-comm-block">
          <div className="ws-comm-row">
            <div className="ws-comm-lead">
              {cb("listingBrokerCheck")}
              <span className="ws-label"><strong>Seller</strong> Paying <strong>LISTING</strong> Broker Compensation:</span>
            </div>
            <div className="ws-comm-pct">{f({ k: "listingBrokerPct", auto: sellerCommPct, style: { width: "100%" } })}</div>
            <span className="ws-label">% / $</span>
            {f({ k: "listingBrokerDollars", auto: sellerCommDollars, style: { width: "165px" } })}
            <span className="ws-comm-note" />
          </div>

          <div className="ws-comm-row">
            <div className="ws-comm-lead">
              {cb("buyerBrokerCheck")}
              <span className="ws-label"><strong>Seller</strong> Paying <strong>BUYER</strong> Broker Compensation*:</span>
            </div>
            <div className="ws-comm-pct">{f({ k: "buyerBrokerPct", auto: buyerCommPct, style: { width: "100%" } })}</div>
            <span className="ws-label">% / $</span>
            {f({ k: "buyerBrokerDollars", auto: buyerCommDollars, style: { width: "165px" } })}
            <span className="ws-comm-note ws-label">(*Per terms of purchase agreement)</span>
          </div>

          <div className="ws-comm-row">
            <div className="ws-comm-lead">
              {cb("brokerCoopCheck")}
              <span className="ws-label"><strong>Listing Broker</strong> paying <strong>BUYER Broker</strong> Comp**:</span>
            </div>
            <div className="ws-comm-pct">{f({ k: "brokerCoopPct", style: { width: "100%" } })}</div>
            <span className="ws-label">% / $</span>
            {f({ k: "brokerCoopDollars", style: { width: "165px" } })}
            <span className="ws-comm-note ws-label">(**Per cooperating broker agreement)</span>
          </div>

          <div className="ws-comm-row">
            <div className="ws-comm-lead">
              {cb("buyerPayingCheck")}
              <span className="ws-label"><strong>Buyer</strong> Paying <strong>BUYER Broker</strong> Compensation:</span>
            </div>
            <div className="ws-comm-pct">{f({ k: "buyerPayingPct", style: { width: "100%" } })}</div>
            <span className="ws-label">% / $</span>
            {f({ k: "buyerPayingDollars", style: { width: "165px" } })}
            <span className="ws-comm-note" />
          </div>
        </div>

        {/* LISTING SIDE | SELLING SIDE Referral */}
        <div className="ws-two-col">
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-label"><strong>LISTING SIDE</strong> Referral: %</span>
              {f({ k: "listingRefPct", auto: listingOutsideRef?.refPct, style: { width: "70px" } })}
              <span className="ws-label ml-1">$</span>
              {f({ k: "listingRefDollars", auto: listingOutsideRef?.refDollars, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Paid to:&nbsp;&nbsp;(Assoc/Co./Address)</span>
              {f({ k: "listingRefTo", auto: listingOutsideRef?.refTo ?? listingReferral.line1, className: "flex-1" })}
            </div>
            <div className="ws-line">
              {f({ k: "listingRefTo2", auto: listingReferral.line2, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">One Time Results Foundation Donation: $</span>
              {f({ k: "listingFoundation", className: "flex-1" })}
            </div>
          </div>
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-label"><strong>SELLING SIDE</strong> Referral: %</span>
              {f({ k: "sellingRefPct", auto: sellingOutsideRef?.refPct, style: { width: "70px" } })}
              <span className="ws-label ml-1">$</span>
              {f({ k: "sellingRefDollars", auto: sellingOutsideRef?.refDollars, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">Paid to:&nbsp;&nbsp;(Assoc/Co./Address)</span>
              {f({ k: "sellingRefTo", auto: sellingOutsideRef?.refTo ?? sellingReferral.line1, className: "flex-1" })}
            </div>
            <div className="ws-line">
              {f({ k: "sellingRefTo2", auto: sellingReferral.line2, className: "flex-1" })}
            </div>
            <div className="ws-line">
              <span className="ws-label">One Time Results Foundation Donation: $</span>
              {f({ k: "sellingFoundation", className: "flex-1" })}
            </div>
          </div>
        </div>

        {/* BROKER COMMISSION OF $650.00 | PAID FOR BY ... (same row) */}
        <div className="ws-two-col">
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b">BROKER COMMISSION OF $650.00</span>
            </div>
          </div>
          <div className="ws-col">
            <div className="ws-line">
              <span className="ws-b ws-label">PAID FOR BY SELLER/BUYER/ASSOCIATE:</span>
              {f({ k: "brokerCommPaidBy", auto: brokerCommPaidByAuto, className: "flex-1" })}
            </div>
          </div>
        </div>

        {/* COMMISSION NOTES — full width */}
        <div className="ws-line">
          <span className="ws-b ws-label">COMMISSION NOTES:</span>
          {f({ k: "commissionNotes", auto: commissionNotesAuto, className: "flex-1" })}
        </div>

        {/* Survey row — keep above the Lone Wolf logo in print stacking order */}
        <div className="ws-line ws-survey">
          <span className="ws-b">Did you enjoy working with this agent?</span>
          <span className="ws-label ml-1">Yes</span>{cbox("enjoyYes")}
          <span className="ws-label">No</span>{cbox("enjoyNo")}
          <span className="ws-b ml-2">Would they be a good fit for RE/MAX Results?</span>
          <span className="ws-label ml-1">Yes</span>{cbox("fitYes")}
          <span className="ws-label">No</span>{cbox("fitNo")}
        </div>

        {/* CWS 650 sits just below the survey row */}
        <div className="ws-cwsline">CWS 650 (03/2025)</div>
       </div>

        {/* Lone Wolf logo pinned to the very bottom-right corner of the page */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lone-wolf-logo.png" alt="Lone Wolf" className="ws-lonewolf" />
      </div>

      {/* ── Global stylesheet ── */}
      <style>{`
        @font-face {
          font-family: "Calibri";
          src: url("/fonts/calibri-regular.ttf") format("truetype");
          font-weight: 400;
          font-style: normal;
          font-display: block;
        }
        @font-face {
          font-family: "Calibri";
          src: url("/fonts/calibri-bold.ttf") format("truetype");
          font-weight: 700;
          font-style: normal;
          font-display: block;
        }
        .worksheet {
          position: relative;
          font-family: "Calibri";
          font-size: 10pt;
          color: #000;
          line-height: 1.13;
          background: #fff;
          min-height: 11in;
          box-sizing: border-box;
        }
        .ws-content {
          padding: 0.24in 0.26in 0;
          position: relative;
          z-index: 1;
        }
        .ws-header {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
          margin-bottom: 9px;
        }
        .ws-logo {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 48px;
          width: auto;
        }
        .ws-title {
          font-size: 15pt;
          font-weight: 700;
          text-align: center;
          line-height: 1.05;
        }
        .ws-subtitle {
          font-size: 8pt;
          text-align: center;
          margin-top: 0px;
        }
        .ws-line {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 3px;
          padding: 0.5px 0;
        }
        .ws-seg {
          display: flex;
          align-items: baseline;
          gap: 3px;
        }
        .ws-b { font-weight: 700; }
        .ws-note { font-size: 7.5pt; }
        .ws-label { white-space: nowrap; }
        /* Section divider: room before the line, tight gap after it. */
        .ws-divider {
          border-top: 1.5pt solid #000;
          margin: 8px 0 14px;
        }
        .ws-subhead {
          font-weight: 700;
          padding: 1px 0 0;
        }
        .ws-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 28px;
        }
        .ws-prop-row {
          display: grid;
          grid-template-columns: 2.45in 2.95in 1fr;
          column-gap: 8px;
          align-items: baseline;
          padding: 0.5px 0;
        }
        .ws-prop-col {
          display: flex;
          align-items: baseline;
          gap: 3px;
          min-width: 0;
        }
        .ws-col { min-width: 0; }
        .ws-commissions-head { padding-top: 3px; }
        .ws-comm-block { display: flex; flex-direction: column; }
        .ws-comm-row {
          display: flex;
          flex-wrap: nowrap;
          align-items: baseline;
          gap: 3px;
          padding: 0.5px 0;
        }
        .ws-comm-lead {
          display: flex;
          align-items: baseline;
          flex-shrink: 0;
        }
        .ws-comm-pct {
          flex: 1 1 0;
          min-width: 46px;
          display: flex;
          align-items: baseline;
        }
        .ws-comm-note {
          flex: 0 0 2.35in;
        }
        /* Filled-in values render in Courier-Bold (9pt) like the official form. */
        .ws-field {
          border: 0;
          border-bottom: 1.2px solid #000;
          background: transparent;
          font-family: "Courier New", Courier, monospace;
          font-weight: 700;
          font-size: 9pt;
          color: #000;
          padding: 0 2px;
          outline: none;
          min-width: 24px;
          line-height: 1.2;
        }
        .ws-field.flex-1 { flex: 1 1 0%; }
        .ws-field:focus {
          background: #eff6ff;
          border-bottom-color: #2563eb;
        }
        .ws-survey {
          position: relative;
          z-index: 2;
          flex-wrap: nowrap;
        }
        .ws-checkbox {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border: 1.5px solid #000;
          background: #fff;
          position: relative;
          z-index: 2;
          margin: 0 4px;
          flex-shrink: 0;
          vertical-align: middle;
          top: 1px;
          cursor: pointer;
        }
        .ws-checkbox:checked::after {
          content: "";
          position: absolute;
          left: 3px;
          top: 0px;
          width: 4px;
          height: 8px;
          border: solid #000;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .ws-cwsline {
          font-size: 8pt;
          color: #000;
          margin-top: 6px;
          padding: 0 0.26in;
        }
        .ws-lonewolf {
          position: absolute;
          right: 0.14in;
          bottom: 0.1in;
          width: 1.2in;
          height: auto;
          z-index: 0;
        }
        @media print {
          @page { size: letter portrait; margin: 0; }
          html, body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .worksheet {
            width: 100% !important;
            min-height: 11in;
          }
          .ws-field {
            border-bottom: 1.2px solid #000 !important;
            background: transparent !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .ws-field:focus { background: transparent; }
          .ws-divider {
            border-top: 1.5pt solid #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .ws-checkbox {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            position: relative;
            z-index: 2;
            border: 1.5px solid #000 !important;
            background: #fff !important;
          }
          .ws-lonewolf {
            z-index: 0;
          }
          .ws-content {
            z-index: 1;
          }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
