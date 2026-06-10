import { findAgent, getMentor, NICK_TC_FEE, type Agent } from "@/lib/agents";

export type CommissionSide = "buyer" | "seller";

export type ReferralType = "outside" | "team" | "showing";

export interface ReferralConfig {
  type: ReferralType;
  pct: number;
  /** Dropdown value — agent id or preset key like "ryan-boyer" */
  recipientKey: string;
  /** When recipientKey === "other" */
  recipientOther?: string;
}

export interface SideBreakdown {
  agentId: string;
  agentName: string;
  splitTier: string;
  commissionPct: number;
  totalCommission: number;
  agentAmount: number;
  mentorName: string | null;
  mentorAmount: number;
  nickAmount: number;
  samAmount: number;
  taylorAmount: number;
  larsAmount: number;
  /** True when the $10,000 team cap was applied */
  capApplied: boolean;
  /** The raw (uncapped) team share — shown in UI for context */
  normalTeamAmount: number;
  /** Set when a referral scenario modified this breakdown */
  referralType?: ReferralType | null;
  referralPct?: number;
  /** Outside referral payee */
  referralPayeeName?: string | null;
  referralPayeeAmount?: number;
  /** Team referral — second team agent's net amount */
  teamReferralAgentName?: string | null;
  teamReferralAmount?: number;
}

export interface CommissionResult {
  side: "buyer" | "seller" | "dual";
  buyer?: SideBreakdown;
  seller?: SideBreakdown;
  referral?: ReferralConfig | null;
  /** Temporary 98/2 split for Derek Jopp on this transaction only. */
  derekSplitOverride?: boolean;
}

export type CalcSideOptions = {
  agentSplitPct?: number;
  splitTierLabel?: string;
};

export const DEREK_JOPP_AGENT_ID = "derek-jopp";

export function calcSideOptionsForAgent(
  agentId: string,
  derekSplitOverride: boolean
): CalcSideOptions | undefined {
  if (agentId === DEREK_JOPP_AGENT_ID && derekSplitOverride) {
    return { agentSplitPct: 98, splitTierLabel: "98/2" };
  }
  return undefined;
}

/** Team Steady agent name from a saved commission calculation, if any. */
export function teamSteadyAgentNameFromCommission(
  commission: CommissionResult | null | undefined
): string | null {
  if (!commission) return null;
  return commission.buyer?.agentName ?? commission.seller?.agentName ?? null;
}

// ── Referral dropdown presets ─────────────────────────────────────────────────

export const OUTSIDE_REFERRAL_OPTIONS = [
  { key: "ryan-boyer", label: "Ryan Boyer, RE/MAX Results" },
  { key: "other", label: "Other (type name)" },
] as const;

export const TEAM_REFERRAL_OPTIONS = [
  { key: "brett-lizotte", label: "Brett Lizotte" },
  { key: "lucas-hansen", label: "Lucas Hansen" },
  { key: "jadde-rowe", label: "Jadde Rowe" },
  { key: "landon-mathis", label: "Landon Mathis" },
  { key: "jeremy-schulenburg", label: "Jeremy Schulenburg" },
  { key: "nick-martin", label: "Nick Martin" },
  { key: "other", label: "Other (type name)" },
] as const;

export const SHOWING_REFERRAL_OPTIONS = [
  { key: "nick-martin", label: "Nick Martin" },
  { key: "landon-mathis", label: "Landon Mathis" },
  { key: "jeremy-schulenburg", label: "Jeremy Schulenburg" },
  { key: "hubert-ngabirano", label: "Hubert Ngabirano" },
  { key: "asa-tessness", label: "Asa Tessness" },
  { key: "other", label: "Other (type name)" },
] as const;

const REFERRAL_NAME_LOOKUP: Record<string, string> = {
  "ryan-boyer": "Ryan Boyer, RE/MAX Results",
  "brett-lizotte": "Brett Lizotte",
  "lucas-hansen": "Lucas Hansen",
  "jadde-rowe": "Jadde Rowe",
  "landon-mathis": "Landon Mathis",
  "jeremy-schulenburg": "Jeremy Schulenburg",
  "nick-martin": "Nick Martin",
  "hubert-ngabirano": "Hubert Ngabirano",
  "asa-tessness": "Asa Tessness",
};

export function resolveReferralRecipientName(
  recipientKey: string,
  recipientOther?: string
): string {
  if (recipientKey === "other") return recipientOther?.trim() || "Other";
  return REFERRAL_NAME_LOOKUP[recipientKey] ?? recipientKey;
}

/**
 * Apply an optional referral scenario on top of a standard calcSide result.
 * When referral is null/undefined, returns the breakdown unchanged.
 */
export function applyReferral(
  b: SideBreakdown,
  referral: ReferralConfig
): SideBreakdown {
  const totalCents = Math.round(b.totalCommission * 100);
  const pct = referral.pct;
  const name = resolveReferralRecipientName(referral.recipientKey, referral.recipientOther);
  const nickCents = NICK_TC_FEE * 100;

  switch (referral.type) {
    case "outside": {
      const refCents = Math.round(totalCents * pct / 100);
      const agentCents = totalCents - refCents - nickCents;
      return {
        ...b,
        agentAmount: agentCents / 100,
        nickAmount: nickCents / 100,
        mentorName: null,
        mentorAmount: 0,
        samAmount: 0,
        taylorAmount: 0,
        larsAmount: 0,
        referralType: "outside",
        referralPct: pct,
        referralPayeeName: name,
        referralPayeeAmount: refCents / 100,
        teamReferralAgentName: null,
        teamReferralAmount: 0,
      };
    }
    case "team": {
      const otherCents = Math.round(totalCents * pct / 100);
      const nickHalf = nickCents / 2;
      const otherNet = otherCents - nickHalf;
      const primaryNet = totalCents - otherCents - nickHalf;
      return {
        ...b,
        agentAmount: primaryNet / 100,
        nickAmount: nickCents / 100,
        mentorName: null,
        mentorAmount: 0,
        samAmount: 0,
        taylorAmount: 0,
        larsAmount: 0,
        referralType: "team",
        referralPct: pct,
        referralPayeeName: null,
        referralPayeeAmount: 0,
        teamReferralAgentName: name,
        teamReferralAmount: otherNet / 100,
      };
    }
    case "showing": {
      const showCents = Math.round(totalCents * pct / 100);
      return {
        ...b,
        agentAmount: b.agentAmount - showCents / 100,
        mentorName: name,
        mentorAmount: showCents / 100,
        referralType: "showing",
        referralPct: pct,
      };
    }
  }
}

/**
 * All arithmetic in integer cents to guarantee exactness.
 *
 * Standard agent rules:
 *   1. Team share = totalCommission × (teamPct / 100)
 *   2. Team share is CAPPED at $10,000.  Excess goes to the agent.
 *   3. From team share: Nick gets $50 flat TC fee off the top.
 *   4. From remainder:
 *        – With mentor: mentor 40%, Sam 20%, Taylor 20%, Lars 20% (remainder)
 *        – No mentor:   Sam 33.33%, Taylor 33.33%, Lars remainder
 *   5. Total guarantee: agentAmount + nickAmount + mentorAmount + samAmount + taylorAmount + larsAmount === totalCommission exactly.
 *
 * Nick Martin (id: "nick-martin") special rules — 80/20:
 *   1. Team share = 20% of totalCommission (same cap logic applies).
 *   2. $50 TC fee is deducted from the team's 20% and added directly to Nick's 80%.
 *   3. No separate TC-fee line (nickAmount = 0); fee is folded into agentAmount.
 *   4. No mentor.  Remaining team (20% − $50) splits evenly: Sam 33.33%, Taylor 33.33%, Lars remainder.
 */
export function calcSide(
  salePriceDollars: number,
  commissionPct: number,
  agentId: string,
  options?: CalcSideOptions
): SideBreakdown | null {
  const agent = findAgent(agentId);
  if (!agent) return null;

  const mentor = getMentor(agent);
  const [agentSplitPct] =
    options?.agentSplitPct != null
      ? [options.agentSplitPct]
      : splitNumerators(agent.splitTier);
  const splitTierLabel = options?.splitTierLabel ?? agent.splitTier;

  const saleCents = Math.round(salePriceDollars * 100);
  const totalCents = Math.round(saleCents * commissionPct / 100);

  // Normal (uncapped) team share
  const normalAgentCents = Math.round(totalCents * agentSplitPct / 100);
  const normalTeamCents = totalCents - normalAgentCents;

  // Apply $10,000 cap
  const TEAM_CAP = 1_000_000; // cents = $10,000
  const capApplied = normalTeamCents > TEAM_CAP;
  const teamCents = capApplied ? TEAM_CAP : normalTeamCents;
  // Agent absorbs any excess beyond the cap
  const agentCents = totalCents - teamCents;

  // ── Nick Martin as agent ──────────────────────────────────────────────────
  // $50 TC fee is taken from the team's share and folded into Nick's amount.
  // No separate nickAmount line; no mentor.
  if (agent.id === "nick-martin") {
    const feeCents = Math.min(NICK_TC_FEE * 100, teamCents);
    const nickAgentCents = agentCents + feeCents;
    const remainingCents = teamCents - feeCents;

    const samCents    = Math.round(remainingCents / 3);
    const taylorCents = Math.round(remainingCents / 3);
    const larsCents   = remainingCents - samCents - taylorCents;

    return assemble(agent, undefined, commissionPct, totalCents, nickAgentCents,
      0, 0, samCents, taylorCents, larsCents, capApplied, normalTeamCents, splitTierLabel);
  }

  // ── Standard agent TC-fee logic ───────────────────────────────────────────
  const nickCents = 5000; // $50 flat fee to Nick

  // Edge case: team share < $50 (unlikely on real transactions)
  if (teamCents <= nickCents) {
    return assemble(agent, mentor, commissionPct, totalCents, agentCents,
      teamCents, 0, 0, 0, 0, capApplied, normalTeamCents, splitTierLabel);
  }

  const remainingCents = teamCents - nickCents;

  let mentorCents: number;
  let samCents: number;
  let taylorCents: number;
  let larsCents: number;

  if (mentor) {
    mentorCents = Math.round(remainingCents * 40 / 100);
    samCents    = Math.round(remainingCents * 20 / 100);
    taylorCents = Math.round(remainingCents * 20 / 100);
    larsCents   = remainingCents - mentorCents - samCents - taylorCents;
  } else {
    mentorCents = 0;
    samCents    = Math.round(remainingCents / 3);
    taylorCents = Math.round(remainingCents / 3);
    larsCents   = remainingCents - samCents - taylorCents;
  }

  return assemble(agent, mentor, commissionPct, totalCents, agentCents,
    nickCents, mentorCents, samCents, taylorCents, larsCents, capApplied, normalTeamCents, splitTierLabel);
}

function assemble(
  agent: Agent,
  mentor: Agent | undefined,
  commissionPct: number,
  totalCents: number,
  agentCents: number,
  nickCents: number,
  mentorCents: number,
  samCents: number,
  taylorCents: number,
  larsCents: number,
  capApplied: boolean,
  normalTeamCents: number,
  splitTierLabel: string,
): SideBreakdown {
  return {
    agentId: agent.id,
    agentName: agent.name,
    splitTier: splitTierLabel,
    commissionPct,
    totalCommission: totalCents / 100,
    agentAmount: agentCents / 100,
    mentorName: mentor?.name ?? null,
    mentorAmount: mentorCents / 100,
    nickAmount: nickCents / 100,
    samAmount: samCents / 100,
    taylorAmount: taylorCents / 100,
    larsAmount: larsCents / 100,
    capApplied,
    normalTeamAmount: normalTeamCents / 100,
  };
}

function splitNumerators(tier: string): [number, number] {
  switch (tier) {
    case "80/20": return [80, 20];
    case "90/10": return [90, 10];
    case "75/25": return [75, 25];
    default:      return [50, 50];
  }
}

export function verifyTotal(b: SideBreakdown): boolean {
  const sum = b.agentAmount + b.nickAmount + b.mentorAmount + b.samAmount + b.taylorAmount + b.larsAmount;
  return Math.abs(sum - b.totalCommission) < 0.015;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Worksheet commission text builders ────────────────────────────────────────

/** Sam/Taylor/Lars per-person share line. */
export function buildReferralEachLine(b: SideBreakdown): string {
  return `$${formatMoney(b.samAmount)} each to Sam, Taylor and Lars`;
}

/**
 * Closing-worksheet referral lines:
 *   – Mentor on "Paid to" (line 1); STL split on the line above Foundation (line 2)
 *   – STL-only (no mentor): line 1 blank; STL split on line 2
 *   – Team referral to named agent: payout on line 1 only
 */
export function buildWorksheetReferralLines(b: SideBreakdown): {
  line1: string;
  line2: string;
} {
  const eachStr = buildReferralEachLine(b);

  if (b.referralType === "team" && b.teamReferralAgentName && b.teamReferralAmount != null) {
    return {
      line1: `$${formatMoney(b.teamReferralAmount)} to ${b.teamReferralAgentName}`,
      line2: "",
    };
  }

  if (b.mentorName && b.mentorAmount > 0) {
    return {
      line1: `$${formatMoney(b.mentorAmount)} to ${b.mentorName}`,
      line2: eachStr,
    };
  }

  if (b.referralType === "outside" || b.referralType === "team") {
    return { line1: "", line2: "" };
  }

  return { line1: "", line2: eachStr };
}

/** Outside-referral worksheet fields for listing or selling side. */
export function buildOutsideReferralWorksheetFields(b: SideBreakdown): {
  refPct: string;
  refDollars: string;
  refTo: string;
} | null {
  if (b.referralType !== "outside" || !b.referralPayeeName || b.referralPayeeAmount == null) {
    return null;
  }
  return {
    refPct: String(b.referralPct ?? ""),
    refDollars: formatMoney(b.referralPayeeAmount),
    refTo: b.referralPayeeName,
  };
}

/**
 * Commission-notes deposit instruction.
 *   – Nick Martin: "DIRECT DEPOSIT $X TO NICK MARTIN CHECKING ACCOUNT"
 *     (the $50 TC fee is already folded into his total, so it isn't listed)
 *   – Anyone else: "DIRECT DEPOSIT $X TO AGENT CHECKING ACCOUNT, $50.00 to Nick Martin"
 */
/**
 * Commission-notes deposit instruction.
 *   – Nick Martin: "DIRECT DEPOSIT $X TO NICK MARTIN CHECKING ACCOUNT"
 *     (the $50 TC fee is already folded into his total, so it isn't listed)
 *   – Anyone else: "DIRECT DEPOSIT $X TO AGENT CHECKING ACCOUNT, $50.00 to Nick Martin"
 *
 * Team-referral payouts are intentionally omitted here — they appear on the
 * worksheet's "Paid to" referral line, not in Commission Notes.
 */
export function buildAgentNotes(b: SideBreakdown): string {
  const base = `DIRECT DEPOSIT $${formatMoney(b.agentAmount)} TO ${b.agentName.toUpperCase()} CHECKING ACCOUNT`;
  if (b.agentId === "nick-martin") return base;
  return `${base}, $${formatMoney(b.nickAmount)} to Nick Martin`;
}
