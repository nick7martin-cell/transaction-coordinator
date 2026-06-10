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
  "mlsNumber": string or null,
  "pidNumber": string or null (property ID / parcel number),
  "buyerNames": array of strings (all buyers named on agreement),
  "buyerEmails": array of strings (buyer email addresses if present),
  "buyerPhones": array of strings (buyer phone numbers if present),
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
  "titleCompany": string or null,
  "hasPreApprovalLetter": boolean (true if a mortgage pre-approval letter is included in this PDF, separate from or attached to the purchase agreement),
  "lenderName": string or null (loan officer name from pre-approval letter — only when hasPreApprovalLetter is true),
  "lenderCompany": string or null (lender / mortgage company name from pre-approval letter),
  "lenderEmail": string or null (loan officer email from pre-approval letter),
  "lenderPhone": string or null (loan officer phone from pre-approval letter),
  "confidence": number between 0 and 1,
  "flaggedForReview": boolean,
  "errors": array of strings
}`;

export function buildExtractionPrompt(documentType: string): string {
  return `Extract all contract terms from this ${documentType} for a real estate transaction coordinator.

RULES:
- Return ONLY valid JSON, no other text, no markdown, no code blocks
- If a field is missing or unclear, use null (use empty arrays for array fields when none found)
- financingType must be one of: conventional, FHA, VA, cash — or null if not specified
- Dates must be YYYY-MM-DD when possible; infer from contract language if only relative dates are given
- buyerBrokerCommissionPct: look for buyer broker compensation percentage (on MN purchase agreements this is line 406); return as a decimal number like 2.7, not 0.027
- mlsNumber: look for MLS# or listing number anywhere in the document
- pidNumber: look for Property ID, PID, Parcel ID, or Tax ID number
- contingencies: list each distinct contingency (financing, inspection, appraisal, sale of buyer property, etc.)
- dualAgency: set true when the listing brokerage and the buyer's brokerage are the same company, or when a single licensee represents both sides. When dualAgency is true, DO NOT guess which named agent is the buyer's agent versus the listing agent — extract whatever names/brokerages appear, but the coordinator will confirm the roles manually. Do not invent a distinction that isn't clearly stated.
- hasPreApprovalLetter: set true only when a mortgage pre-approval letter (or loan pre-qualification letter) is present in this PDF — it may be a separate page appended to the purchase agreement. Do not set true for financing type mentions on the PA alone.
- lenderName, lenderCompany, lenderEmail, lenderPhone: extract ONLY from the pre-approval letter section when hasPreApprovalLetter is true; otherwise use null for all four
- confidence: your overall confidence in the extraction accuracy (0-1)
- If confidence < 0.85, set flaggedForReview to true
- List any ambiguities or missing critical data in errors array

Return this exact JSON shape:
${EXTRACTION_JSON_SCHEMA}`;
}
