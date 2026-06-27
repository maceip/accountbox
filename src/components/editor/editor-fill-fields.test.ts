import { describe, expect, test } from "bun:test";
import {
  tokensToFieldHtml,
  tokenNode,
} from "@/components/editor/editor-fill-fields";

describe("snippet token transforms", () => {
  test("tokensToFieldHtml: every token → fill-field chip, cursor stays text", () => {
    const html = tokensToFieldHtml(
      "<p>Hi {{first_name}}, on {{date}}. {{topic}} {{cursor}}</p>",
    );
    expect(html).toContain('data-fill-field data-label="first_name"');
    expect(html).toContain('data-fill-field data-label="topic"');
    expect(html).toContain('data-fill-field data-label="date"');
    expect(html).toContain("{{cursor}}");
  });

  test("tokenNode maps a token to a fill-field node (cursor stays text)", () => {
    expect(tokenNode("first_name")).toEqual({
      type: "fillField",
      attrs: { label: "first_name" },
    });
    expect(tokenNode("date")).toEqual({
      type: "fillField",
      attrs: { label: "date" },
    });
    expect(tokenNode("cursor")).toBe("{{cursor}}");
  });
});
