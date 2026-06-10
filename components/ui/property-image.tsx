import { getPropertyGradient } from "@/lib/property-image";
import { cn } from "@/lib/utils";
import { House } from "lucide-react";

export function PropertyImage({
  seed,
  src,
  className,
  overlay,
  /** When true, lays a bottom-weighted dark gradient for white text legibility */
  darkOverlay = false,
  iconSize = 44,
}: {
  seed: string;
  src?: string | null;
  className?: string;
  overlay?: React.ReactNode;
  darkOverlay?: boolean;
  iconSize?: number;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-line", className)}>
      {src ? (
        // Real photo (e.g. Google Street View) when available
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Property"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // Neutral warm-stone skeleton — never blue/purple
        <div
          className="absolute inset-0"
          style={{ background: getPropertyGradient(seed) }}
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDQwVjIwaDIwVjQwSDB6TTIwIDIwSDBWMEgyMHYyMHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA0Ii8+PC9nPjwvc3ZnPg==')] opacity-70" />
          <div className="absolute inset-0 flex items-center justify-center">
            <House
              className="text-white/35"
              strokeWidth={1.25}
              style={{ width: iconSize, height: iconSize }}
            />
          </div>
        </div>
      )}

      {darkOverlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/5" />
      )}

      {overlay}
    </div>
  );
}
