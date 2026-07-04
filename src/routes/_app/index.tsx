import { createFileRoute } from "@tanstack/react-router";

import { CommandCenterPage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/")({
  component: CommandCenterPage,
});
