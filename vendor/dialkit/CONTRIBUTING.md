# Contributing to DialKit

Thanks for contributing.

## Development setup

1. Fork and clone the repo.
2. Install dependencies with `npm i`.
3. Run `npm run typecheck` and `npm run build` before opening a PR.

## Project notes

- `src/styles/theme.css` is copied to `dist/styles.css` during build via `tsup` `onSuccess`.
- `example/photostack` imports `dialkit/styles.css`, which resolves to `dist/styles.css`.
- `ButtonGroup` actions should remain vertically stacked.

## Pull request guidelines

- Keep PRs single-responsibility and small.
- Include a short summary of what changed and why.
- Add validation notes (for example: `npm run typecheck`, `npm run build`).
- Update `README.md` when behavior or API docs change.
