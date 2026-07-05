import { ExternalLink, Palette } from "lucide-react";

import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import {
  STITCH_DESIGNS,
  type StitchDesignId,
} from "@/lib/workbench/stitch-designs";

/** Opens the Stitch HTML export for side-by-side design comparison. */
export function StitchDesignBar({
  designId,
  className,
}: {
  designId: StitchDesignId;
  className?: string;
}) {
  const design = STITCH_DESIGNS[designId];
  return (
    <Frame variant="ghost" spacing="xs" className={className}>
      <FramePanel className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="flex items-center gap-2">
          <Palette className="size-3.5 text-muted-foreground" />
          <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Stitch design reference
          </p>
        </div>
        <Button
          size="xs"
          variant="outline"
          className="font-mono text-[10px] uppercase"
          render={
            <a
              href={design.htmlPath}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open Stitch design for ${design.title}`}
            />
          }
        >
          {design.title}
          <ExternalLink className="size-3" />
        </Button>
      </FramePanel>
    </Frame>
  );
}
