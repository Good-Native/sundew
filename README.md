<img src="assets/sundew-main.svg" alt="Sundew" height="48">

Chrome extension that pushes browsing history to a Google Sheet on a schedule (default hourly). Several machines on the same Chrome profile share one destination and each stamps its own device label, so one sheet holds the lot with a column to tell them apart.

## The name

Sundews (_Drosera_) are Australian native carnivorous plants that passively and continuously capture whatever lands on them — no chasing, no effort, just quiet accumulation. That's this app: it sits in the background and captures your browsing trail as it happens, rather than requiring a manual export.

Follows the Good Native convention of Australian native flora/fauna with a functional nod — alongside [mopoke](https://github.com/Good-Native/mopoke) (the owl that watches DNS), [currawong](https://github.com/Good-Native/currawong) (GTM sync), [paperbark](https://github.com/Good-Native/paperbark) (log capture), and [hover](https://github.com/Good-Native/hover) (link checking).

## Brand

Colours: red `#990B27`, amber `#F6A605`, dark `#280407`. Source assets (wordmarks, lockup, icon tiles) live in [`assets/`](assets/); the extension icon set in [`icons/`](icons/) is generated from `assets/icon-red-on-yellow@2x.png`. Shared UI tokens (Chrome-native styling + brand accents, light/dark) are in [`sundew.css`](sundew.css).

## How it works

- `chrome.alarms` fires on the chosen interval (30/60/120 min) and 1 minute after Chrome starts.
- Each run collects only visits since the last successful sync (first run backfills 24 hours), deduplicated by visit ID with a 5-minute overlap window so nothing is missed at the boundary.
- Only visits that happened _on this machine_ are collected. Chrome Sync copies visits between machines on the same profile, so without that filter every device would re-upload every other device's browsing.
- Rows are appended to the configured tab via the Google Sheets API (`values:append`). The tab and header row are created automatically if missing.
- If a push fails (offline, token expired), rows are queued locally and flushed on the next run without duplication.
- Auth uses the non-sensitive `drive.file` scope, so no Google app verification is needed and users in any org can sign in without warnings. The extension can touch spreadsheets it created **or** ones the user explicitly picks: **Browse Drive…** in Options opens a small hosted Google Picker page, and picking a file grants the extension access to just that file.
- The Picker can't run inside an MV3 extension page (remote-script CSP), which is why it lives on a tiny static Cloudflare Pages site (`picker/index.html`). The extension passes its OAuth token to the page via URL fragment; the page posts the picked file's id/name back via `postMessage` and closes.

Columns: `Timestamp (ISO), Date, Time, Page Title, URL, Visit Type, Visit ID, Total Visits, Typed Count, Device, Referred By (Visit ID), Local Visit`. That is every field Chrome's history API exposes per visit; `Referred By` chains visits into navigation trails. `Local Visit` is now always TRUE (synced-in visits are filtered out before the sheet) and is kept only so column order never changes — historic FALSE rows predate that filter. Header renames rewrite row 1 in place on next sync.

`Visit ID` is Chrome's local database row ID. It is unique **within** a device and meaningless across devices, so never join two machines' rows on it — the same number refers to different visits on each machine. `Total Visits` and `Typed Count` are Chrome's own per-URL counters and include visits synced in from other devices.

## Setup

### 1. Load the extension

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
2. The ID is pinned to `diajjpmjfbkeecomlookgjepfoibobac` on every machine via the `key` in `manifest.json` (private key: 1Password → Good Native → `sundew-google`).

### 2. Create the OAuth client (one-off, per GCP project)

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project (or reuse one).
2. **APIs & Services → Library** → enable **Google Sheets API**, **Google Drive API**, and **Google Picker API**.
3. **APIs & Services → OAuth consent screen** → configure as **External**, then **Publish app** (push to production). Because the only scope is `drive.file` (non-sensitive), no Google verification review is needed and any Google account in any org can sign in with no warnings. While still in Testing status, only listed test users can sign in.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Application type **Chrome Extension** → paste the extension ID from step 1.
5. Copy the client ID into `manifest.json` under `oauth2.client_id`, then reload the extension at `chrome://extensions`.

### 3. Picker page (one-off)

Already deployed to `https://app.sundew.goodnative.co` (`PICKER_URL` in `options.js` points there). To finish it:

1. In the GCP project: **Credentials → Create credentials → API key** → restrict it to the **Google Picker API** and to HTTP referrers matching `https://app.sundew.goodnative.co/*`.
2. Fill in `picker/index.html`: `API_KEY` (the key from step 1) and `APP_ID` (the numeric **project number** from the GCP dashboard — must be the same project as the OAuth client, or picked files won't be granted to the extension).
3. Redeploy — push to `main` (Cloudflare's Workers Builds GitHub integration deploys `wrangler.jsonc` automatically), or manually:

```bash
npx wrangler deploy
```

### 4. Configure

1. Click the extension icon → **Settings** (or right-click → Options).
2. **Sign in with Google**.
3. Choose a spreadsheet: pick a previously connected one from the dropdown, **Browse Drive…** to connect any sheet you have access to, or **+ Create new spreadsheet…**.
4. Pick a tab or **+ Create new tab…**.
5. Set a device label and interval → **Save** → **Sync now** to verify.

## Multiple devices

The unpacked-extension ID is derived from the folder path, so it can differ between machines — and the OAuth client is bound to one ID. To pin the same ID everywhere, add a `key` to `manifest.json`:

```bash
openssl genrsa -out key.pem 2048
openssl rsa -in key.pem -pubout -outform DER | base64
```

Put the base64 output in `manifest.json` as `"key": "<base64>"`, reload, and register that (now stable) extension ID in the OAuth client. Keep `key.pem` out of any public repo.

Then on each device: load the same folder and sign in. Settings split in two:

- **Destination** (spreadsheet, tab) lives in `chrome.storage.sync`, so Chrome Sync shares it across every machine on the profile. Configure it once.
- **Device label and interval** live in `chrome.storage.local`, so they are genuinely per-machine. Each device defaults its label to its platform (`Mac`, `Windows`, `Linux`) and you can rename it in Options without touching the others.

To send machines to different tabs or different spreadsheets entirely, use separate Chrome profiles — one synced profile has one destination by design.

## Notes

- Syncs only run while Chrome is open (no Chrome = no new history anyway); a startup sync catches up after downtime.
- Chrome retains ~90 days of history, so the 24-hour first-run backfill is well within range. To backfill more, clear the extension's storage and temporarily raise `FIRST_SYNC_BACKFILL_MS` in `background.js`.
- Incognito visits are never recorded in history, so they never reach the sheet.
