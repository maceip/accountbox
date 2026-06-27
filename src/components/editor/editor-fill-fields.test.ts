import { describe, expect, test } from "bun:test";
import {
  tokensToFieldHtml,
  tokenNode,
} from "@/components/editor/editor-fill-fields";

describe("snippet token transforms", () => {
  test("tokensToFieldHtml: date → date-field, everything else (incl. cursor) → fill-field", () => {
    const html = tokensToFieldHtml(
      "<p>Hi {{first_name}}, on {{date}}. {{topic}} {{cursor}}</p>",
    );
    expect(html).toContain('data-fill-field data-label="first_name"');
    expect(html).toContain('data-fill-field data-label="topic"');
    expect(html).toContain('data-fill-field data-label="cursor"');
    expect(html).toContain("data-date-field");
  });

  test("tokenNode: date → date picker, everything else (incl. cursor) → fill-field", () => {
    expect(tokenNode("first_name")).toEqual({
      type: "fillField",
      attrs: { label: "first_name" },
    });
    expect(tokenNode("date")).toEqual({
      type: "dateField",
      attrs: { value: "" },
    });
    expect(tokenNode("cursor")).toEqual({
      type: "fillField",
      attrs: { label: "cursor" },
    });
  });
});
