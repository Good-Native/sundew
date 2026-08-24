# CLAUDE.md

Last reviewed: 2026-08-25

Project operating guide for Claude Code in this repository.

## Hard requirements

- Use Australian English in code comments, commit messages, user-facing text,
  and generated docs.
- Preserve existing behaviour unless explicitly asked to change it.
- Ask for explicit confirmation before destructive steps (force pushes,
  history rewrites, secret/config changes).
- Never commit `key.pem`, OAuth client secrets, or API keys with broader
  scope than the referrer-restricted Picker key in `picker/index.html`.
- Keep edits scoped and incremental.

## Technical baseline

- Vanilla JavaScript, Chrome Manifest V3. No build step, no bundler, no
  dependencies — files load as written.
- `background.js` is a service worker; `sheets.js` is shared with the
  options page via `importScripts` / `<script>` (no ES modules).
- Google APIs: Sheets v4 + Drive v3 under the `drive.file` scope only.
  Widening scope reintroduces Google app verification — don't.
- Picker page (`picker/index.html`) is a standalone static page deployed
  to Cloudflare Workers (`wrangler.jsonc`, name `sundew-picker`). It is
  the only place remote scripts are allowed; MV3 CSP forbids them in
  extension pages.

## Workflow

- Every PR to `main` must add an entry under `## [Unreleased]` in
  CHANGELOG.md (`[Unreleased:minor]` / `[Unreleased:major]` to control
  the bump). CI enforces this; `no-release` label skips the release.
- Merges to `main` auto-release: version bump in `manifest.json`, tag,
  GitHub release with a packed extension zip attached.
- `picker/` or `wrangler.jsonc` changes on `main` auto-deploy to
  Cloudflare via `deploy-picker.yml`.
- Test locally by loading the repo root as an unpacked extension and
  using **Sync now** in the popup/options; there is no test suite.

## Commit style

- 5–6 words maximum, imperative, no AI attribution or footers.
