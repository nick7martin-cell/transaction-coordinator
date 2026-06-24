export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Parse user-entered currency text (e.g. "$500,000") into a positive number. */
export function parseCurrencyInput(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function daysUntilClosing(
  closingDate: string | null | undefined
): number | null {
  if (!closingDate) return null;
  const closing = new Date(closingDate + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = closing.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function closingCountdownLabel(days: number | null): string {
  if (days == null) return "Closing date TBD";
  if (days < 0) return `Closed ${Math.abs(days)} days ago`;
  if (days === 0) return "Closes today";
  if (days === 1) return "1 day until closing";
  return `${days} days until closing`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export function formatNames(names: string[] | null | undefined): string {
  if (!names?.length) return "—";
  return names.join(", ");
}

export type PropertyAddressParts = {
  street: string;
  city: string | null;
};

/** Street + city for UI; drops state and ZIP (e.g. "13213 E Manor Blvd, Shakopee, MN 55379"). */
export function parsePropertyAddressForDisplay(
  address: string | null | undefined
): PropertyAddressParts {
  if (!address?.trim()) {
    return { street: "Address pending", city: null };
  }

  const parts = address
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { street: "Address pending", city: null };
  }

  const street = parts[0];

  if (parts.length === 1) {
    return { street, city: null };
  }

  if (parts.length >= 3) {
    return { street, city: parts[1] || null };
  }

  const rest = parts[1];
  const cityStateZip = rest.match(/^(.+?)\s+[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (cityStateZip) {
    return { street, city: cityStateZip[1].trim() || null };
  }

  if (/^[A-Za-z]{2}$/.test(rest) || /^[A-Za-z]{2}\s+\d{5}/.test(rest)) {
    return { street, city: null };
  }

  return { street, city: rest };
}

const STREET_TYPE_SUFFIX =
  /\s+(?:Circle|Cir\.?|Court|Ct\.?|Drive|Dr\.?|Lane|Ln\.?|Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Way|Place|Pl\.?|Trail|Trl\.?|Parkway|Pkwy\.?|Highway|Hwy\.?)$/i;

/** PDF / print title: "[Street Number] [Street Name] CW" (no city, state, zip, or street type). */
export function worksheetPdfTitle(address: string | null | undefined): string {
  if (!address?.trim()) return "Closing Worksheet CW";
  const streetPart = address.split(",")[0]?.trim() ?? "";
  const match = streetPart.match(/^(\d+)\s+(.+)$/);
  if (!match) return `${streetPart} CW`.trim() || "Closing Worksheet CW";
  const [, streetNumber, streetRest] = match;
  const streetName = streetRest.replace(STREET_TYPE_SUFFIX, "").trim();
  return `${streetNumber} ${streetName} CW`.trim();
}
