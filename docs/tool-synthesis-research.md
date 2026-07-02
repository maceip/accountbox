# Research: can the model write (and generate) its own app tools?

**Status:** research only — nothing implemented or scheduled. Written 2026-07-02.
**Question:** we hand-wrote the three Gmail tools. That doesn't scale to "every app people want." Can VibeThinker-3B be given the docs and write the API calls itself — or even generate whole tools on the fly?

---

## 1. Translating the question into three distinct capabilities

The literature splits "the model writes the tools" into three levels with very different difficulty and risk:

1. **Runtime code-as-action** — no fixed tools at all; the model writes executable code per request (fetch calls, logic) and we run it.
2. **Tool synthesis** — the model (or an offline agent) reads docs/specs/repos and *generates persistent tools once*, which are then verified, cached, and reused. Runtime stays "pick a tool + fill args."
3. **Skill libraries / self-improvement loops** — synthesized tools accumulate, get tested by use, refined or retired; the agent's capability grows over time.

Our current architecture is level 0 (hand-written tools) with exactly the right seam for level 2: the `AppSkill` interface (`src/lib/runtime/app-skill.ts`) + the whitelist-validated execute route. That is not an accident — the papers below converge on the same shape.

## 2. Reality check for our specific model

Honest constraint before the papers: our runtime model is a **3B, int4-quantized, reasoning-tuned** model in a browser. Today it scores **14/18 valid plans on a *fixed* 3-tool JSON schema** (browser gate). Generating *correct, safe, executable code* per request is strictly harder than filling a known schema — and the code-as-action papers see the biggest wins on GPT-4-class models ("gains most pronounced with more capable models" — CodeAct analysis across 17 LLMs). So the answer to "can the 3B write API calls live, on the fly?" is: **not credibly today, and it's also the wrong place to spend our error budget.** The answer to "can the *system* generate tools so we stop hand-writing them?" is: **yes — that's a solved-enough pattern** if generation happens out-of-band with verification, and the 3B keeps its proven job (tool *selection*).

## 3. The papers (grouped by what they teach us)

### A. Generate tools from docs/specs/repos (the direct answer to the question)

- **ToolMaker — "LLM Agents Making Agent Tools" (ACL 2025; arXiv:2502.11705).** Give it a GitHub URL + task description; it installs deps, writes the tool, and debugs itself in a closed loop against tests. 80% of benchmark tasks correctly implemented. *Lesson: repo/docs → tool is viable **with a self-correction loop and unit tests**, not single-shot generation.*
- **Alita (2025; arXiv:2505.20286).** "Minimal predefinition, maximal self-evolution": a generalist agent that brainstorms the tool it needs, searches for libraries, generates the tool, fixes its own environment errors, and **packages the result as an MCP server for reuse**. ~15% pass@1 gain on GAIA test from the MCP-creation component alone. *Lesson: MCP is the natural packaging format for generated tools; generation is agentic, not one prompt.*
- **SkillWeaver (2025; arXiv:2504.07079).** Web agents explore a site, propose skills, synthesize them as **Python APIs**, and hone them via unit-test-style practice. +31.8%/+39.8% success on WebArena/live sites. **The killer result for us: APIs synthesized by a *strong* agent boost *weaker* agents by up to 54.3%.** *Lesson: exactly our division of labor — a big model writes the tools once; the small on-device model consumes them.*
- **OpenAPI→MCP generator ecosystem (industry, 2024–2026: AutoMCP, Speakeasy/Gram, FastMCP, openapi-mcp-generator, Kubb).** For any service with an OpenAPI spec, tool generation is *mechanical*: operationId → tool name, params/body → input JSON schema, plus auth injection. The lossy parts are known (pagination, uploads, streaming). *Lesson: for spec'd APIs (Google APIs have Discovery docs!) we don't even need an LLM to draft the tool surface — an LLM only curates names/descriptions and writes the tricky glue.*

### B. Runtime tool synthesis (tools on the fly, mid-conversation)

- **CAR — Create And Replan (ACL Findings 2026).** Embeds a "meta-tool synthesizer" in the inference loop to fill toolset gaps just-in-time, plus global replanning; introduces the ToolHop-Pro scarcity benchmark. Built on frontier-class models. *Lesson: the on-the-fly version exists in the literature but assumes a model far stronger than ours in the loop; the meta-tool synthesizer could however run server-side/offline for us.*
- **CREATOR (2023), LATM — LLMs As Tool Makers (2023), Voyager (2023).** The founding trio of tool creation via code synthesis + persistent skill libraries. *Lesson: historical grounding; Voyager's "skill library with retrieval" is the pattern SkillWeaver matured.*
- **CodeAct — Executable Code Actions (ICML 2024; arXiv:2402.01030).** Replaces JSON tool calls with a Python action space + interpreter; up to +20% success, *but* gains concentrate in strong models, and it requires a sandbox. *Lesson: a possible far-future runtime for a bigger on-device model; not for a 3B int4 today.*

### C. Keeping generated tools honest (our fail-closed religion, in the literature)

- **TroVE (ICML 2024).** Induces toolboxes that are **verifiable by construction**: grow by use, keep functions with high execution agreement, periodically trim. 79–98% smaller toolboxes, faster *human verification*. *Lesson: generated tools earn their place through measured utility — a gate, like ours, but for tools.*
- **SkillSmith / SkillMaster / EvoSkill etc. (2026 wave).** RL-driven co-evolution of skills and tools from execution traces; skills as a "non-parametric, versionable, governable external policy layer." *Lesson: where this field is going; our AppSkill objects are exactly such a governable layer.*

### D. Making a small on-device model reliable at the runtime half

- **Octopus (NAACL 2025 industry; arXiv:2404.01549).** Fine-tuned 2B/3B models on 30k API-call examples **beat GPT-4 at API calling**, using **conditional masking** (constrained decoding) to enforce output format. *Lesson: our size class is provably sufficient for tool CALLING — and conditional masking is the same mechanism that would fix our remaining 4/18 int4 failures.*
- **TinyAgent (EMNLP 2024 demo).** 1.1B/7B function-calling agents fully at the edge; **ToolRAG** retrieves only the relevant tools into the prompt to keep it small. *Lesson: when generated tools multiply (N apps × M tools), we retrieve the few relevant ones per request instead of stuffing the system prompt — this is how the AppSkill seam scales past a handful of apps.*

## 4. What this means for our architecture (synthesis, not a plan)

The literature's answer to "how do we stop hand-writing tools without betting the product on 3B codegen":

```
GENERATION TIME (offline / server-side; strong model or mechanical generator)
  API docs / OpenAPI / Discovery spec / repo
    → draft tools (mechanical where spec'd; ToolMaker/Alita-style agent where not)
    → self-correction loop against real sandboxed calls (dry-run, test account)
    → utility/verification gate (TroVE-style) + human approval
    → emits: AppSkill config + tool executors + training examples for the adapter
RUNTIME (browser, VibeThinker-3B int4 — unchanged job)
  user prompt → pick tool + args within the skill's whitelist (JSON plan)
    → fail-closed validation (ours, today) → execute route
```

Key consequences:
- **The 3B never writes code at runtime.** It keeps the job it's measurably good at. This also closes the scariest security hole (prompt-injected mail convincing the model to synthesize an exfiltration call — with a closed whitelist that call *cannot exist*).
- **Per-app cost collapses** from "hand-write everything" to "run the generator, review its output, train/extend an adapter." The hand-written Gmail tools become the *reference output* the generator must match, not the pattern to repeat manually.
- **SkillWeaver's transfer result is our business case:** strong-model-synthesized skills demonstrably lift weak agents. Generation can even be a cloud step while inference stays 100% local — privacy story intact (docs are public; user data never leaves).
- **MCP compatibility** (Alita, industry generators) is worth adopting as the packaging for generated tools, so third-party MCP servers become future skill sources for free.
- **Octopus-style conditional masking** should be on the runtime roadmap regardless — it likely turns 14/18 into ~18/18 by making invalid JSON *impossible to emit*, and it's the same machinery a generated-tool schema would plug into.

## 5. Open questions before any of this is built

1. Where does the generation agent run, and on which model? (It needs shell/sandbox + a strong LLM; that's a server-side workload — acceptable since no user data is involved?)
2. Verification bar for a generated tool: what's the equivalent of our 18-prompt gate per new app? (TroVE suggests: execution agreement on synthetic tasks + human sign-off.)
3. Adapter strategy per skill: one shared adapter vs per-app LoRAs hot-swapped (emberglass already supports hot-swap — "adapters hot-swap live").
4. Tool count scaling: at what N do we need ToolRAG-style retrieval instead of everything-in-prompt?
5. Auth/permissions per generated tool: the execute route's whitelist is per-skill; who signs off on scopes (e.g., a generated "delete_message" must be rejectable by policy, like our draft-only rule)?

## 6. Quick-reference paper list

| Paper | Year/Venue | One-line relevance |
|---|---|---|
| ToolMaker (arXiv:2502.11705) | ACL 2025 | repo+docs → working tool with self-correcting loop (80% success) |
| Alita (arXiv:2505.20286) | 2025 | self-generates tools, packages as MCP servers, self-reinforcing |
| SkillWeaver (arXiv:2504.07079) | 2025 | synthesizes site skills as APIs; strong→weak agent transfer +54% |
| CAR + ToolHop-Pro | ACL Findings 2026 | just-in-time tool synthesis inside the inference loop |
| CodeAct (arXiv:2402.01030) | ICML 2024 | code as unified action space; needs strong model + sandbox |
| TroVE | ICML 2024 | verifiable toolbox induction; utility-gated grow/trim |
| Octopus (arXiv:2404.01549) | NAACL 2025 | 2–3B fine-tunes beat GPT-4 at API calls; conditional masking |
| TinyAgent (arXiv:2409.00608) | EMNLP 2024 | edge function calling; ToolRAG for prompt-scale |
| SkillSmith / SkillMaster / EvoSkill | 2026 | skill+tool co-evolution as a governable policy layer |
| CREATOR / LATM / Voyager | 2023 | founding work on tool creation + skill libraries |
| OpenAPI→MCP generators (AutoMCP, Speakeasy, FastMCP, Kubb) | 2024–26 industry | mechanical spec→tool conversion incl. auth injection |
