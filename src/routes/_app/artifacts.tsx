import { createFileRoute } from "@tanstack/react-router";

import { ArtifactsPage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/artifacts")({
  component: ArtifactsPage,
});
