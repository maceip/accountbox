import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

/**
 * The single source of account → color mapping (Component Spec: never assign
 * dot colors anywhere else). Each account can pick its color in Settings →
 * Accounts; unset accounts fall back to their position in the accounts list.
 */
export const ACCOUNT_COLORS = [
  { label: "Blue", value: "var(--color-label-blue)" },
  { label: "Green", value: "var(--color-label-green)" },
  { label: "Purple", value: "var(--color-label-purple)" },
  { label: "Red", value: "var(--color-label-red)" },
  { label: "Yellow", value: "var(--color-label-yellow)" },
  { label: "Orange", value: "var(--color-label-orange)" },
];

export function resolveAccountColor(
  fallbackIndex: number,
  accountId: string | undefined,
  overrides: Record<string, number>,
): string {
  const index =
    accountId !== undefined && overrides[accountId] !== undefined
      ? overrides[accountId]
      : fallbackIndex;
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length].value;
}

/** Convenience for components that need the raw color (stacked dots etc.). */
export function useAccountColor(
  fallbackIndex: number,
  accountId?: string,
): string {
  const { accountColors } = useSettings();
  return resolveAccountColor(fallbackIndex, accountId, accountColors);
}

export function AccountDot({
  colorIndex,
  accountId,
  unread = true,
  className,
}: {
  /** Fallback: the account's position in the accounts list. */
  colorIndex: number;
  accountId?: string;
  unread?: boolean;
  className?: string;
}) {
  const color = useAccountColor(colorIndex, accountId);
  return (
    <span
      aria-hidden
      className={cn("inline-block size-[7px] shrink-0 rounded-full", className)}
      style={
        unread
          ? {
              background: color,
              boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)`,
            }
          : {
              background: "transparent",
              boxShadow: `inset 0 0 0 1.5px ${color}`,
              opacity: 0.5,
            }
      }
    />
  );
}
