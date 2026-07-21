import { findAgent, findAgentIdByName, teamSteadyEmailFor, adminCcForAgent } from "@/lib/agents";
import { formatCurrency } from "@/lib/format";
import type { OpeningEmailDraft } from "@/lib/gmail/draft-email";

export const INTRO_EM_AGENT_IDS = [
  "lucas-hansen",
  "luke-chase",
  "brett-lizotte",
  "jadde-rowe",
] as const;

export type IntroEmAgentId = (typeof INTRO_EM_AGENT_IDS)[number];

const INTRO_EM_AGENT_SET = new Set<string>(INTRO_EM_AGENT_IDS);

export type IntroEmDraftInput = {
  buyerFirstNames: string[];
  buyerEmails: string[];
  earnestMoney: number | null;
  agentId: IntroEmAgentId;
};

function uniqueEmails(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

/** First names for greeting: "John", "John and Jane", "John, Jane, and Bob". */
export function formatBuyerFirstNames(names: string[]): string {
  const firsts = names
    .map((n) => n.trim().split(/\s+/)[0])
    .filter(Boolean);
  if (firsts.length === 0) return "";
  if (firsts.length === 1) return firsts[0];
  if (firsts.length === 2) return `${firsts[0]} and ${firsts[1]}`;
  return `${firsts.slice(0, -1).join(", ")}, and ${firsts[firsts.length - 1]}`;
}

function earnestMoneyPhrase(amount: number | null): string {
  if (amount == null) return "the earnest money for this property";
  return `${formatCurrency(amount)} for this property`;
}

function agentFirstName(agentId: IntroEmAgentId): string {
  return findAgent(agentId)?.name.split(/\s+/)[0] ?? "your agent";
}

function agentFullName(agentId: IntroEmAgentId): string {
  return findAgent(agentId)?.name ?? "your agent";
}

function agentEmail(agentId: IntroEmAgentId): string | null {
  return teamSteadyEmailFor(agentFullName(agentId));
}

type InsuranceContact = {
  name: string;
  company: string;
  phone: string;
  email: string;
};

const INSURANCE_CONTACTS: Record<IntroEmAgentId, InsuranceContact[]> = {
  "lucas-hansen": [
    {
      name: "Chris Schulenberg",
      company: "Insurance Brokers of Minnesota",
      phone: "952-567-9964",
      email: "chris@insurancebrokersmn.com",
    },
  ],
  "luke-chase": [
    {
      name: "Tim Ness",
      company: "Insurance Brokers of Minnesota",
      phone: "(952) 960-9119",
      email: "Tim@insurancebrokersmn.com",
    },
    {
      name: "Ryan Hangartner",
      company: "State Farm Insurance",
      phone: "952-992-0051",
      email: "ryan.hangartner.w34g@statefarm.com",
    },
  ],
  "brett-lizotte": [
    {
      name: "Ryan Hangartner",
      company: "State Farm Insurance",
      phone: "952-992-0051",
      email: "ryan.hangartner.w34g@statefarm.com",
    },
    {
      name: "Chris Schulenberg",
      company: "Insurance Brokers of Minnesota",
      phone: "952-232-1960",
      email: "chris@insurancebrokersmn.com",
    },
  ],
  "jadde-rowe": [
    {
      name: "Joe Breen",
      company: "State Farm Insurance",
      phone: "612-255-1923",
      email: "joe@joebreensf.com",
    },
    {
      name: "Chris Schulenberg",
      company: "Insurance Brokers of Minnesota",
      phone: "952-232-1960",
      email: "chris@insurancebrokersmn.com",
    },
  ],
};

function insuranceContactsPlain(contacts: InsuranceContact[]): string[] {
  const lines: string[] = ["RECOMMENDED HOMEOWNER'S INSURANCE:", ""];
  contacts.forEach((c, i) => {
    if (i > 0) lines.push("");
    lines.push(c.name, c.company, c.phone, c.email);
  });
  return lines;
}

function insuranceContactsHtml(contacts: InsuranceContact[]): string {
  const blocks = contacts
    .map(
      (c) =>
        `${c.name}<br>${c.company}<br>${c.phone}<br><a href="mailto:${c.email}">${c.email}</a>`
    )
    .join("<br><br>");
  return [
    `<p style="text-align:center"><strong>RECOMMENDED HOMEOWNER'S INSURANCE</strong></p>`,
    `<p style="text-align:center">${blocks}</p>`,
  ].join("\n");
}

export function resolveIntroEmAgentId(
  buyerAgentName: string | null | undefined
): IntroEmAgentId | null {
  const id = findAgentIdByName(buyerAgentName);
  if (!id || !INTRO_EM_AGENT_SET.has(id)) return null;
  return id as IntroEmAgentId;
}

export function buildIntroEmEmailDraft(input: IntroEmDraftInput): OpeningEmailDraft {
  const greetingNames = formatBuyerFirstNames(input.buyerFirstNames);
  const greeting = greetingNames ? `Hi ${greetingNames},` : "Hi,";
  const agentName = agentFullName(input.agentId);
  const agentFirst = agentFirstName(input.agentId);
  const earnestPhrase = earnestMoneyPhrase(input.earnestMoney);

  const cc = uniqueEmails([
    agentEmail(input.agentId) ?? "",
    ...adminCcForAgent(input.agentId),
  ]);

  const insurance = INSURANCE_CONTACTS[input.agentId];

  const bodyLines = [
    greeting,
    "",
    "Congrats on your accepted offer! My name is Nick and I work as the Operations Manager for " +
      `${agentName}. I'll be helping out with some of the details for your transaction moving forward.`,
    "",
    "The next step we need you to take is to open the link I just emailed you from TrustFunds. This is for the earnest money (" +
      `${earnestPhrase}) to be electronically sent to the seller's broker, so they can begin to process your file. Please read the automated email and follow the instructions ASAP, as this is time-sensitive. If you do not see the email in your inbox, please check your spam folder as the emails from TrustFunds often find their way there. The secret word is "teamsteady." Feel free to reach out to ${agentFirst} with any questions you may have.`,
    "",
    "You will also need to set up homeowner's insurance prior to closing. You are welcome to choose anyone for homeowner's insurance, but here is the contact info for someone we know and trust.",
    "",
    ...insuranceContactsPlain(insurance),
    "",
    "That's all I have for you at this point – once again, congratulations!",
  ];

  const htmlBody = [
    `<p>${greeting}</p>`,
    `<p>Congrats on your accepted offer! My name is Nick and I work as the Operations Manager for ${agentName}. I'll be helping out with some of the details for your transaction moving forward.</p>`,
    `<p>The next step we need you to take is to open the link I just emailed you from TrustFunds. This is for the earnest money (${earnestPhrase}) to be electronically sent to the seller's broker, so they can begin to process your file. Please read the automated email and follow the instructions ASAP, as this is time-sensitive. If you do not see the email in your inbox, please check your spam folder as the emails from TrustFunds often find their way there. The secret word is &quot;teamsteady.&quot; Feel free to reach out to ${agentFirst} with any questions you may have.</p>`,
    `<p>You will also need to set up homeowner's insurance prior to closing. You are welcome to choose anyone for homeowner's insurance, but here is the contact info for someone we know and trust.</p>`,
    insuranceContactsHtml(insurance),
    `<p>That's all I have for you at this point – once again, congratulations!</p>`,
  ].join("\n");

  return {
    to: uniqueEmails(input.buyerEmails),
    cc,
    subject: "Earnest Money & Homeowner's Insurance",
    body: bodyLines.join("\n"),
    htmlBody,
  };
}
