import { createFileRoute } from "@tanstack/react-router";

import { SourcesGmailHubPage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/sources/gmail/hub")({
  component: SourcesGmailHubPage,
});
