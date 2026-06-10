export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/**
 * Deterministic, neutral warm-stone gradient used as a property image skeleton
 * when no real photo is available. Intentionally low-saturation and warm
 * (taupe / stone), never blue or purple, so cards read as polished rather than
 * cheap. Each address gets a subtly different stone tone.
 */
export function getPropertyGradient(seed: string): string {
  const hash = hashString(seed || "property");
  const hue = 26 + (hash % 18); // 26–44: warm sand / taupe / stone
  const sat = 10 + (hash % 6); // 10–15%: muted
  const l1 = 74 + (hash % 5); // lighter top
  const l2 = 58 + (hash % 6); // darker bottom (helps text contrast under overlay)
  return `linear-gradient(160deg, hsl(${hue} ${sat}% ${l1}%) 0%, hsl(${hue} ${sat}% ${l2}%) 100%)`;
}

/**
 * Google Street View Static image URL for an address, used as the default
 * property photo when no custom photo has been uploaded. Requires
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; returns null when unavailable so callers can
 * fall back to the neutral skeleton.
 */
export function streetViewUrl(
  address: string | null | undefined,
  size = "800x600"
): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || !address) return null;
  const params = new URLSearchParams({
    size,
    location: address,
    fov: "80",
    return_error_code: "true",
    key,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

/** Card / hero image priority: custom upload → Street View → null (gradient). */
export function propertyImageSrc(
  customPhotoUrl: string | null | undefined,
  address: string | null | undefined,
  size = "800x600"
): string | null {
  if (customPhotoUrl) return customPhotoUrl;
  return streetViewUrl(address, size);
}

export const PROPERTY_PHOTO_UPDATED = "handled:property-photo-updated";

export function dispatchPropertyPhotoUpdated(transactionId: string, photoUrl: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PROPERTY_PHOTO_UPDATED, { detail: { transactionId, photoUrl } })
  );
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic soft tinted avatar color (bg + text Tailwind classes) for a
 * person's initial circle. Muted, calm tones that fit the warm theme.
 */
const AVATAR_PALETTE = [
  "bg-[#E5EDE9] text-[#3F6F5A]", // green
  "bg-[#FBE9D7] text-[#9A5B28]", // amber
  "bg-[#F6E0E0] text-[#A64C4C]", // rose
  "bg-[#E0E8F5] text-[#3C5A86]", // blue
  "bg-[#EAE6F4] text-[#5E4B8B]", // soft violet
  "bg-[#E3EEF0] text-[#3A6B72]", // teal
];

export function getAvatarColor(seed: string): string {
  return AVATAR_PALETTE[hashString(seed || "?") % AVATAR_PALETTE.length];
}
