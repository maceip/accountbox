import { createFileRoute, redirect } from "@tanstack/react-router";

import { GMAIL_FOLDER_PATH } from "@/lib/workbench/nav";

/** Legacy /sent → Sources → Gmail. */
export const Route = createFileRoute("/_app/sent")({
  beforeLoad: () => {
    throw redirect({ to: GMAIL_FOLDER_PATH.sent });
  },
  component: () => null,
});
