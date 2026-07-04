import { useDevDialKit } from "dialkit";

/** Dev-only tuners for inbox tile layout. */
export function InboxDials() {
  useDevDialKit(
    "Inbox",
    {
      tileMinWidth: [320, 240, 520, 4],
      tileGap: [8, 0, 32, 1],
      readerWidth: [42, 28, 60, 1],
      density: { type: "select", options: ["comfortable", "compact", "dense"], default: "comfortable" },
    },
    { id: "accountbox-inbox" },
  );

  return null;
}
