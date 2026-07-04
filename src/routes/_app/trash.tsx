import { createFileRoute, redirect } from "@tanstack/react-router";

import { GMAIL_FOLDER_PATH } from "@/lib/workbench/nav";

export const Route = createFileRoute("/_app/trash")({
  beforeLoad: () => {
    throw redirect({ to: GMAIL_FOLDER_PATH.trash });
  },
  component: () => null,
});
