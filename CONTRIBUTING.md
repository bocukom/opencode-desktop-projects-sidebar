# Contributing

## Setup

```sh
npm install
npm run typecheck
npm test
npm run build
```

`npm run build` produces the distributable `dist/gui-experimental.cjs`. `dist/` is ignored by git and rebuilt by `prepack`.

## Project layout

- `src/gui.tsx` — plugin definition, stores, layout integration.
- `src/adapter.ts` — the host-DOM adapter, Preferences card, mount lifecycle, failure fallback.
- `src/history-view.tsx` — project history, pagination, footer composition.
- `src/activity.ts`, `src/requests.ts` — activity and pending-request state.
- `src/sidebar-width.ts` — native width persistence.
- `src/style.css` — scoped plugin styles.
- `docs/compatibility.md` — compatibility and failure behavior.
- `docs/behavior.md` — detailed interaction contract.
- `test/` — unit tests, DOM fixtures, and isolated GUI suites.

Read `docs/compatibility.md` before changing selectors or lifecycle code. The adapter must fail open: a changed host must reveal Inbox rather than leave an empty sidebar.

## Testing

- `npm test` runs Node tests against DOM fixtures. It never opens sessions.
- `npm run build -- --mode footer-smoke` runs the isolated GUI suite in the running Desktop window. It uses mock data and does not navigate to real chats.
- `npm run build -- --mode compatibility-smoke` mounts the production setup read-only in one Desktop window and writes booleans and counts to `/tmp/opencode/psb-compatibility/result.json`.
- `npm run build -- --mode smoke` is diagnostic-only. It opens Preferences and existing sessions, so run it only when you accept that it temporarily changes the active view and tabs.

After any diagnostic build, always rebuild the ordinary bundle:

```sh
npm run build
```

Do not commit diagnostic bundles. The production build contains no automation or main-process hook.

## Release checklist

1. Update the version in `package.json` and add a `CHANGELOG.md` entry.
2. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
3. Check the published contents with `npm pack --dry-run`.
4. Install the packed tarball in a separate OpenCode configuration and verify install, enable, disable, and remove.
5. Log in to the official registry, because a local npm mirror is not a publishing target:

   ```sh
   npm login --registry=https://registry.npmjs.org
   ```

6. Publish the beta. `publishConfig` already selects the official registry; the explicit tag keeps `latest` untouched:

   ```sh
   npm publish --tag beta
   ```

7. Confirm `npm view opencode-desktop-projects-sidebar dist-tags` and install the published version once.

`latest` should only be moved after a beta has been tested on the supported Desktop versions.

## Commits and reports

- Write commit titles as `<type>(<scope>): <summary>`, for example `fix(sidebar): restore width after restart`.
- Describe the behavior being tested, not ticket numbers, in test names and comments.
- When reporting a problem, include the Desktop version, plugin version, OS, and reproduction steps. Do not attach prompts, transcripts, tokens, or screenshots with private project names.
