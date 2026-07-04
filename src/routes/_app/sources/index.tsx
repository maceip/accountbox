import { createFileRoute } from "@tanstack/react-router";

import { SourcesPage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/sources/")({
  component: SourcesPage,
});
