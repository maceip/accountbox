import { cn } from "@/lib/utils";

const MARK_SRC = "/brand/accountbox-mark-512.png";
const LOCKUP_SRC = "/brand/accountbox-lockup-wide.png";

/** Hardware module mark — ChatGPT reference art (matte ops panel, not SVG sparkle). */
export function AccountBoxMark({
  className,
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={MARK_SRC}
      alt={alt}
      className={cn("size-full object-contain", className)}
      draggable={false}
    />
  );
}

/** Horizontal lockup: mark + Account/Box wordmark from reference art. */
export function AccountBoxLockup({
  className,
  alt = "AccountBox",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={LOCKUP_SRC}
      alt={alt}
      className={cn("h-full w-auto object-contain object-left", className)}
      draggable={false}
    />
  );
}

/** Sidebar / header brand tile — mark on surface, no orange fill box. */
export function AccountBoxBrand({
  className,
  markClassName,
  variant = "mark",
}: {
  className?: string;
  markClassName?: string;
  /** `mark` = square module; `lockup` = wide wordmark strip */
  variant?: "mark" | "lockup";
}) {
  if (variant === "lockup") {
    return (
      <div className={cn("flex items-center", className)}>
        <AccountBoxLockup className={cn("h-8 max-w-[200px]", markClassName)} />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 ring-1 ring-hairline",
        className,
      )}
    >
      <AccountBoxMark className={cn("size-8", markClassName)} alt="" />
    </div>
  );
}
