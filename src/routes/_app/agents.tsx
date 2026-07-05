import { createFileRoute } from "@tanstack/react-router";

import { AgentsLab } from "@/components/agents/agents-lab";

export const Route = createFileRoute("/_app/agents")({
  component: AgentsLab,
});
