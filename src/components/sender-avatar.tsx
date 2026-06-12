import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const proxied = (url: string) =>
  `/api/image-proxy?url=${encodeURIComponent(url)}`;

/**
 * Sender avatar derived from the email, the way Gmail does it: try unavatar
 * (which resolves a Gravatar photo, then the brand's logo/favicon), then fall
 * back to the domain favicon, then to colored initials. Everything is proxied
 * through /api/image-proxy so tracker blockers don't drop it and the lookup
 * stays off the user's IP. `?fallback=false` makes unavatar 404 (not return a
 * mystery-person) when it finds nothing, so we land on our own initials.
 */
export function SenderAvatar({
  name,
  address,
  color,
  className,
}: {
  name: string;
  address: string;
  color: string;
  className?: string;
}) {
  const lookup = address.trim().toLowerCase();
  const domain = lookup.split("@")[1];
  const sources = [
    lookup && `https://unavatar.io/${encodeURIComponent(lookup)}?fallback=false`,
    domain && `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ]
    .filter((url): url is string => Boolean(url))
    .map(proxied);

  // Walk the sources on error; once we run out, render initials.
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [lookup]);
  const src = sources[index];

  if (src) {
    return (
      <img
        key={src}
        src={src}
        alt=""
        loading="lazy"
        onError={() => setIndex((current) => current + 1)}
        className={cn(
          "size-9 shrink-0 rounded-full border border-input bg-muted object-cover",
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-input text-[13px] font-semibold text-foreground",
        className,
      )}
      style={{ background: `color-mix(in srgb, ${color} 22%, var(--background))` }}
    >
      {initials(name)}
    </span>
  );
}
