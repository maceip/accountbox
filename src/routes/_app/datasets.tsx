import { createFileRoute } from "@tanstack/react-router";

import { DatasetsPage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/datasets")({
  component: DatasetsPage,
});
