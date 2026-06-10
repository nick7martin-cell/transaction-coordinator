export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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
