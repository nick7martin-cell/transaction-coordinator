export const EXTRACTION_JSON_SCHEMA = `{
  "propertyAddress": string or null,
  "purchasePrice": number or null,
  "closingDate": string in YYYY-MM-DD format or null,
  "acceptanceDate": string in YYYY-MM-DD format or null,
  "inspectionPeriodDays": number or null,
  "inspectionContingencyExpirationDate": string in YYYY-MM-DD format or null,
  "earnestMoney": number or null,
  "earnestMoneyDueDate": string in YYYY-MM-DD format or null,
  "financingType": "conventional" | "FHA" | "VA" | "cash" or null,
  "financingPercentage": number or null (loan-to-value or down payment percentage as stated),
  "buyerBrokerCommissionPct": number or null (buyer broker compensation %, e.g. 2.7 — on Minnesota PA this is line 406),
  "sellerPaidBuyerConcessions": number or null (dollar amount seller pays toward buyer closing costs — on Minnesota PA this is line 159; null if none or only a percentage is stated),
  "sellerPaidBuyerConcessionsPct": number or null (percentage of purchase price when line 159 states seller-paid buyer closing costs as a % instead of dollars; e.g. 3 for 3%; null if only dollars or none),
  "mlsNumber": string or null,
  "pidNumber": string or null (property ID / parcel number),
  "buyerNames": array of strings (all buyers named on agreement),
  "buyerEmails": array of strings (buyer email addresses — from PA, emails, or notes; align index with buyerNames),
  "buyerPhones": array of strings (buyer phone numbers — from PA, emails, or notes; align index with buyerNames),
  "buyerAgentName": string or null,
  "buyerAgentBrokerage": string or null,
  "buyerAgentEmail": string or null,
  "buyerAgentPhone": string or null,
  "sellerNames": array of strings (all sellers named on agreement),
  "sellerEmails": array of strings (seller email addresses if present),
  "sellerPhones": array of strings (seller phone numbers if present),
  "listingAgentName": string or null,
  "listingAgentBrokerage": string or null,
  "listingAgentEmail": string or null,
  "listingAgentPhone": string or null,
  "dualAgency": boolean (true if the same brokerage OR the same licensee represents both the buyer and the seller),
  "contingencies": array of strings listing each contingency mentioned,
  "titleCompany": string or null (legacy fallback only — prefer buyerTitleCompany or sellerTitleCompany when the side is known),
  "buyerTitleCompany": string or null (buyer-side title company name),
  "buyerTitleCloserName": string or null (buyer-side title closer / escrow officer name),
  "buyerTitleCloserEmail": string or null,
  "buyerTitleCloserPhone": string or null,
  "sellerTitleCompany": string or null (seller-side / other-side title company name),
  "sellerTitleCloserName": string or null (seller-side title closer name),
  "sellerTitleCloserEmail": string or null,
  "sellerTitleCloserPhone": string or null,
  "hasPreApprovalLetter": boolean (true if a mortgage pre-approval letter is included in the uploaded PDF documents),
  "lenderName": string or null (loan officer name),
  "lenderCompany": string or null (lender / mortgage company name),
  "lenderEmail": string or null (loan officer email),
  "lenderPhone": string or null (loan officer phone),
  "confidence": number between 0 and 1,
  "flaggedForReview": boolean,
  "errors": array of strings
}`;

const SUPPLEMENTAL_CONTACT_RULES = `
SUPPLEMENTAL SOURCES — CRITICAL:
- Coordinator notes and screenshot images (email threads, signature blocks, business cards, intro emails, contact lists) are first-class sources for party contact information.
- Extract EVERY email address, phone number, company name, and person name you can reliably match to a transaction role — even when that information is NOT on the purchase agreement.
- Email screenshots often contain the other-side listing agent, seller's title closer, lender/loan officer, buyers, or sellers. Parse To/From/Cc lines, signatures, and body text.
- Coordinator notes may paste contact info directly — extract all of it. Examples:
  • "Seller's title: First American Title, closer Sarah Smith sarah@fa.com 612-555-0100" → sellerTitle* fields
  • "Other side title company: ABC Escrow, John Doe john@abc.com" → sellerTitle* on buyer-side Team Steady deals, buyerTitle* on listing-side deals
  • "Listing agent: Jane Smith jane@broker.com 612-555-0100" → listingAgent* fields
  • "Lender: Laura Freese, Edge Home Finance\\nlaura@edge.com | 507-227-0843" → lenderName, lenderCompany, lenderEmail, lenderPhone
- When coordinator notes name a specific lender or loan officer, treat that person as authoritative — even if a different default contact for the same company is already on file.
- When notes mention title/escrow without specifying buyer vs seller, use sellerTitle* if Team Steady represents the buyer (the other side's title), or buyerTitle* if Team Steady represents the seller.
- When the same person appears in multiple sources, prefer the most complete contact record.
- buyerEmails/buyerPhones and sellerEmails/sellerPhones arrays must align by index with buyerNames/sellerNames when possible.
- When coordinator notes paste a title closer block (name, company, email, phone) without saying buyer vs seller, treat it as the OTHER side's title — not Team Steady's auto-seeded title contact.
- When notes say "seller's title" or "other side title", always use sellerTitle* fields on buyer-side deals (and buyerTitle* on listing-side deals).
- When an email is from or about a Team Steady / Re/Max Results agent on this transaction sharing which title or escrow company they use, map it to THEIR side: buyer agent's title company → buyerTitle* fields; listing agent's title company → sellerTitle* fields.
- Do not assume Watermark Title for any agent — extract exactly what the email states. Derek Jopp in particular may use different title companies on different deals.
- Lender fields: extract from pre-approval letters when present AND from email screenshots or notes when they identify the loan officer for this transaction. Set hasPreApprovalLetter true only when a pre-approval/ pre-qualification letter document is actually included — not from a casual email mention alone.
- Listing agent / buyer agent emails and phones often appear ONLY in supplemental emails — always check screenshots and notes for them.
`;

export function buildExtractionPrompt(documentType: string): string {
  return `Extract all contract terms and transaction party contact information from this ${documentType} for a real estate transaction coordinator.

RULES:
- Return ONLY valid JSON, no other text, no markdown, no code blocks
- If a field is missing or unclear, use null (use empty arrays for array fields when none found)
- financingType must be one of: conventional, FHA, VA, cash — or null if not specified
- Dates must be YYYY-MM-DD when possible; infer from contract language if only relative dates are given
- buyerBrokerCommissionPct: look for buyer broker compensation percentage (on MN purchase agreements this is line 406); return as a decimal number like 2.7, not 0.027
- sellerPaidBuyerConcessions / sellerPaidBuyerConcessionsPct: on Minnesota purchase agreements, line 159 covers seller-paid buyer closing costs (buyer concessions). Extract the dollar amount into sellerPaidBuyerConcessions when a $ amount is filled in; extract the percentage into sellerPaidBuyerConcessionsPct when stated as % of purchase price. Use null for whichever form is not used. If line 159 is blank or N/A, both are null.
- mlsNumber: look for MLS# or listing number anywhere in the document
- pidNumber: look for Property ID, PID, Parcel ID, or Tax ID number
- contingencies: list each distinct contingency (financing, inspection, appraisal, sale of buyer property, etc.)
- dualAgency: set true when the listing brokerage and the buyer's brokerage are the same company, or when a single licensee represents both sides. When dualAgency is true, DO NOT guess which named agent is the buyer's agent versus the listing agent — extract whatever names/brokerages appear, but the coordinator will confirm the roles manually. Do not invent a distinction that isn't clearly stated.
- confidence: your overall confidence in the extraction accuracy (0-1)
- If confidence < 0.85, set flaggedForReview to true
- List any ambiguities or missing critical data in errors array
${SUPPLEMENTAL_CONTACT_RULES}

Return this exact JSON shape:
${EXTRACTION_JSON_SCHEMA}`;
}

/** Prompt when extracting contact info only from notes/screenshots (no PA PDF). */
export function buildSupplementalExtractionPrompt(context: {
  propertyAddress: string | null;
  knownParties: string;
  teamSteadySide?: "buyer" | "seller" | null;
}): string {
  const sideHint =
    context.teamSteadySide === "buyer"
      ? `Team Steady represents the BUYER on this deal. Title/escrow in notes without an explicit side label is the SELLER'S title → use sellerTitle* fields only. Do NOT re-output Lacey Rentz / All American Title / Watermark / Ingrid Bredeson unless notes explicitly say they are the seller's title.`
      : context.teamSteadySide === "seller"
        ? `Team Steady represents the LISTING side on this deal. Title/escrow in notes without an explicit side label is the BUYER'S title → use buyerTitle* fields only. Do NOT re-output the listing side's default title contact unless notes explicitly say so.`
        : `If notes do not say buyer vs seller title, map title to sellerTitle* when Team Steady is the buyer's agent and to buyerTitle* when Team Steady is the listing agent.`;

  return `Extract transaction party contact information for a real estate transaction coordinator.

This upload contains ONLY supplemental material (coordinator notes and/or email screenshots) — not a purchase agreement. Focus entirely on finding contact details for everyone involved in the transaction.

Known context for this transaction:
- Property: ${context.propertyAddress ?? "unknown"}
- ${sideHint}
- Existing contacts already on file:
${context.knownParties || "  (none yet)"}

When notes or screenshots name a specific lender/loan officer, extract that person even if a different lender is listed above — coordinator notes override defaults.
When notes name a title company or closer that is NOT already listed above for that side, extract them even if a default title contact exists for the other side.

RULES:
- Return ONLY valid JSON, no other text, no markdown, no code blocks
- Leave contract fields (purchasePrice, closingDate, earnestMoney, etc.) as null unless explicitly stated in the supplemental material
- Extract all party contact info you can identify: buyers, sellers, buyer agent, listing agent, lender/loan officer, buyer-side title, seller-side title
- Parse email headers (From/To/Cc), signature blocks, and pasted contact lists carefully
- buyerEmails/buyerPhones and sellerEmails/sellerPhones arrays must align by index with buyerNames/sellerNames when possible
- Set confidence based on how clearly the supplemental material identifies each contact
- If confidence < 0.85, set flaggedForReview to true
${SUPPLEMENTAL_CONTACT_RULES}

Return this exact JSON shape:
${EXTRACTION_JSON_SCHEMA}`;
}

export function summarizePartiesForPrompt(
  parties: Array<{ role: string; name: string; company: string; email: string }>
): string {
  if (parties.length === 0) return "";
  return parties
    .map((p) => {
      const parts = [p.role, p.name || "(no name)", p.company].filter(Boolean);
      const contact = [p.email].filter(Boolean).join(", ");
      return `  - ${parts.join(" · ")}${contact ? ` · ${contact}` : ""}`;
    })
    .join("\n");
}

/** Omit auto-seeded Team Steady title placeholders from supplemental context so the model extracts from notes. */
export function partiesForSupplementalPrompt(
  parties: Array<{ role: string; name: string; company: string; email: string }>,
  _teamSteadySide: "buyer" | "seller" | null
): typeof parties {
  return parties.filter((p) => {
    if (p.role !== "buyer_title" && p.role !== "seller_title") return true;
    const name = (p.name ?? "").trim().toLowerCase();
    const company = (p.company ?? "").trim().toLowerCase();
    const email = (p.email ?? "").trim().toLowerCase();
    const isDefault =
      (name.includes("ingrid") && name.includes("bredeson")) ||
      company.includes("watermark") ||
      email.includes("wmtitle.com") ||
      (name.includes("lacey") && name.includes("rentz")) ||
      company.includes("all american title") ||
      email.includes("allamericantitleco.com") ||
      company === "unknown";
    return !isDefault;
  });
}
