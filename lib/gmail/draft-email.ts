export type OpeningEmailDraftInput = {
  propertyAddress: string | null;
  inspectionPeriodDays: number | null;
  lenderEmail?: string | null;
  buyerCloserEmail?: string | null;
  sellerCloserEmail?: string | null;
  buyerAgentEmail?: string | null;
  listingEmail?: string | null;
  /** Title company on the seller side — used to detect if the forward-to-title prompt is needed when Team Steady represents the buyer. */
  sellerTitleCo?: string | null;
  /** Name of the listing agent — used as first-name addressee in the forward-to-title prompt when Team Steady represents the buyer. */
  listingAssociate?: string | null;
  /** Which side Team Steady's agent is on. Defaults to "buyer". */
  teamSteadySide?: "buyer" | "seller";
  /** Title company on the buyer side — used to detect if the forward-to-title prompt is needed when Team Steady represents the seller. */
  buyerTitleCo?: string | null;
  /** Name of the buyer's agent — used as first-name addressee in the forward-to-title prompt when Team Steady represents the seller. */
  buyerAgentName?: string | null;
};

export type OpeningEmailDraft = {
  to: string[];
  cc: string[];
  subject: string;
  /** Plain-text email body (always present; used as fallback and for text/plain part). */
  body: string;
  /** Pre-built HTML body. The HTML encoder uses this for the text/html part instead of auto-converting the plain-text body. */
  htmlBody: string;
};

const ALWAYS_CC = "loringpark@results.net";

function nonEmptyEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function uniqueEmails(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const lower = v.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(v);
  }
  return out;
}

/** Street number and name only (no city, state, or zip). */
export function streetAddressOnly(propertyAddress: string | null | undefined): string {
  if (!propertyAddress?.trim()) return "Address TBD";
  return propertyAddress.split(",")[0]?.trim() || propertyAddress.trim();
}

function firstName(full: string | null | undefined): string {
  if (!full?.trim()) return "";
  return full.trim().split(/\s+/)[0] ?? full.trim();
}

function needsTitlePrompt(titleCo: string | null | undefined): boolean {
  const value = titleCo?.trim();
  return !value || value.toLowerCase() === "unknown";
}

export function buildOpeningEmailDraft(
  input: OpeningEmailDraftInput
): OpeningEmailDraft {
  const address = input.propertyAddress?.trim() || "the property";
  const street  = streetAddressOnly(input.propertyAddress);

  const to = uniqueEmails([
    nonEmptyEmail(input.lenderEmail),
    nonEmptyEmail(input.buyerCloserEmail),
    nonEmptyEmail(input.sellerCloserEmail),
  ]);

  const cc = uniqueEmails([
    nonEmptyEmail(input.buyerAgentEmail),
    nonEmptyEmail(input.listingEmail),
    ALWAYS_CC,
  ]);

  // ── Determine whether the forward-to-title prompt is needed ────────────────
  const side = input.teamSteadySide ?? "buyer";
  let forwardPrompt: string | null = null;

  if (side === "buyer" && needsTitlePrompt(input.sellerTitleCo)) {
    const name = firstName(input.listingAssociate);
    if (name) {
      forwardPrompt =
        `${name}, please forward this email to, and reply all with, your title company contact information as soon as possible!`;
    }
  } else if (side === "seller" && needsTitlePrompt(input.buyerTitleCo)) {
    const name = firstName(input.buyerAgentName);
    if (name) {
      forwardPrompt =
        `${name}, please forward this email to, and reply all with, your title company contact information as soon as possible!`;
    }
  }

  // ── Plain-text body ────────────────────────────────────────────────────────
  const hasInspection = (input.inspectionPeriodDays ?? 0) > 0;

  const attachedLine = hasInspection
    ? "Attached you'll find the executed file and a closing worksheet with contact info for all parties. Title work can move forward once the inspection period wraps up."
    : "Attached you'll find the executed file and a closing worksheet with contact info for all parties.";

  const lines: string[] = [
    "Hi Team,",
    "",
    `Excited to be working with you on the transaction for ${address} — thanks for being the crew that'll help bring it to life!`,
    "",
    attachedLine,
  ];

  if (forwardPrompt) {
    lines.push("", forwardPrompt);
  }

  lines.push("", "Looking forward to a smooth process, thanks again!", "", "Best,");

  // ── HTML body ─────────────────────────────────────────────────────────────
  // Always built so that address bolding and any styled elements (e.g. the
  // forward-to-title prompt) are rendered correctly in HTML-capable clients.
  const attachedHtml = hasInspection
    ? "Attached you'll find the executed file and a closing worksheet with contact info for all parties. Title work can move forward once the inspection period wraps up."
    : "Attached you'll find the executed file and a closing worksheet with contact info for all parties.";

  const htmlParagraphs = [
    "<p>Hi Team,</p>",
    `<p>Excited to be working with you on the transaction for <strong>${address}</strong> — thanks for being the crew that'll help bring it to life!</p>`,
    `<p>${attachedHtml}</p>`,
  ];
  if (forwardPrompt) {
    htmlParagraphs.push(`<p><strong><em><u>${forwardPrompt}</u></em></strong></p>`);
  }
  htmlParagraphs.push(
    "<p>Looking forward to a smooth process, thanks again!</p>",
    "<p>Best,</p>",
  );
  const htmlBody = htmlParagraphs.join("\n");

  return {
    to,
    cc,
    subject: `Executed PA || ${street}`,
    body: lines.join("\n"),
    htmlBody,
  };
}
