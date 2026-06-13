import { createFileRoute } from "@tanstack/react-router";
import { PullRequestsPage } from "@/components/pull-requests";
import { useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/pull-requests")({
  component: PullRequestsRoute,
});

function PullRequestsRoute() {
  const { data: session } = useSession();
  return <PullRequestsPage signedIn={!!session} />;
}
