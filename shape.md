# shape.md - product shape memory

Use `product-plan.md` for execution. This file only records the product shape.

## Product

BetterBox is a local browser app for connected accounts/apps.

Gmail is the first account/app target. Gmail target means:

1. Gmail API operations.
2. BetterBox's existing Gmail client DOM.
3. Real `mail.google.com` DOM/action patterns.

The upstream app already works as a full Gmail client. Keep it working:

- connect Gmail
- list mail
- read threads
- labels
- compose
- draft autosave
- save drafts
- existing mail-board navigation

## Auth

Keep Better Auth.

Better Auth is local-only session state created from vault unlock. Better Auth
session tables stay in localhost SQLite for this phase.

Better Auth does not store vault data, provider tokens, Gmail target state,
adapter files, or mail data.

Google/Gmail is a connected account/app target, not app login.

## Storage

Use browser-owned storage for product records:

- OPFS SQLite for vault envelope, encrypted provider config/tokens, connected
  account metadata, Gmail target state, Gmail agent state, adapter references,
  and model settings.
- OPFS files or IndexedDB for adapter blobs.
- memory only for decrypted vault key/payload and live mail contents.

Never persist:

- mail bodies
- snippets
- subjects
- grounded prompts
- private training traces by default

Server routes can exist only as stateless helpers: request in, external API call
out, response back, no saved product records.

If a Gmail API call uses a server route, the browser sends the access token for
that one request after vault unlock. The route does not save the token.

## Gmail Agent

The Gmail agent must be real WebGPU LoRA fine-tuning with AdamW.

Training data comes from:

- Gmail API operations used by this app.
- BetterBox Gmail client DOM/action structure.
- Real `mail.google.com` DOM/action structure.
- Canonical search/read/draft tasks.
- Parser-valid JSON/tool-plan outputs.

No no-op training hook. No hardcoded trained state. No generic chat pretending
to be the Gmail agent.

## Chat And Tools

Chat routes Gmail requests only when Gmail agent state is `loaded`.

Allowed Gmail tools first:

- `search_messages`
- `read_message`
- `create_draft`

No `send_message`. No delete/archive/autonomous mutation.

Do not add peer-to-peer, sync, sharing, cloud backend, hosted accounts, native
helper, mobile, extension, new providers, or autonomous `mail.google.com`
clicking/submission before Gmail works.

## Do Not Lose

- Do not remove Better Auth.
- Do not break the working Gmail client.
- Do not store product records in Prisma/server DB.
- Do not persist private mail.
- Do not fake model load, training, OPFS persistence, Gmail data, or draft
  creation.
