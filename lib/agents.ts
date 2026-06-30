export type SplitTier = "80/20" | "90/10" | "75/25" | "50/50";

export interface Agent {
  id: string;
  name: string;
  splitTier: SplitTier;
  mentorId: string | null;
}

export const AGENTS: Agent[] = [
  // 80/20 — team lead (Nick: $50 TC fee folds into his 80%, no mentor, remainder to Sam/Taylor/Lars evenly)
  { id: "nick-martin", name: "Nick Martin", splitTier: "80/20", mentorId: null },
  // 90/10 splits
  { id: "lucas-hansen", name: "Lucas Hansen", splitTier: "90/10", mentorId: null },
  { id: "luke-chase", name: "Luke Chase", splitTier: "90/10", mentorId: null },
  { id: "brett-lizotte", name: "Brett Lizotte", splitTier: "90/10", mentorId: null },
  { id: "jadde-rowe", name: "Jadde Rowe", splitTier: "90/10", mentorId: null },
  { id: "collin-anderson", name: "Collin Anderson", splitTier: "90/10", mentorId: null },
  { id: "derek-jopp", name: "Derek Jopp", splitTier: "90/10", mentorId: null },
  // 75/25 splits
  { id: "nazar-orishchin", name: "Nazar Orishchin", splitTier: "75/25", mentorId: null },
  { id: "landon-mathis", name: "Landon Mathis", splitTier: "75/25", mentorId: null },
  { id: "phil-cameron", name: "Phil Cameron", splitTier: "75/25", mentorId: null },
  // 50/50 splits
  { id: "alonte-alexander", name: "Alonte Alexander", splitTier: "50/50", mentorId: "jadde-rowe" },
  { id: "jeremy-schulenburg", name: "Jeremy Schulenburg", splitTier: "50/50", mentorId: "lucas-hansen" },
  { id: "kolin-kiekhoefer", name: "Kolin Kiekhoefer", splitTier: "50/50", mentorId: "brett-lizotte" },
  { id: "hubert-ngabirano", name: "Hubert Ngabirano", splitTier: "50/50", mentorId: "collin-anderson" },
];

export function findAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}

/** Match a PA-extracted agent name to a Team Steady agent id. */
export function findAgentIdByName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim().toLowerCase();
  const exact = AGENTS.find((a) => a.name.toLowerCase() === normalized);
  if (exact) return exact.id;
  const first = normalized.split(/\s+/)[0];
  const matches = AGENTS.filter((a) => {
    const parts = a.name.toLowerCase().split(/\s+/);
    return parts[0] === first;
  });
  return matches.length === 1 ? matches[0].id : null;
}

export function getMentor(agent: Agent): Agent | undefined {
  if (!agent.mentorId) return undefined;
  return AGENTS.find((a) => a.id === agent.mentorId);
}

export const SPLIT_TIER_LABELS: Record<SplitTier, string> = {
  "80/20": "80/20 Split (Team Lead)",
  "90/10": "90/10 Split",
  "75/25": "75/25 Split",
  "50/50": "50/50 Split",
};

/** Nick's per-transaction TC fee in dollars, deducted from team share and added to his agent amount. */
export const NICK_TC_FEE = 50;

/** Hubert uses RE/MAX Results email, not @teamsteady.com. */
export const HUBERT_EMAIL = "hubert@ts-re.com";
// PA extractions don't always capture last names, so we key on first name.
const TEAM_STEADY_EMAILS: Record<string, string> = {
  lucas: "lucas@teamsteady.com",
  luke: "luke@teamsteady.com",
  brett: "brett@teamsteady.com",
  jadde: "jadde@teamsteady.com",
  collin: "collin@teamsteady.com",
  derek: "derek@derekjopp.com",
  nazar: "nazar@teamsteady.com",
  landon: "landon@teamsteady.com",
  alonte: "alonte@teamsteady.com",
  phil: "phil@teamsteady.com",
  jeremy: "jeremy@teamsteady.com",
  kolin: "kolin@teamsteady.com",
  hubert: HUBERT_EMAIL,
  nick: "nick@teamsteady.com",
  sam: "sam@teamsteady.com",
};

/**
 * Returns the Team Steady email for a person if their FIRST name matches a
 * known agent, otherwise null. Match is first-name-only and case-insensitive.
 */
export function teamSteadyEmailFor(name: string | null | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  return TEAM_STEADY_EMAILS[first] ?? null;
}

// Grouped for settings display
export const MENTOR_MAP: Record<string, string[]> = {
  "jadde-rowe": ["alonte-alexander"],
  "lucas-hansen": ["jeremy-schulenburg"],
  "brett-lizotte": ["kolin-kiekhoefer"],
  "collin-anderson": ["hubert-ngabirano"],
};
