# product-plan.md

Read this when context is gone. Do not expand it. Execute it.

## Target

- Product: local browser app for connected accounts/apps.
- First account/app target: Gmail.
- Gmail target includes three things:
  1. Gmail API operations.
  2. AccountBox's existing Gmail client DOM.
  3. Real `mail.google.com` DOM/action patterns.
- User flow: vault unlock -> local Better Auth session -> existing Gmail client
  still works -> train/equip Gmail agent -> chat routes Gmail tasks to that
  agent -> live Gmail search/read/draft.

## Fixed Decisions

- KEEP Better Auth.
- Keep Better Auth session tables in localhost SQLite for this phase.
- Better Auth is only local session state created from vault unlock.
- Better Auth does not store vault data, provider tokens, Gmail target state,
  adapter files, or mail data.
- Google/Gmail is not app login.
- Durable product state goes in browser storage.
- Use OPFS SQLite for product records.
- Use OPFS files or IndexedDB for adapter blobs, whichever the WebGPU runtime
  can load reliably.
- Server routes are allowed only as stateless helpers. Definition: a helper
  receives a request, calls an external API, returns a response, and does not
  save product records. Server routes must not save vault, provider tokens,
  Gmail target state, adapter state, or mail data.
- If a Gmail API call must run through a server route, the browser sends the
  needed access token with that request after vault unlock. The route uses it
  for that one Gmail API call and does not save it.
- First Gmail write is `create_draft` only. Do not send.

## Do Not Break Gmail Client

The upstream Gmail client already works. Every change must preserve:

- connect Gmail
- list inbox/mail
- open/read threads
- labels
- compose
- draft autosave
- save draft
- sent/drafts views already supported by the app
- existing mail-board navigation

Before changing Gmail auth/storage/chat/model code, know how to run the current
Gmail client. After changing it, run the same path again. Do not land a step
that breaks the current Gmail client.

## Never Fake

- no fake Gmail account
- no synthetic mailbox
- no fake model load
- no no-op training
- no hardcoded trained/loaded state
- no generic chat pretending to be Gmail agent
- no fake OPFS persistence
- no fake draft creation
- no persisted private mail

## Do Not Add Scope

- no peer-to-peer
- no sync service
- no sharing/multi-device vault
- no cloud backend
- no hosted account system
- no native helper
- no mobile work
- no extension work
- no new provider before Gmail works
- no autonomous `mail.google.com` clicking/submission

## Keep These Files Working

- `src/routes/_app.tsx`: shell, settings, mail board, chat mount.
- `src/components/mail/*`: Gmail client UI.
- `src/components/editor/*`: composer.
- `src/lib/gmail/api.server.ts`: Gmail API functions. Keep full client support;
  do not reduce this to agent-only helpers.
- `src/lib/draft-buffer.ts`: existing IndexedDB draft fallback. Do not change
  its DB/version unless intentionally migrating it.
- `src/components/settings/pages/accounts.tsx`: Gmail connect/settings UI and
  future Gmail agent state UI.
- `src/components/chat/local-chat.tsx`: chat UI; replace request handling, not
  the visible chat surface.
- `src/components/vault/vault-gate.tsx`: first-run/unlock UI.
- `src/lib/auth/auth.ts` and `src/lib/auth/auth-client.ts`: Better Auth stays,
  local-only and vault-backed.

## Move These Records To Browser Storage

Move these out of Prisma/server-owned storage:

- vault envelope currently handled by `src/routes/api/vault.ts`
- provider config/tokens currently handled by `src/lib/connections/google.server.ts`
- connected Gmail account metadata currently handled by server connection code
- Gmail target/agent state
- adapter refs/artifacts
- model settings

Do not move Better Auth session metadata in this phase. Keep local Better Auth
session metadata in localhost SQLite.

Do not store these anywhere durable:

- mail bodies
- snippets
- subjects
- grounded prompts
- private training traces by default

## Browser Storage Implementation

Use OPFS SQLite. Inspect these repos for the proven pattern, then copy only the
minimum code needed to open DB, run migrations, query, and prove reload
persistence inside this repo:

- `https://github.com/maceip/www-terminal`
- `https://github.com/maceip/agent-browser`

Required product records:

- `vault_envelope`
- `provider_config`
- `connected_account`
- `gmail_target`
- `gmail_agent_state`
- `adapter_ref`
- `model_config`

Adapter blobs: store as OPFS files or IndexedDB blobs. Pick the one that the
WebGPU loader can read without copying giant buffers unnecessarily.

## Runtime Implementation

Use these source files as references:

- `/Users/mac/emberglass/src/services/training_controller.js`
  - real AdamW LoRA training
- `/Users/mac/emberglass/src/services/adapter_registry.js`
  - adapter hot-swap
- `/Users/mac/emberglass/src/emberglass_bridge.js`
  - model load/inference bridge
- `/Users/mac/qwen-webgpu-lora`
  - WebGPU/LoRA architecture and action planning
- `/Users/mac/edge-thinker`
  - WebGPU runtime reference

Create one AccountBox runtime wrapper. React components call this wrapper only.
If `emberglass_bridge.js` lacks training methods, add wrapper support around
`TrainingController` before claiming Gmail training works.

Wrapper must expose:

- load base model
- create/train Gmail adapter
- equip adapter
- generate with equipped adapter
- report status/error/progress
- dispose runtime

## Gmail Training Data

Build Gmail training examples from:

- Gmail API operations used by this app
- AccountBox Gmail client DOM/action structure
- real `mail.google.com` DOM/action structure
- canonical search/read/draft tasks
- parser-valid JSON/tool-plan outputs

Do not use private mailbox contents as durable training data by default.
Use captured/static `mail.google.com` DOM/action examples for training data in
this phase. Execution still starts with Gmail API tools and AccountBox UI state.

## Chat/Gmail Agent

Replace `/api/chat` generic behavior with this flow:

1. Chat reads local Gmail agent state.
2. If Gmail is not connected, say "Connect Gmail first."
3. If model is not loaded, say "Load local model first."
4. If Gmail adapter is not trained/equipped, say "Train Gmail agent first."
5. If loaded, send prompt to Gmail agent.
6. Parse agent output as a bounded plan/tool call.
7. Verify tool name and args.
8. Execute only:
   - `search_messages`
   - `read_message`
   - `create_draft`
9. Return result to chat.

No `send_message`.

## Build Order

1. Add OPFS SQLite DB wrapper.
2. Prove one record persists after reload in browser.
3. Move vault envelope from `/api/vault` to OPFS SQLite.
4. Keep Better Auth local-only; vault unlock creates/satisfies Better Auth
   session.
5. Confirm shell and chat open after vault unlock with no Google.
6. Move Google provider config/tokens to encrypted OPFS SQLite records.
7. Confirm existing Gmail client still does connect/list/read/compose/draft.
8. Add `gmail_target` and `gmail_agent_state` records.
9. Add AccountBox WebGPU runtime wrapper.
10. Load real base model in browser.
11. Build Gmail API + AccountBox DOM + `mail.google.com` DOM training examples.
12. Train/equip real Gmail LoRA adapter with AdamW.
13. Persist adapter ref/blob and reload/equip after refresh.
14. Route chat to Gmail agent only when Gmail agent state is `loaded`.
15. Implement verified Gmail tools.
16. Create real Gmail draft. Do not send.

## Stop And Report

Stop instead of improvising if:

- existing Gmail client breaks
- OPFS DB does not persist across reload
- WebGPU model weights do not load
- AdamW LoRA training does not run
- adapter cannot be reloaded/equipped after refresh
- Gmail OAuth cannot return usable tokens
- implementation would persist private mail
- implementation would need fake data or fake success

## Done

Done means this exact local flow works:

vault unlock -> local Better Auth session -> existing Gmail client still works ->
real WebGPU model loads -> real AdamW LoRA Gmail adapter trains/equips from
Gmail API + AccountBox Gmail DOM + `mail.google.com` DOM/action examples -> chat
routes Gmail request to loaded Gmail agent -> live Gmail search/read -> real
Gmail draft created -> no email sent.
