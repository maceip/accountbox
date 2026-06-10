import { useState, type ReactNode } from "react";
import { WrapTextIcon } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Raw RFC 822 source (design: terminal surface, 100% mono — header names in
 * syntax blue, folded continuation lines dimmed, MIME boundaries purple).
 * Defaults to exact line structure (no wrap, horizontal scroll); the wrap
 * chip softens long lines when you'd rather not scroll.
 */
export function RawView({ mime }: { mime: string }) {
  const [wrap, setWrap] = useState(false);

  return (
    <div className="min-h-full bg-term">
      <div className="sticky top-0 flex items-center gap-2 border-b bg-term px-4 py-[9px]">
        <span className="font-mono text-[13px] text-accent-2-hover">❯</span>
        <span className="font-mono text-[11.5px] text-ink-subtle">
          message/rfc822 · raw source
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-tertiary">
          {mime.length} bytes
        </span>
        <Hint label="Wrap long lines">
          <button
            type="button"
            aria-pressed={wrap}
            onClick={() => setWrap((current) => !current)}
            className={cn(
              "inline-flex h-[22px] cursor-pointer items-center gap-[5px] rounded-[5px] border px-2 font-mono text-[10.5px] [&_svg]:size-[11px]",
              wrap
                ? "border-accent-2-focus bg-accent-2/15 text-accent-2-hover"
                : "border-hairline text-ink-subtle hover:text-ink",
            )}
          >
            <WrapTextIcon /> wrap
          </button>
        </Hint>
      </div>
      <pre
        className={cn(
          "m-0 px-5 pt-4 pb-14 font-mono text-xs leading-[1.65] text-term-text",
          wrap ? "break-words whitespace-pre-wrap" : "overflow-x-auto whitespace-pre",
        )}
      >
        {mime.split("\n").map((line, i) => (
          <RawLine key={i} line={line} />
        ))}
      </pre>
    </div>
  );
}

function RawLine({ line }: { line: string }) {
  let node: ReactNode;
  if (/^----/.test(line)) {
    node = <span className="text-label-purple">{line}</span>;
  } else if (/^\s/.test(line)) {
    node = <span className="text-ink-tertiary">{line}</span>;
  } else {
    const header = line.match(/^([A-Za-z][A-Za-z0-9-]*):(.*)$/);
    node = header ? (
      <>
        <span className="text-label-blue">{header[1]}</span>
        <span className="text-ink-tertiary">:</span>
        <span>{header[2]}</span>
      </>
    ) : (
      <span>{line || "​"}</span>
    );
  }
  return <div>{node}</div>;
}
