import { parsePropertyAddressForDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";

type PropertyAddressLabelProps = {
  address: string | null | undefined;
  className?: string;
  streetClassName?: string;
  cityClassName?: string;
  /** Full extracted address on hover */
  showFullTitle?: boolean;
};

export function PropertyAddressLabel({
  address,
  className,
  streetClassName,
  cityClassName,
  showFullTitle = true,
}: PropertyAddressLabelProps) {
  const { street, city } = parsePropertyAddressForDisplay(address);
  const full = address?.trim();

  return (
    <div
      className={cn("min-w-0", className)}
      title={showFullTitle && full && full !== street ? full : undefined}
    >
      <p className={cn("font-semibold text-ink leading-snug", streetClassName)}>{street}</p>
      {city ? (
        <p className={cn("font-normal text-ink-soft leading-snug mt-0.5", cityClassName)}>
          {city}
        </p>
      ) : null}
    </div>
  );
}
