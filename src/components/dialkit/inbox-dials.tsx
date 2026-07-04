import { useEffect } from "react";
import { useDevDialKit } from "dialkit";
import { RESET_TILE_LAYOUT_EVENT } from "@/lib/layout-tree";
import { applyInboxDialVars } from "./dialkit-vars";

/** Dev-only tuners for inbox tile layout. */
export function InboxDials() {
  const values = useDevDialKit(
    "Inbox",
    {
      tileMinWidth: [320, 240, 520, 4],
      tileGap: [8, 0, 32, 1],
      readerWidth: [42, 28, 60, 1],
      density: {
        type: "select",
        options: ["comfortable", "compact", "dense"],
        default: "comfortable",
      },
    },
    { id: "accountbox-inbox" },
  );

  useEffect(() => {
    applyInboxDialVars({
      tileMinWidth: Number(values.tileMinWidth),
      tileGap: Number(values.tileGap),
      readerWidth: Number(values.readerWidth),
      density: String(values.density),
    });
  }, [values.tileMinWidth, values.tileGap, values.readerWidth, values.density]);

  useEffect(() => {
    window.dispatchEvent(new Event(RESET_TILE_LAYOUT_EVENT));
  }, [values.readerWidth]);

  return null;
}
