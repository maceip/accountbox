import { createFileRoute } from "@tanstack/react-router";

import { SkillsPage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/skills")({
  component: SkillsPage,
});
