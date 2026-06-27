import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { CircleUserRound, MailIcon, Pencil, TextCursorIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { VARIABLE_KEYS } from "@/lib/snippet-tokens";
import { humanizeFillLabel } from "@/lib/email/serialize";

const PERSON = new Set(["first_name", "last_name", "name"]);

function iconFor(key: string) {
  if (key === "cursor") return TextCursorIcon;
  if (key === "email") return MailIcon;
  if (PERSON.has(key)) return CircleUserRound;
  return Pencil;
}

const VAR_TIP =
  "Needs manual entry. This normally auto-fills from the recipient's name — there isn't one yet, so add them to the To: line (and it fills itself) or type it here.";
const FIELD_TIP =
  "Needs manual entry before you can send. Type your value, then Tab to the next field.";

/** In-editor rendering of a fill-field chip. In the snippet editor it carries
 *  the field's icon; in the composer it matches the plain renderHTML span (used
 *  for serialization), so nothing about the composer changes. */
export function FillFieldChip({ node, editor }: NodeViewProps) {
  const label = String(node.attrs.label ?? "");
  const key = label.toLowerCase();
  const isVar = VARIABLE_KEYS.has(key);
  const isCursor = key === "cursor";
  const snippet = editor.view.dom.classList.contains("tiptap--snippet");
  const Icon = iconFor(key);
  return (
    <NodeViewWrapper
      as="span"
      data-fill-field=""
      data-tip={isCursor ? undefined : isVar ? VAR_TIP : FIELD_TIP}
      contentEditable={false}
      className={cn(
        "fill-field",
        isVar && "fill-field--var",
        isCursor && "fill-field--cursor",
      )}
    >
      {snippet && <Icon className="mr-0.5 inline size-[0.95em] align-[-0.15em]" />}
      {humanizeFillLabel(label)}
    </NodeViewWrapper>
  );
}
