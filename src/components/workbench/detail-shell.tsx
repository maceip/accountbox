import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVerticalIcon, XIcon } from "lucide-react";

import { useTileDrag } from "@/components/tile-board";
import { Hint } from "@/components/ui/tooltip";

/**
 * The generic detail pane frame: draggable header (icon · title · extras ·
 * close), scrollable body, optional footer action bar. It measures its own
 * width and hands `narrow` to the body/footer, so detail views can fold their
 * action bars without owning a ResizeObserver each.
 *
 * The Gmail reader fills these slots today; a GitHub PR detail (or any other
 * source's reader) gets the same chrome for free.
 */

/** Below this the action bar folds (secondary verbs into overflow). */
const NARROW_AT = 560;

export function DetailShell({
  paneId,
  icon,
  title,
  headerExtras,
  onClose,
  children,
  footer,
}: {
  paneId: string;
  icon: ReactNode;
  title: ReactNode;
  /** Right side of the header, before the close button (tags, star, …). */
  headerExtras?: ReactNode;
  onClose: () => void;
  children: ReactNode | ((narrow: boolean) => ReactNode);
  footer?: ReactNode | ((narrow: boolean) => ReactNode);
}) {
  const beginHeaderDrag = useTileDrag();
  const paneRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setNarrow(entries[0].contentRect.width < NARROW_AT),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const footerNode = typeof footer === "function" ? footer(narrow) : footer;

  return (
    <div ref={paneRef} className="flex h-full min-w-0 flex-col bg-background">
      <div
        onPointerDown={(event) => beginHeaderDrag(event, paneId)}
        className="flex h-9 shrink-0 items-center gap-[9px] border-b px-2.5 select-none md:cursor-grab md:touch-none md:active:cursor-grabbing"
      >
        <GripVerticalIcon className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" />
        {icon}
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
          {title}
        </span>
        {headerExtras}
        <span className="h-[18px] w-px shrink-0 bg-border" />
        <Hint label="Close (Esc)">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-[15px]" />
          </button>
        </Hint>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {typeof children === "function" ? children(narrow) : children}
      </div>

      {footerNode && (
        <div className="flex shrink-0 items-center gap-2 border-t bg-card px-3 py-2.5">
          {footerNode}
        </div>
      )}
    </div>
  );
}
