/**
 * Pure SFT dataset parsing — no engine or browser deps, unit-testable.
 * The dataset files are the real bbtriage JSONL splits served same-origin.
 */

export interface ChatMessage {
  role: string;
  content: string;
}

export interface SftExample {
  messages: ChatMessage[];
}

/** Parse a JSONL text into examples. Malformed or too-short lines are
 *  skipped, never repaired — counts surface in the UI. */
export function parseJsonlExamples(text: string): SftExample[] {
  const out: SftExample[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as SftExample;
      if (Array.isArray(obj?.messages) && obj.messages.length >= 2)
        out.push(obj);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}
