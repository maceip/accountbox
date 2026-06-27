import { useEffect, useRef, useState, type ComponentType } from "react";
import type { Editor } from "@tiptap/react";
import {
  CalendarIcon,
  ChevronDownIcon,
  CircleUserRound,
  MailIcon,
  Pencil,
  SparklesIcon,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VARIABLE_KEYS } from "@/lib/snippet-tokens";
import { humanizeFillLabel } from "@/lib/email/serialize";
import { suggestVariable, type VariableSuggestion } from "@/lib/variable-detect";
import { tokenAt } from "@/components/editor/editor-token-chips";

type Bubble =
  | { mode: "convert"; left: number; top: number; from: number; to: number; suggestion: VariableSuggestion }
  | { mode: "token"; left: number; top: number; from: number; to: number; token: string };

type Option = {
  kind: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Token to insert, or null for "Custom fill-in…" which prompts for a name. */
  token: string | null;
};

const OPTIONS: Option[] = [
  { kind: "first_name", label: "First name", icon: CircleUserRound, token: "{{first_name}}" },
  { kind: "last_name", label: "Last name", icon: CircleUserRound, token: "{{last_name}}" },
  { kind: "name", label: "Full name", icon: CircleUserRound, token: "{{name}}" },
  { kind: "email", label: "Email", icon: MailIcon, token: "{{email}}" },
  { kind: "date", label: "Date", icon: CalendarIcon, token: "{{date}}" },
  { kind: "custom", label: "Custom fill-in field…", icon: Pencil, token: null },
];

function promptCustom(fallback: string): string | null {
  const name = window.prompt("Fill-in field name", fallback);
  const slug = name?.trim().toLowerCase().replace(/\s+/g, "_");
  return slug ? `{{${slug}}}` : null;
}

/** Floating menu over the snippet editor's selection: convert a text run into a
 *  token, or edit an existing `{{token}}` chip. Settings-modal only. */
export function SnippetTokenBubble({ editor }: { editor: Editor }) {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const menuOpenRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      if (menuOpenRef.current) return;
      if (!editor.isFocused) return setBubble(null);
      const box = document
        .querySelector('[data-slot="dialog-content"]')
        ?.getBoundingClientRect();
      const ox = box?.left ?? 0;
      const oy = box?.top ?? 0;
      const { from, to, empty } = editor.state.selection;

      const hit = tokenAt(editor.state.doc, from);
      if (hit && from >= hit.from && to <= hit.to) {
        const a = editor.view.coordsAtPos(hit.from);
        const b = editor.view.coordsAtPos(hit.to);
        return setBubble({
          mode: "token",
          left: (a.left + b.right) / 2 - ox,
          top: a.top - oy,
          from: hit.from,
          to: hit.to,
          token: hit.token,
        });
      }

      if (empty) return setBubble(null);
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return setBubble(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width < 1 && r.height < 1) return setBubble(null);
      const text = editor.state.doc.textBetween(from, to, " ").trim();
      if (!text) return setBubble(null);
      setBubble({
        mode: "convert",
        left: r.left + r.width / 2 - ox,
        top: r.top - oy,
        from,
        to,
        suggestion: suggestVariable(text),
      });
    };
    const clear = () => {
      if (!menuOpenRef.current) setBubble(null);
    };
    editor.on("selectionUpdate", sync);
    editor.on("blur", clear);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("blur", clear);
    };
  }, [editor]);

  if (!bubble) return null;

  const replace = (token: string | null, fallback: string) => {
    const t = token ?? promptCustom(fallback);
    if (!t) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: bubble.from, to: bubble.to }, t)
      .run();
    setBubble(null);
  };
  const onOpenChange = (open: boolean) => {
    menuOpenRef.current = open;
    if (!open) setBubble(null);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mousedown only guards the selection; the menu inside is the control.
    <div
      className="fixed z-[60] -translate-x-1/2 -translate-y-full"
      style={{ left: bubble.left, top: bubble.top - 10 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {bubble.mode === "convert" ? (
        <ConvertMenu
          suggestion={bubble.suggestion}
          onOpenChange={onOpenChange}
          onPick={(o) => replace(o.token, bubble.suggestion.slug)}
        />
      ) : (
        <TokenMenu
          token={bubble.token}
          onOpenChange={onOpenChange}
          onPick={(o) => replace(o.token, bubble.token)}
          onUnwrap={() => {
            editor
              .chain()
              .focus()
              .insertContentAt(
                { from: bubble.from, to: bubble.to },
                humanizeFillLabel(bubble.token),
              )
              .run();
            setBubble(null);
          }}
          onDelete={() => {
            editor
              .chain()
              .focus()
              .deleteRange({ from: bubble.from, to: bubble.to })
              .run();
            setBubble(null);
          }}
        />
      )}
    </div>
  );
}

function ConvertMenu({
  suggestion,
  onPick,
  onOpenChange,
}: {
  suggestion: VariableSuggestion;
  onPick: (o: Option) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const suggested =
    OPTIONS.find((o) => o.kind === suggestion.kind) ?? OPTIONS[OPTIONS.length - 1];
  const rest = OPTIONS.filter((o) => o !== suggested);
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-7 gap-1.5 shadow-xl" />}
      >
        <SparklesIcon className="text-primary" />
        Convert to variable
        <ChevronDownIcon className="text-muted-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuLabel>Suggested</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onPick(suggested)}>
          <suggested.icon />
          {suggested.label}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {rest.map((o) => (
          <DropdownMenuItem key={o.kind} onClick={() => onPick(o)}>
            <o.icon />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TokenMenu({
  token,
  onPick,
  onUnwrap,
  onDelete,
  onOpenChange,
}: {
  token: string;
  onPick: (o: Option) => void;
  onUnwrap: () => void;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const header = VARIABLE_KEYS.has(token)
    ? "Auto-fills from the recipient."
    : token === "date"
      ? "Inserts a date when the email is sent."
      : "Fill-in field you Tab through.";
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="h-7 gap-1.5 font-mono shadow-xl" />
        }
      >
        {`{{${token}}}`}
        <ChevronDownIcon className="text-muted-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuLabel className="font-normal normal-case">
          {header}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Change to</DropdownMenuLabel>
          {OPTIONS.map((o) => (
            <DropdownMenuItem key={o.kind} onClick={() => onPick(o)}>
              <o.icon />
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onUnwrap}>
          <Undo2 />
          Remove (keep as text)
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
