import { ChevronDownIcon, CheckIcon } from "lucide-react";

import { useSession } from "@/lib/auth/auth-client";
import type { Account } from "@/lib/account";
import { updateSettings, useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Page, PageSection, SegmentedButtons, SettingRow } from "../primitives";

export function ComposerPage({ accounts }: { accounts: Account[] }) {
  const { data: session } = useSession();
  const settings = useSettings();
  return (
    <Page>
      <PageSection title="Composer">
        <SettingRow
          label="Composer opens as"
          description="A floating popout, or a draggable pane in the board"
        >
          <SegmentedButtons
            options={[
              { value: "popout", label: "Popout" },
              { value: "pane", label: "Pane" },
            ]}
            value={settings.composerMode}
            onChange={(composerMode) => updateSettings({ composerMode })}
          />
        </SettingRow>
        <SettingRow
          label="Default send-from"
          description="Which account the composer starts on for a new message"
        >
          <SendFromControl
            accounts={accounts}
            primaryEmail={session?.user.email}
          />
        </SettingRow>
      </PageSection>
    </Page>
  );
}

/** "Primary inbox" (null) falls back to the signed-in address. */
function SendFromControl({
  accounts,
  primaryEmail,
}: {
  accounts: Account[];
  primaryEmail?: string;
}) {
  const { defaultSendFrom } = useSettings();
  const sendable = accounts.filter((account) => account.email);
  // Primary account is already "Primary inbox", so it isn't listed below —
  // pinning it would behave identically to the default.
  const primaryAccount =
    sendable.find((account) => account.email === primaryEmail) ?? null;
  const others = sendable.filter(
    (account) => account.accountId !== primaryAccount?.accountId,
  );
  // Treat "pinned to the primary account" the same as the default (null).
  const onPrimary =
    defaultSendFrom === null || defaultSendFrom === primaryAccount?.accountId;
  const selected = onPrimary
    ? null
    : (sendable.find((account) => account.accountId === defaultSendFrom) ??
      null);
  const label = selected ? selected.email : "Primary inbox";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="max-w-56 font-mono" />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => updateSettings({ defaultSendFrom: null })}
        >
          <span className="text-[13px]">Primary inbox</span>
          {primaryEmail && (
            <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
              {primaryEmail}
            </span>
          )}
          {onPrimary && (
            <CheckIcon
              className={cn(
                "size-3.5 shrink-0 text-primary",
                !primaryEmail && "ml-auto",
              )}
            />
          )}
        </DropdownMenuItem>
        {others.map((account) => (
          <DropdownMenuItem
            key={account.accountId}
            onClick={() =>
              updateSettings({ defaultSendFrom: account.accountId })
            }
          >
            <span className="truncate font-mono text-[12px]">
              {account.email}
            </span>
            {defaultSendFrom === account.accountId && (
              <CheckIcon className="ml-auto size-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
