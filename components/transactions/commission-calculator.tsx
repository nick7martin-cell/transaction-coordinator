"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { AGENTS, teamSteadyEmailFor } from "@/lib/agents";
import {
  applyReferral,
  buildAgentNotes,
  buildOutsideReferralWorksheetFields,
  buildWorksheetReferralLines,
  calcSide,
  calcSideOptionsForAgent,
  DEREK_JOPP_AGENT_ID,
  formatMoney,
  OUTSIDE_REFERRAL_OPTIONS,
  SHOWING_REFERRAL_OPTIONS,
  TEAM_REFERRAL_OPTIONS,
  type CommissionResult,
  type ReferralConfig,
  type ReferralType,
  type SideBreakdown,
} from "@/lib/commission";
import type { Transaction, TransactionMeta, TransactionParty } from "@/lib/types";
import { coerceExtractedData } from "@/lib/types";
import {
  hasSavedCommission,
  resolveCommissionAutofill,
} from "@/lib/commission-autofill";
import { cn } from "@/lib/utils";

type Side = "buyer" | "seller" | "dual";

function commissionInputHint(
  side: Side,
  buyerAgentId: string,
  buyerPct: string,
  sellerAgentId: string,
  sellerPct: string
): string | null {
  const needsBuyer = side === "buyer" || side === "dual";
  const needsSeller = side === "seller" || side === "dual";

  if (needsBuyer) {
    if (!buyerAgentId) return "Select the Team Steady agent for the buyer side.";
    if (!buyerPct.trim() || isNaN(parseFloat(buyerPct))) {
      return "Enter the buyer broker commission %.";
    }
  }
  if (needsSeller) {
    if (!sellerAgentId) return "Select the Team Steady agent for the listing side.";
    if (!sellerPct.trim() || isNaN(parseFloat(sellerPct))) {
      return "Enter the listing broker commission %.";
    }
  }
  return null;
}

async function readMetaPatchError(res: Response): Promise<string> {
  try {
    const payload = await res.json();
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    /* ignore */
  }
  return `Save failed (${res.status})`;
}

function applySideReferral(
  b: SideBreakdown | null | undefined,
  referral: ReferralConfig | null
): SideBreakdown | undefined {
  if (!b) return undefined;
  if (!referral) return b;
  return applyReferral(b, referral);
}

function applyReferralFields(
  ws: Record<string, string>,
  b: SideBreakdown,
  side: "buyer" | "seller"
) {
  const prefix = side === "seller" ? "listing" : "selling";

  if (b.referralType === "outside") {
    const outside = buildOutsideReferralWorksheetFields(b);
    if (outside) {
      ws[`${prefix}RefPct`] = outside.refPct;
      ws[`${prefix}RefDollars`] = outside.refDollars;
      ws[`${prefix}RefTo`] = outside.refTo;
      ws[`${prefix}RefTo2`] = "";
    }
    return;
  }

  const ref = buildWorksheetReferralLines(b);
  ws[`${prefix}RefTo`] = ref.line1;
  ws[`${prefix}RefTo2`] = ref.line2;
}

/**
 * Map a calculated commission result onto the closing-worksheet override keys.
 * "Selling side" = the buyer's broker (Team Steady / RE/MAX Results); the
 * SELLING COMPANY Associate is therefore the Team Steady agent (#4), never the TC.
 */
function worksheetFromCommission(c: CommissionResult): Record<string, string> {
  const ws: Record<string, string> = {};

  if (c.buyer) {
    ws.buyerBrokerPct = String(c.buyer.commissionPct);
    ws.buyerBrokerDollars = formatMoney(c.buyer.totalCommission);
    applyReferralFields(ws, c.buyer, "buyer");
  }
  if (c.seller) {
    ws.listingBrokerPct = String(c.seller.commissionPct);
    ws.listingBrokerDollars = formatMoney(c.seller.totalCommission);
    applyReferralFields(ws, c.seller, "seller");
  }

  // Route the Team Steady agent to the correct company column.
  // "Selling Company" = buyer's agent; "Listing Company" = listing agent.
  // When Team Steady is the buyer's agent, write to sellingAssociate/Email.
  // When Team Steady is only on the listing side, write to listingAssociate/Email
  // and leave sellingAssociate/Email clear so the parties-roster auto values show.
  if (c.buyer?.agentName) {
    ws.sellingAssociate = c.buyer.agentName;
    const email = teamSteadyEmailFor(c.buyer.agentName);
    if (email) ws.sellingEmail = email;
  } else if (c.seller?.agentName) {
    ws.listingAssociate = c.seller.agentName;
    const email = teamSteadyEmailFor(c.seller.agentName);
    if (email) ws.listingEmail = email;
  }

  const notes = [
    c.buyer ? buildAgentNotes(c.buyer) : null,
    c.seller ? buildAgentNotes(c.seller) : null,
  ].filter(Boolean).join(" | ");
  if (notes) ws.commissionNotes = notes;

  return ws;
}

function buildCommissionResult(
  side: Side,
  salePrice: number,
  buyerAgentId: string,
  buyerPct: string,
  sellerAgentId: string,
  sellerPct: string,
  referral: ReferralConfig | null,
  derekSplitOverride: boolean
): CommissionResult {
  const buyerPctNum = parseFloat(buyerPct);
  const sellerPctNum = parseFloat(sellerPct);
  const commission: CommissionResult = {
    side,
    referral,
    derekSplitOverride: derekSplitOverride || undefined,
  };

  if ((side === "buyer" || side === "dual") && buyerAgentId && !isNaN(buyerPctNum)) {
    commission.buyer = applySideReferral(
      calcSide(
        salePrice,
        buyerPctNum,
        buyerAgentId,
        calcSideOptionsForAgent(buyerAgentId, derekSplitOverride)
      ),
      referral
    );
  }
  if ((side === "seller" || side === "dual") && sellerAgentId && !isNaN(sellerPctNum)) {
    commission.seller = applySideReferral(
      calcSide(
        salePrice,
        sellerPctNum,
        sellerAgentId,
        calcSideOptionsForAgent(sellerAgentId, derekSplitOverride)
      ),
      referral
    );
  }

  return commission;
}

const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: "buyer",  label: "Buyer side only" },
  { value: "seller", label: "Seller side only" },
  { value: "dual",   label: "Both sides (dual agency)" },
];

function BreakdownTable({ b, label }: { b: SideBreakdown; label: string }) {
  const isNickAgent = b.agentId === "nick-martin";
  const agentLabel = isNickAgent
    ? `${b.agentName} (agent · ${b.splitTier} incl. $50 TC fee)`
    : `${b.agentName} (agent · ${b.splitTier})`;

  const skipTeamSplit = b.referralType === "outside" || b.referralType === "team";
  const isShowing = b.referralType === "showing";

  const rows: [string, number][] = [
    [agentLabel, b.agentAmount],
    ...(b.referralType === "outside" && b.referralPayeeName
      ? [[`${b.referralPayeeName} (outside referral — ${b.referralPct}%)`, b.referralPayeeAmount ?? 0] as [string, number]]
      : []),
    ...(b.referralType === "team" && b.teamReferralAgentName
      ? [[`${b.teamReferralAgentName} (team referral — ${b.referralPct}%)`, b.teamReferralAmount ?? 0] as [string, number]]
      : []),
    ...(isShowing && b.mentorName
      ? [[`${b.mentorName} (showing referral — ${b.referralPct}%)`, b.mentorAmount] as [string, number]]
      : []),
    ...(!isShowing && b.mentorName ? [[`${b.mentorName} (mentor — 40% of team)`, b.mentorAmount] as [string, number]] : []),
    ...(!isNickAgent ? [["Nick — TC fee", b.nickAmount] as [string, number]] : []),
    ...(skipTeamSplit ? [] : [
      ["Sam Steadman", b.samAmount],
      ["Taylor", b.taylorAmount],
      ["Lars", b.larsAmount],
    ] as [string, number][]),
  ];

  const computedTotal = rows.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="bg-brand px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-white uppercase tracking-wider">{label}</span>
        <span className="text-xs font-semibold text-white">
          {b.commissionPct}% · ${formatMoney(b.totalCommission)}
        </span>
      </div>

      {b.capApplied && (
        <div className="bg-warn/45 border-b border-warn px-4 py-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-warn-ink">
            $10,000 team cap applied
          </span>
          <span className="text-xs text-warn-ink/80">
            — normal team share would have been ${formatMoney(b.normalTeamAmount)};
            agent keeps the difference (${formatMoney(b.agentAmount - (b.totalCommission * parseInt(b.splitTier) / 100))})
          </span>
        </div>
      )}

      <div className="divide-y divide-line/70">
        {rows.map(([name, amount]) => (
          <div key={name} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-ink-soft">{name}</span>
            <span className={cn(
              "text-sm font-semibold tabular-nums",
              name.includes("TC fee") ? "text-ink-mute" : "text-ink"
            )}>
              ${formatMoney(amount)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-2.5 bg-canvas">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="text-sm font-bold text-ink tabular-nums">
            ${formatMoney(computedTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

const REFERRAL_OPTIONS: { type: ReferralType; label: string }[] = [
  { type: "outside", label: "Outside Referral" },
  { type: "team", label: "Team Referral" },
  { type: "showing", label: "Showing Referral" },
];

function ReferralScenarioSection({
  referralType,
  onReferralTypeChange,
  referralPct,
  onReferralPctChange,
  recipientKey,
  onRecipientKeyChange,
  recipientOther,
  onRecipientOtherChange,
}: {
  referralType: ReferralType | null;
  onReferralTypeChange: (t: ReferralType | null) => void;
  referralPct: string;
  onReferralPctChange: (v: string) => void;
  recipientKey: string;
  onRecipientKeyChange: (v: string) => void;
  recipientOther: string;
  onRecipientOtherChange: (v: string) => void;
}) {
  const dropdownOptions =
    referralType === "outside"
      ? OUTSIDE_REFERRAL_OPTIONS
      : referralType === "team"
        ? TEAM_REFERRAL_OPTIONS
        : referralType === "showing"
          ? SHOWING_REFERRAL_OPTIONS
          : [];

  return (
    <div className="rounded-xl border border-line bg-canvas p-4 space-y-4">
      <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide">
        Referral Scenario <span className="font-normal normal-case text-ink-mute">(optional)</span>
      </p>
      <div className="space-y-3">
        {REFERRAL_OPTIONS.map(({ type, label }) => {
          const checked = referralType === type;
          return (
            <div
              key={type}
              className={cn(
                "rounded-xl border p-4 space-y-3 transition-colors",
                checked ? "border-brand bg-surface" : "border-line bg-surface/60"
              )}
            >
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) {
                      onReferralTypeChange(null);
                      onReferralPctChange("");
                      onRecipientKeyChange("");
                      onRecipientOtherChange("");
                    } else {
                      onReferralTypeChange(type);
                      onReferralPctChange("");
                      onRecipientKeyChange("");
                      onRecipientOtherChange("");
                    }
                  }}
                  className="h-4 w-4 rounded border-line text-brand focus:ring-brand/15"
                />
                <span className="text-sm font-medium text-ink">{label}</span>
              </label>

              {checked && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
                  <div>
                    <label className="text-xs font-medium text-ink-mute block mb-1.5">Percentage</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={referralPct}
                      onChange={(e) => onReferralPctChange(e.target.value)}
                      placeholder={type === "showing" ? "e.g. 10–15" : "e.g. 25"}
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink-mute block mb-1.5">Recipient</label>
                    <select
                      value={recipientKey}
                      onChange={(e) => onRecipientKeyChange(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15"
                    >
                      <option value="">— Select —</option>
                      {dropdownOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                      ))}
                    </select>
                    {recipientKey === "other" && (
                      <input
                        type="text"
                        value={recipientOther}
                        onChange={(e) => onRecipientOtherChange(e.target.value)}
                        placeholder="Type agent name"
                        className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CommissionCalculator({
  transaction,
  parties = [],
}: {
  transaction: Transaction;
  parties?: TransactionParty[];
}) {
  const data = coerceExtractedData(transaction.extracted_data);
  const salePrice = data.purchasePrice ?? 0;
  const extractedBuyerPct = data.buyerBrokerCommissionPct;

  const [meta, setMeta] = useState<TransactionMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form state
  const [side, setSide] = useState<Side>("buyer");
  const [buyerAgentId, setBuyerAgentId] = useState<string>("");
  const [buyerPct, setBuyerPct] = useState<string>(
    extractedBuyerPct != null ? String(extractedBuyerPct) : ""
  );
  const [sellerAgentId, setSellerAgentId] = useState<string>("");
  const [sellerPct, setSellerPct] = useState<string>("");

  const [referralType, setReferralType] = useState<ReferralType | null>(null);
  const [referralPct, setReferralPct] = useState<string>("");
  const [referralRecipientKey, setReferralRecipientKey] = useState<string>("");
  const [referralRecipientOther, setReferralRecipientOther] = useState<string>("");
  const [derekSplitOverride, setDerekSplitOverride] = useState(false);

  const [result, setResult] = useState<CommissionResult | null>(null);
  const autofillDone = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/meta`);
      const payload = await res.json();
      if (!res.ok) {
        setSaveError(readMetaPatchError(res));
        return;
      }
      const m: TransactionMeta | null = payload.meta ?? null;
      setMeta(m);

      if (m && hasSavedCommission(m.commission)) {
        const c = m.commission!;
        setSide(c.side);
        if (c.buyer) {
          setBuyerAgentId(c.buyer.agentId);
          setBuyerPct(String(c.buyer.commissionPct));
        }
        if (c.seller) {
          setSellerAgentId(c.seller.agentId);
          setSellerPct(String(c.seller.commissionPct));
        }
        if (c.referral) {
          setReferralType(c.referral.type);
          setReferralPct(String(c.referral.pct));
          setReferralRecipientKey(c.referral.recipientKey);
          setReferralRecipientOther(c.referral.recipientOther ?? "");
        }
        setDerekSplitOverride(!!c.derekSplitOverride);
        setResult(c);
      }
    } catch {
      setSaveError("Could not load saved commission data.");
    } finally {
      setLoading(false);
    }
  }, [transaction.id]);

  useEffect(() => { load(); }, [load]);

  /** Auto-populate from contacts + PA when no saved commission exists yet. */
  useEffect(() => {
    if (loading || autofillDone.current || hasSavedCommission(meta?.commission)) return;

    const roster = parties.length > 0 ? parties : (meta?.parties ?? []);
    const hasAgentInRoster = roster.some((p) =>
      p.role === "buyer_agent" || p.role === "listing_agent" || p.role === "agent_unconfirmed"
    );
    const hasExtractedAgents = !!(data.buyerAgentName || data.listingAgentName);

    // Wait until contacts are seeded or PA agent names are available.
    if (!hasAgentInRoster && !hasExtractedAgents) return;

    const autofill = resolveCommissionAutofill(roster, data);
    if (!autofill) {
      autofillDone.current = hasAgentInRoster || hasExtractedAgents;
      return;
    }
    autofillDone.current = true;

    setSide(autofill.side);

    if (autofill.side === "dual") {
      // Pre-fill both agent dropdowns with the Team Steady agent(s).
      // Buyer pct comes from the PA; listing pct must be entered manually.
      if (autofill.agentId) {
        setBuyerAgentId(autofill.agentId);
        setSellerAgentId(autofill.sellerAgentId ?? autofill.agentId);
        if (autofill.commissionPct != null) {
          setBuyerPct(String(autofill.commissionPct));
        }
      }
      return;
    }

    if (!autofill.agentId || !autofill.agentSide) return;

    if (autofill.agentSide === "buyer") {
      setBuyerAgentId(autofill.agentId);
      if (autofill.commissionPct != null) {
        setBuyerPct(String(autofill.commissionPct));
      }
    } else {
      setSellerAgentId(autofill.agentId);
    }

    if (
      !autofill.shouldCalculate ||
      !salePrice ||
      autofill.agentSide !== "buyer" ||
      autofill.commissionPct == null
    ) {
      return;
    }

    const commission = buildCommissionResult(
      autofill.side,
      salePrice,
      autofill.agentId,
      String(autofill.commissionPct),
      "",
      "",
      null,
      false
    );

    if (!commission.buyer && !commission.seller) return;

    setResult(commission);
    setSaving(true);
    setSaveError(null);
    fetch(`/api/transactions/${transaction.id}/meta`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commission,
        worksheet: worksheetFromCommission(commission),
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setSaveError(await readMetaPatchError(res));
          return;
        }
        const payload = await res.json();
        if (payload.meta) setMeta(payload.meta);
      })
      .catch(() => setSaveError("Could not save commission."))
      .finally(() => setSaving(false));
  }, [loading, meta, parties, data, salePrice, transaction.id]);

  function buildReferralConfig(): ReferralConfig | null {
    if (!referralType || !referralRecipientKey) return null;
    const pct = parseFloat(referralPct);
    if (isNaN(pct) || pct <= 0) return null;
    if (referralRecipientKey === "other" && !referralRecipientOther.trim()) return null;
    return {
      type: referralType,
      pct,
      recipientKey: referralRecipientKey,
      recipientOther: referralRecipientOther.trim() || undefined,
    };
  }

  function recalculateWithOverride(nextOverride: boolean) {
    if (!salePrice) return;
    const referral = buildReferralConfig();
    const commission = buildCommissionResult(
      side,
      salePrice,
      buyerAgentId,
      buyerPct,
      sellerAgentId,
      sellerPct,
      referral,
      nextOverride
    );
    setResult(commission);
    save(commission);
  }

  function calculate() {
    runCalculate();
  }

  async function save(commission: CommissionResult) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commission,
          worksheet: worksheetFromCommission(commission),
        }),
      });
      if (!res.ok) {
        setSaveError(await readMetaPatchError(res));
        return;
      }
      const payload = await res.json();
      if (payload.meta) setMeta(payload.meta);
    } catch {
      setSaveError("Could not save commission.");
    } finally {
      setSaving(false);
    }
  }

  function runCalculate() {
    if (!salePrice) return;
    const hint = commissionInputHint(
      side,
      buyerAgentId,
      buyerPct,
      sellerAgentId,
      sellerPct
    );
    if (hint) {
      setSaveError(hint);
      return;
    }

    const referral = buildReferralConfig();
    const commission = buildCommissionResult(
      side,
      salePrice,
      buyerAgentId,
      buyerPct,
      sellerAgentId,
      sellerPct,
      referral,
      derekSplitOverride
    );

    if (!commission.buyer && !commission.seller) {
      setSaveError("Could not calculate commission — check agent and % fields.");
      return;
    }

    setSaveError(null);
    setResult(commission);
    void save(commission);
  }

  if (loading) return null;

  const needsBuyerForm = side === "buyer" || side === "dual";
  const needsSellerForm = side === "seller" || side === "dual";
  const derekSelected =
    buyerAgentId === DEREK_JOPP_AGENT_ID || sellerAgentId === DEREK_JOPP_AGENT_ID;

  function handleAgentChange(sideKind: "buyer" | "seller", agentId: string) {
    const nextBuyer = sideKind === "buyer" ? agentId : buyerAgentId;
    const nextSeller = sideKind === "seller" ? agentId : sellerAgentId;

    if (sideKind === "buyer") setBuyerAgentId(agentId);
    else setSellerAgentId(agentId);

    const clearingDerek =
      derekSplitOverride &&
      nextBuyer !== DEREK_JOPP_AGENT_ID &&
      nextSeller !== DEREK_JOPP_AGENT_ID;

    if (clearingDerek) {
      setDerekSplitOverride(false);
      if (salePrice && (nextBuyer || nextSeller)) {
        const referral = buildReferralConfig();
        const commission = buildCommissionResult(
          side,
          salePrice,
          nextBuyer,
          buyerPct,
          nextSeller,
          sellerPct,
          referral,
          false
        );
        setResult(commission);
        save(commission);
      }
    }
  }

  return (
    <section className="rounded-[20px] border border-line bg-surface shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-ink-mute" />
          <h2 className="text-[15px] font-semibold text-ink">Commission Calculator</h2>
        </div>
        {saving && (
          <span className="flex items-center gap-1 text-xs text-ink-mute">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </span>
        )}
      </div>

      <div className="p-6 space-y-6">
        {!salePrice && (
          <div className="rounded-xl border border-warn bg-warn/45 px-4 py-3 text-sm text-warn-ink">
            Purchase price not extracted — commission amounts cannot be calculated yet.
          </div>
        )}

        {saveError && (
          <div className="rounded-xl border border-danger bg-danger/15 px-4 py-3 text-sm text-danger-ink">
            {saveError}
          </div>
        )}

        {/* Which side */}
        <div>
          <p className="text-xs font-semibold text-ink-mute uppercase tracking-wide mb-3">
            Which side does Team Steady represent?
          </p>
          <div className="flex flex-wrap gap-2">
            {SIDE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSide(opt.value)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium border transition-colors",
                  side === opt.value
                    ? "bg-brand text-white border-brand"
                    : "bg-surface text-ink-soft border-line hover:border-ink-mute/40"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Buyer side inputs */}
        {needsBuyerForm && (
          <div className="rounded-xl border border-line bg-canvas p-4 space-y-4">
            <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide">Buyer Side</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-ink-mute block mb-1.5">Team Steady Agent</label>
                <select
                  value={buyerAgentId}
                  onChange={(e) => handleAgentChange("buyer", e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15"
                >
                  <option value="">— Select agent —</option>
                  {AGENTS.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.splitTier})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-mute block mb-1.5">
                  Buyer Broker Commission %
                  {extractedBuyerPct != null && (
                    <span className="ml-1 text-good-ink">(extracted from PA)</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={buyerPct}
                  onChange={(e) => setBuyerPct(e.target.value)}
                  placeholder="e.g. 2.70"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15"
                />
                {salePrice > 0 && buyerPct && !isNaN(parseFloat(buyerPct)) && (
                  <p className="text-xs text-ink-mute mt-1">
                    = ${formatMoney(salePrice * parseFloat(buyerPct) / 100)} total
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Seller side inputs */}
        {needsSellerForm && (
          <div className="rounded-xl border border-line bg-canvas p-4 space-y-4">
            <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide">Seller / Listing Side</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-ink-mute block mb-1.5">Team Steady Agent</label>
                <select
                  value={sellerAgentId}
                  onChange={(e) => handleAgentChange("seller", e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15"
                >
                  <option value="">— Select agent —</option>
                  {AGENTS.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.splitTier})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-mute block mb-1.5">
                  Listing Commission % <span className="text-ink-mute">(enter manually)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={sellerPct}
                  onChange={(e) => setSellerPct(e.target.value)}
                  placeholder="e.g. 3.00"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/15"
                />
                {salePrice > 0 && sellerPct && !isNaN(parseFloat(sellerPct)) && (
                  <p className="text-xs text-ink-mute mt-1">
                    = ${formatMoney(salePrice * parseFloat(sellerPct) / 100)} total
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {derekSelected && (
          <label className="flex items-center gap-2.5 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={derekSplitOverride}
              onChange={(e) => {
                const checked = e.target.checked;
                setDerekSplitOverride(checked);
                if (salePrice && (buyerAgentId || sellerAgentId)) {
                  recalculateWithOverride(checked);
                }
              }}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand/15"
            />
            <span className="text-sm text-ink-soft">
              98/2 split (temporary override)
            </span>
          </label>
        )}

        <ReferralScenarioSection
          referralType={referralType}
          onReferralTypeChange={setReferralType}
          referralPct={referralPct}
          onReferralPctChange={setReferralPct}
          recipientKey={referralRecipientKey}
          onRecipientKeyChange={setReferralRecipientKey}
          recipientOther={referralRecipientOther}
          onRecipientOtherChange={setReferralRecipientOther}
        />

        <button
          type="button"
          onClick={calculate}
          disabled={saving || !salePrice}
          className="inline-flex items-center rounded-xl bg-brand px-6 h-11 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50 disabled:pointer-events-none"
        >
          Calculate &amp; Save
        </button>

        {/* Results */}
        {result && (result.buyer || result.seller) && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs font-semibold text-ink-mute uppercase tracking-wide">Breakdown</span>
              <div className="h-px flex-1 bg-line" />
            </div>
            {result.buyer && (
              <BreakdownTable b={result.buyer} label="Buyer Side Commission" />
            )}
            {result.seller && (
              <BreakdownTable b={result.seller} label="Seller / Listing Side Commission" />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
