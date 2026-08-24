# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Add unreleased changes here._

## Full changelog history

## [1.0.0] - 2026-08-25

### Added

- MV3 Chrome extension that pushes browsing history to a Google Sheet
  on a configurable interval (30/60/120 minutes) via `chrome.alarms`.
- Incremental sync: only visits since the last successful push,
  deduplicated by visit ID with a 5-minute overlap window; failed
  pushes queue locally and flush next run without duplication.
- Options page with per-device spreadsheet/tab/label config: dropdown
  of connected sheets, create-new-spreadsheet, create-new-tab, and
  **Browse Drive…** via a hosted Google Picker page.
- Google auth via `chrome.identity` with the non-sensitive
  `drive.file` scope — no Google app verification required.
- Static Picker page (`picker/`) deployed to Cloudflare Workers at
  `sundew-picker.harvey-1c7.workers.dev`.
