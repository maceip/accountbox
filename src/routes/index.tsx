import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { linkGoogle, signIn, signOut, useSession } from "../lib/auth-client";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/")({
  component: Home,
});

type Email = { id: string; from: string; subject: string; date: string };
type Account = { accountId: string; email: string };

function Inbox({ account }: { account: Account }) {
  const [emails, setEmails] = useState<Email[] | null>(null);

  useEffect(() => {
    fetch(`/api/emails?accountId=${account.accountId}&max=50`)
      .then((res) => res.json())
      .then((data) => setEmails(data.emails ?? []));
  }, [account.accountId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate text-base">
          {account.email || account.accountId}
        </CardTitle>
        <CardDescription>
          {emails ? `${emails.length} messages` : "Loading…"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[60vh] pr-3">
          <ul className="space-y-1">
            {emails?.map((email) => (
              <li
                key={email.id}
                className="rounded-md p-2 hover:bg-muted"
              >
                <p className="truncate text-sm font-medium">
                  {email.subject || "(no subject)"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {email.from}
                </p>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function Inboxes() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []));
  }, []);

  if (!accounts) {
    return <p className="text-sm text-muted-foreground">Loading accounts…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {accounts.map((account) => (
        <Inbox key={account.accountId} account={account} />
      ))}
    </div>
  );
}

function Home() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center text-muted-foreground">
        Loading…
      </main>
    );
  }

  if (!session) {
    return (
      <main className="relative grid min-h-screen place-items-center p-6">
        <div className="absolute top-4 right-4">
          <ModeToggle />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Better Mail</CardTitle>
            <CardDescription>Sign in to view your inboxes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => signIn()}>
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const initials = (session.user.name ?? session.user.email ?? "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={session.user.image ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="text-sm font-medium">{session.user.name}</p>
            <p className="text-sm text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => linkGoogle()}>
            Link another Gmail
          </Button>
          <Button variant="ghost" onClick={() => signOut()}>
            Sign out
          </Button>
          <ModeToggle />
        </div>
      </header>

      <Inboxes />
    </main>
  );
}
