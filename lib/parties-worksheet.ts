import { canonicalContactEmail } from "@/lib/canonical-contacts";
import type { TransactionParty } from "@/lib/types";

function partyEmail(party: TransactionParty): string {
  return canonicalContactEmail(party.name, party.email, party.company);
}

/** Map the parties roster onto closing-worksheet override keys. */
export function partiesToWorksheet(parties: TransactionParty[]): Record<string, string> {
  const ws: Record<string, string> = {
    buyer1Name: "", buyer1Email: "", buyer1Phone: "",
    buyer2Name: "", buyer2Email: "", buyer2Phone: "",
    seller1Name: "", seller1Email: "", seller1Phone: "",
    seller2Name: "", seller2Email: "", seller2Phone: "",
    buyerAgentName: "", buyerAgentCo: "", buyerAgentEmail: "", buyerAgentPhone: "",
    listingAssociate: "", listingCo: "", listingEmail: "", listingPhone: "",
    lender: "", loanOfficer: "", lenderEmail: "", lenderPhone: "",
    buyerTitleCo: "", buyerCloser: "", buyerCloserEmail: "", buyerCloserPh: "",
    sellerTitleCo: "", sellerCloser: "", sellerCloserEmail: "", sellerCloserPh: "",
  };

  const buyers = parties.filter((p) => p.role === "buyer");
  const sellers = parties.filter((p) => p.role === "seller");
  buyers.slice(0, 2).forEach((b, i) => {
    const n = i + 1;
    ws[`buyer${n}Name`] = b.name;
    ws[`buyer${n}Email`] = b.email;
    ws[`buyer${n}Phone`] = b.phone;
  });
  sellers.slice(0, 2).forEach((s, i) => {
    const n = i + 1;
    ws[`seller${n}Name`] = s.name;
    ws[`seller${n}Email`] = s.email;
    ws[`seller${n}Phone`] = s.phone;
  });

  const ba = parties.find((p) => p.role === "buyer_agent");
  if (ba) {
    ws.buyerAgentName = ba.name;
    ws.buyerAgentCo = ba.company;
    ws.buyerAgentEmail = partyEmail(ba);
    ws.buyerAgentPhone = ba.phone;
  }

  const la = parties.find((p) => p.role === "listing_agent");
  if (la) {
    ws.listingAssociate = la.name;
    ws.listingCo = la.company;
    ws.listingEmail = partyEmail(la);
    ws.listingPhone = la.phone;
  }

  const lender = parties.find((p) => p.role === "lender");
  if (lender) {
    ws.lender = lender.company;
    ws.loanOfficer = lender.name;
    ws.lenderEmail = partyEmail(lender);
    ws.lenderPhone = lender.phone;
  }

  const bt = parties.find((p) => p.role === "buyer_title");
  if (bt) {
    ws.buyerTitleCo = bt.company;
    ws.buyerCloser = bt.name;
    ws.buyerCloserEmail = partyEmail(bt);
    ws.buyerCloserPh = bt.phone;
  }

  const st = parties.find((p) => p.role === "seller_title");
  if (st) {
    ws.sellerTitleCo = st.company;
    ws.sellerCloser = st.name;
    ws.sellerCloserEmail = partyEmail(st);
    ws.sellerCloserPh = st.phone;
  }

  return ws;
}

/** Fill blank worksheet contact fields from the parties roster without wiping overrides. */
export function mergeWorksheetFromParties(
  existingWs: Record<string, unknown>,
  parties: TransactionParty[]
): Record<string, unknown> {
  const partyFields = partiesToWorksheet(parties);
  const worksheet: Record<string, unknown> = { ...existingWs, _parties: parties };
  for (const [k, v] of Object.entries(partyFields)) {
    const cur = existingWs[k];
    const blank = cur === undefined || cur === null || cur === "";
    if (blank && v) worksheet[k] = v;
  }
  return worksheet;
}
