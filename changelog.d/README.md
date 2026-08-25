# Changelog fragments

Every code PR adds one file here: `changelog.d/<branch-slug>.md`. The name is never parsed — it
only has to be unique, and a branch-derived name guarantees that.

Never edit `CHANGELOG.md`. It is generated: the release workflow collates these fragments into a
`## [X.Y.Z] – YYYY-MM-DD` section and deletes them in the same commit.

```markdown
---
bump: patch
---

### Fixed

- Sync no longer duplicates rows after a failed push.
```

- `bump` is `patch` (default if absent), `minor` or `major`. A release takes the highest bump across
  all pending fragments.
- Sections are the standard [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) set: `Added`,
  `Changed`, `Fixed`, `Removed`, `Security`. Same-named sections from different fragments merge into
  one, in merge order.
- Write in the terse, developer-facing voice of the existing entries — this is the internal
  development changelog.
- Add the `no-changelog` label to a PR that genuinely needs no entry.
