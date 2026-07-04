import { createFileRoute } from "@tanstack/react-router";

import { RuntimePage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/runtime")({
  component: RuntimePage,
});
