# AccountBox

**Local account skills. One console.**

AccountBox is a local-first browser app for connected accounts. You unlock a
browser vault, run local WebGPU models, equip account skills, and connect the
accounts those skills can act on.

The first real skill is Gmail. The current product still includes the working
Gmail client: connect accounts, list mail, read threads, labels, compose,
draft autosave, save drafts, sent/drafts views, and the mail-board navigation.
The agent path is narrower by design: Gmail skill plans may only call
`search_messages`, `read_message`, and `create_draft`. It never sends mail.

## Current Shape

- **Console, not mail-only app.** AccountBox is the console; skills are
  cartridges. Gmail is the first cartridge. GitHub is the second-cartridge
  pressure test, but a trained GitHub skill is not on `main` yet.
- **Vault first.** The vault master password is the app gate. Google/Gmail is a
  connected source after unlock, not the product login.
- **Local models.** Plain chat uses Qwen2.5-3B-Instruct. Skill planning uses
  VibeThinker-3B plus a LoRA adapter through Emberglass/WebGPU.
- **Fail closed.** Unequipped, invalid, or non-inference plans are tagged
  `__cold` and refused by execution.
- **No fake proof.** Target replay, synthetic mailboxes, fake trained states,
  and no-op training do not count as product progress.

## Privacy Boundary

- Mail is fetched live from provider APIs. Mail bodies, snippets, subjects, and
  grounded prompts must not be written to durable app storage.
- Better Auth owns local sessions and linked provider account rows. OAuth
  tokens on `Account` are encrypted at rest with `BETTER_AUTH_SECRET`.
- Browser-owned product state lives locally: vault envelope in OPFS, settings
  and layout in localStorage, agent traces in OPFS, and adapter files/manifests
  in browser or served local app storage.
- Agent traces are local-only, record only real weight-driven plans, and refuse
  `__cold` plans. They leave the device only through an explicit user export.
- Existing user-authored composer snippets/signatures are server rows today.
  Treat them as a narrow current exception, not a precedent for storing mail or
  agent state on the server.

## What Works Now

- Vault create/unlock plus local Better Auth session.
- First-run journey: start local chat model, equip/test the Gmail skill, then
  connect Gmail.
- Working Gmail client UI.
- Generic `AppSkill` runtime seam:
  - `src/lib/runtime/agent-runtime.ts`
  - `src/lib/runtime/app-skill.ts`
  - `src/lib/runtime/skill-runtimes.ts`
  - `src/lib/skills/gmail/skill.ts`
- Generic fail-closed execution route:
  - client: `src/lib/agent/execute-plan.ts`
  - route: `src/routes/api/agent-execute.ts`
  - Gmail executor: `src/lib/skills/gmail/execute.server.ts`
- Train/dev deploy support for DialKit layout tuners and agent notes.

## Local Setup

You'll need [Bun](https://bun.sh), a Google OAuth app for Gmail, and local
model/adapter assets if you want the WebGPU skill path.

```bash
git clone https://github.com/maceip/accountbox.git
cd accountbox
bun install
cp .env.example .env
```

For local dev, a SQLite main database is enough:

```bash
DATABASE_URL=file:./dev.db
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-generated-secret
IS_SELF_HOSTED=true
```

Google/Gmail:

1. Enable the Gmail API in Google Cloud.
2. Add the `gmail.modify` and `gmail.settings.basic` scopes.
3. Create a web OAuth client with callback
   `http://localhost:3000/api/auth/callback/google`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

Then initialize and run:

```bash
bun run db:push
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Model Assets

The real model path expects same-origin assets:

- `/model` -> VibeThinker/Qwen-shape base weights for skill planning.
- `/model-chat` -> Qwen2.5-3B-Instruct weights for plain chat.
- `/adapters/gmail-agent` -> `adapter_config.json`, `.safetensors`, and
  optional adapter manifest for the Gmail skill.

The repo currently uses local links in development:

- `model -> /Users/mac/emberglass/model`
- `model-chat -> /Users/mac/models/qwen2.5-3b-instruct`
- `public/adapters/gmail-agent/`

If those assets are absent, the UI must report cold/unsupported/error states.
Do not replace them with fake loaded state.

## Commands

| Command                                | What it does                                                  |
| -------------------------------------- | ------------------------------------------------------------- |
| `bun run dev`                          | Dev server on port 3000                                       |
| `bun run typecheck`                    | Strict TypeScript checks                                      |
| `bun run build`                        | Production build                                              |
| `bun test`                             | Unit tests                                                    |
| `bun run train:gmail`                  | Generate Gmail SFT data and run the external fine-tune script |
| `bun run prove:real-gmail`             | Static/server-side proof checks for the real Gmail path       |
| `bun run smoke:production`             | Production smoke check                                        |
| `bun run smoke:train-dev`              | Train/dev smoke check with DialKit markers                    |
| `bun run harness:train-dialkit-note`   | Playwright check for DialKit agent notes                      |
| `bun run harness:train-dialkit-tuners` | Playwright check for DialKit layout tuners                    |
| `bun run capture:train-screenshots`    | Save train deploy screenshots                                 |
| `bun run set-owner <email>`            | Grant owner role                                              |
| `bun run encrypt-tokens`               | Backfill plaintext OAuth tokens into encrypted rows           |

## Active References

- `PROJECT.md` - plan, product shape, current state, invariants, and gates.
- `AGENTS.md` - repo rules and gotchas.
- `docs/for-july.md` - latest train/DialKit deployment inventory and fix list.
- `docs/two-cartridge-concept.md` - design note for the cartridge pivot.

## License

AccountBox is open source under the [MIT license](LICENSE).
