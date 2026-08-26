---
bump: minor
---

### Fixed

- Device label and sync interval are stored per machine (`chrome.storage.local`)
  instead of in `chrome.storage.sync`, which Chrome replicates to every profile
  on the account. A second machine no longer inherits the first one's label and
  stamps every row as if it were the other device. Each device now defaults its
  label to its platform (`Mac`, `Windows`, `Linux`); re-label in Options if you
  had a custom one.
- Visits synced into Chrome from another device are excluded from collection.
  Without this each machine re-uploaded every other machine's browsing, so a
  shared sheet filled with duplicates.
- A failed push no longer re-queues rows it has already queued. The sync window
  stayed frozen while a run kept failing, so each retry rescanned an
  ever-growing span; once `seenVisitIds` hit its 10,000 cap, its oldest entries
  dropped while still inside that span and were collected again, adding another
  copy per run. The window now advances past everything collected, because those
  visits are either in the sheet or in the queue. A collection failure still
  holds the window, so nothing goes unscanned.
- Sync failures raise a badge on the toolbar icon and show on the Options page.
  Previously the only place an error appeared was the popup, so a device that
  had never authorised on that machine failed silently every hour.
- The Options page no longer hangs on "Syncing…" when the service worker dies
  mid-sync.
- A rejected sync from the alarm is reported instead of becoming an unhandled
  rejection.
- The alarm is re-asserted whenever the service worker starts, not only on
  install and browser startup. Chrome does not guarantee alarms survive a
  restart, and a Save whose reschedule message never reached the worker used to
  leave the old interval running; the schedule now converges on the stored
  interval either way.
- `device.js` is packed into the release zip. Without it the published
  extension's service worker fails to start, since `background.js` imports it.

### Changed

- `minimum_chrome_version` is set to 115, the release that introduced
  `VisitItem.isLocal`. The synced-visit filter depends on it.
- `Local Visit` is now always TRUE, since synced-in visits never reach the
  sheet. The column stays for column-order stability.
