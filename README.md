<div align="center">

<img src="public/favicon.svg" width="72" height="72" alt="BetterBox logo" />

# BetterBox

**All your inboxes. One tab.**

A different interface for the Gmail accounts you already have. Built on the Gmail API, not another email service. Your mail stays in Google.

[Website](https://betterbox.dev) · [Live demo](https://betterbox.dev) · [Privacy](https://betterbox.dev/privacy) · [Contributing](.github/CONTRIBUTING.md)

</div>

---

[![Two Gmail inboxes side by side in one BetterBox tab](.github/assets/demo-poster.jpg)](https://betterbox.dev)

> [!WARNING]
> **Mega-alpha.** BetterBox is in active development and moves fast. Expect rough edges and the occasional `Soon` badge. Self-host works today, straight from source; the hosted plan is behind a [waitlist](https://betterbox.dev) while I gauge demand.

Your mail already lives in Gmail. BetterBox does not move it, migrate it, or store it. It puts the things you check all day in one place: your inboxes, your GitHub pull requests, and (soon) your Linear issues, without the tab-switching. Think tiling window manager for your inboxes.

## Quick start

You'll need [Bun](https://bun.sh), a PostgreSQL database, and a Google Cloud OAuth app.

```bash
git clone https://github.com/aidankmcalister/betterbox.git
cd betterbox
bun install
```

```bash
cp .env.example .env
```

Fill in the required values. See the comments in the file for what each variable does.

In the Google Cloud console: enable the Gmail API, add the `gmail.modify` scope, and set the redirect URI to `http://localhost:3000/api/auth/callback/google`.

```bash
bun run db:push   # set up the database
bun run dev       # http://localhost:3000
```

Then open `http://localhost:3000`. In self-host mode (the default above) `/` redirects straight to `/sign-in`, where you sign in with Google. To control who can get in, set `ALLOWED_EMAILS` to a comma-separated list of addresses; only those can create an account (leave it empty to allow anyone).

That's it. Want the owner-only tools (seeded test accounts + demo mode)? Run `bun run set-owner you@example.com`.

## Features

- **Every inbox, one screen.** Link multiple Gmail accounts and arrange them as panes you drag, split, and resize. Colored dots keep accounts apart; composed views merge them.
- **Read fast.** A movable reading pane renders the full thread with inline reply. HTML email renders in a sandboxed iframe: remote images are proxied and every other remote subresource (stylesheets, fonts, media, CSS url()) is stripped, so trackers never see your IP. Raw MIME is one keystroke away.
- **Command palette.** Compose, switch accounts, search, export, and open settings from one menu (⌘K).
- **Pull requests.** Link GitHub and see your open PRs, review requests, CI status, and approvals in a dense live list.
- **Issues.** Link Linear and see assigned issues alongside your inbox. (Coming soon.)
- **Tags are Gmail labels.** Create, apply, rename, recolor, and delete labels. The Labeled view groups mail per tag. BetterBox stores nothing about them.
- **Private by design.** Mail is fetched live and held only in your browser. OAuth tokens are encrypted at rest. No analytics, no mail stored server-side.
- **Open source.** Full source on GitHub. MIT licensed. Audit every line, fork it, self-host it free.

## Tech stack

| Layer     | Choice                                                                                    |
| --------- | ----------------------------------------------------------------------------------------- |
| Framework | [TanStack Start](https://tanstack.com/start) (React 19, SSR)                              |
| Styling   | Tailwind CSS v4 + shadcn/ui (on [Base UI](https://base-ui.com))                           |
| Auth      | [Better Auth](https://better-auth.com): Google + GitHub, multi-account, encrypted tokens  |
| Database  | PostgreSQL via [Prisma](https://prisma.io) 7 (`@prisma/adapter-pg`)                       |
| Runtime   | [Bun](https://bun.sh) · deployed with Nitro                                               |
| Tooling   | Prettier (format), Biome (lint), `bun test`                                               |

## Scripts

| Command             | Does                                |
| ------------------- | ----------------------------------- |
| `bun run dev`       | Dev server on port 3000             |
| `bun run build`     | Production build                    |
| `bun run typecheck` | TypeScript checks                   |
| `bun run format`    | Prettier (write)                    |
| `bun run lint`      | Biome lint                          |
| `bun run db:push`   | Push the schema without a migration |
| `bun run db:studio` | Open Prisma Studio                  |
| `bun run set-owner` | Grant the `OWNER` role to an email  |

## Setup

### Google / Gmail (required)

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project (or use an existing one).
3. Enable the **Gmail API** under APIs and Services.
4. Go to **OAuth consent screen**:
   - User type: External
   - Add the `gmail.modify` scope
   - Add your email as a test user
   - Publishing status: keep as Testing (avoids CASA requirement)
5. Go to **Credentials** and create an **OAuth 2.0 Client ID**:
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
     (add your production URL too when deploying)
6. Copy the Client ID and Secret into your `.env`:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

> Keeping the app in Testing mode limits you to 100 test users
> but avoids Google's annual CASA security assessment (~$750/yr).
> Add test users in the OAuth consent screen.

---

### GitHub integration (optional)

Enables the Pull requests page. Shows open PRs, review requests, and CI status pulled live from the GitHub API.

1. Go to [GitHub Developer Settings](https://github.com/settings/developers).
2. Click **New OAuth App**.
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `http://localhost:3000/api/auth/callback/github`
3. Copy the Client ID and generate a Client Secret.
4. Add to your `.env`:

```dotenv
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

5. Restart the dev server. A **Connect GitHub** option will appear in Settings. Once connected, the PRs page goes live.

Scopes requested: `read:user`, `repo` (for private repo PRs). Use `public_repo` instead of `repo` if you only need public repos.

---

### Linear integration (coming soon)

Enables the Issues page. Will show assigned issues, comments, and status changes pulled live from the Linear API.

Setup instructions will be added when Linear support ships. To follow progress, watch the repo or join the [hosted waitlist](https://betterbox.dev).

## Self-host or hosted

Self-host is free and open source. Bring your own Google OAuth app, run it on your own infra, and connect each integration with your own credentials. No data leaves your machine, and nothing is gated: clone the repo and go.

The example `.env` ships with `IS_SELF_HOSTED=true`, which drops the marketing layer: `/` redirects to `/sign-in`, and the landing page, waitlist, and hosted pricing are disabled. Unset it to run the hosted layout locally.

Hosted ($5/mo) is the same code, run and updated by us, for people who would rather not manage it. It is waitlisted while I gauge demand: Google charges about $750/yr for the security assessment that third-party Gmail apps need, and I want enough interest to justify it first.

[Join the hosted waitlist →](https://betterbox.dev)

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING](.github/CONTRIBUTING.md). The short version: `bun install`, `bun run dev`, and run `bun run typecheck` + `bun run format` before pushing.

---

<div align="center">

Built by [Aidan McAlister](https://github.com/aidankmcalister). Not affiliated with Google or Gmail.

</div>
