# Changelog

All notable changes to Sundew will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Release Automation

This file is generated — never edit it. Add a fragment in [`changelog.d/`](changelog.d/) instead.

On merge into `main`, `.github/workflows/auto-release.yml` collates every pending fragment into a new `## [X.Y.Z] – YYYY-MM-DD` section below the `## Full changelog history` marker, deletes the fragments in the same commit, then tags and publishes the release with the packed extension zip attached. The version bump is the highest `bump:` across those fragments.

## Full changelog history

## [1.2.5] – 2026-08-25

### Fixed

- Inter was bundled as the weight-100 file declared for all weights, rendering everything hairline; now ships proper 400/500/600/700 files.

## [1.2.4] – 2026-08-25

### Changed

- Wordmark back to red-on-yellow in the popup and options.

## [1.2.3] – 2026-08-25

### Changed

- Yellow-on-red wordmark in the popup and options; popup background is amber.
- Body font is Inter (bundled variable woff2 in the extension, Google Fonts on the picker page).

## [1.2.2] – 2026-08-25

### Changed

- Status messages on the options page are proper toasts (bottom-centre, auto-dismiss); Save and Sync now sit in their own card.

## [1.2.1] – 2026-08-25

### Fixed

- Sign out revokes the Google grant instead of only clearing the token cache, so it actually signs you out.

## [1.2.0] – 2026-08-25

### Changed

- Options and popup use the wordmark instead of icon-plus-text.
- Options page: amber background with white cards, headings inside cards.
- Signed-in state shows "Signed in" with a sign-out button instead of the sign-in button.
- Configured destination collapses to the linked sheet (opens it) plus a Change button revealing the full picker.
- Popup shows "Sync to: <sheet> [<tab>]" and "Last: <time>, <n> rows"; spreadsheet name now stored with config.
- Extension icons regenerated from re-exported tiles without background bleed.

## [1.1.1] – 2026-08-25

### Changed

- UI locked to the strict brand palette (red `#990B27`, amber `#F6A605`, white); dark-mode colour substitutions removed.

## [1.1.0] – 2026-08-25

### Added

- Brand assets (`assets/`), extension icon set (`icons/`), and manifest icons — no more grey placeholder in the toolbar.
- Shared `sundew.css`: Chrome-native styling (system font, Google greys, pill buttons, dark mode) with the red/amber brand as accent, applied to the popup, options, and picker pages.

### Changed

- Popup and options pages restyled with the Sundew brand header.
- Picker page carries the brand, a favicon, and dark-mode support.

## [1.0.1] – 2026-08-25

### Changed

- The popup's destination line links to the configured spreadsheet.

## [1.0.0] – 2026-08-25

### Added

- MV3 Chrome extension that pushes browsing history to a Google Sheet on a configurable interval (30/60/120 minutes) via `chrome.alarms`.
- Incremental sync: only visits since the last successful push, deduplicated by visit ID with a 5-minute overlap window; failed pushes queue locally and flush next run without duplication.
- Options page with per-device spreadsheet/tab/label config: dropdown of connected sheets, create-new-spreadsheet, create-new-tab, and **Browse Drive…** via a hosted Google Picker page.
- Google auth via `chrome.identity` with the non-sensitive `drive.file` scope — no Google app verification required.
- Static Picker page (`picker/`) deployed to Cloudflare Workers at `sundew-picker.harvey-1c7.workers.dev`.
