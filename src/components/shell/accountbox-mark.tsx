import { cn } from "@/lib/utils";

/** The AccountBox mark (same path as the workspace gate and journey use) —
 *  the brand is a workbench, not a mailbox. */
export function AccountBoxMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="m15.142 2.818l-2.04 1.13L12 3.311L4.5 7.652v.006L12 12v8.69l7.5-4.343V11.5l2-1.17v7.17L12 23l-9.5-5.5v-11L12 1zm3.387-.499a.507.507 0 0 1 .942 0l.253.612a4.37 4.37 0 0 0 2.25 2.326l.718.32a.53.53 0 0 1 0 .962l-.76.338a4.36 4.36 0 0 0-2.218 2.25l-.247.566a.506.506 0 0 1-.934 0l-.246-.565a4.36 4.36 0 0 0-2.22-2.251l-.76-.338a.53.53 0 0 1 0-.963l.718-.32a4.37 4.37 0 0 0 2.251-2.325z"
      />
    </svg>
  );
}

/** Brand lockup: mark in a primary square. Shared by sidebar + mobile header. */
export function AccountBoxBrand({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md bg-primary text-on-primary",
        className,
      )}
    >
      <AccountBoxMark className={markClassName} />
    </div>
  );
}
