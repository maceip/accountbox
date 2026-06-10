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

/**
 * Sender avatar: the sender domain's favicon (proxied through /api/image-proxy
 * so tracker blockers don't drop it and the lookup stays off the user's IP),
 * falling back to colored initials when there's no domain or the icon fails.
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
  const domain = address.split("@")[1]?.toLowerCase();
  const src = domain
    ? `/api/image-proxy?url=${encodeURIComponent(
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      )}`
    : null;
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
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
