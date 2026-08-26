importScripts("sheets.js", "device.js");

const ALARM_NAME = "history-sync";
const FIRST_SYNC_BACKFILL_MS = 24 * 60 * 60 * 1000;
const OVERLAP_MS = 5 * 60 * 1000;
const MAX_SEEN_IDS = 10000;

chrome.runtime.onInstalled.addListener(async () => {
  await dropSyncedDeviceSettings();
  await scheduleAlarm();
});
chrome.runtime.onStartup.addListener(scheduleAlarm);

// Alarms usually outlive a browser restart but Chrome doesn't guarantee it, and
// a Save whose rescheduleAlarm message never reached the worker leaves a stale
// period behind. Reconcile on every service worker start so the schedule
// converges on the stored interval either way.
async function reconcileAlarm() {
  const alarm = await chrome.alarms.get(ALARM_NAME);
  const { intervalMinutes } = await getDeviceSettings();
  if (!alarm || alarm.periodInMinutes !== intervalMinutes) {
    await scheduleAlarm();
  }
}

// recordResult writes to storage, so reporting a storage failure can itself
// fail. Swallow that rather than trading one unhandled rejection for another.
async function reportFailure(err) {
  try {
    return await recordResult({ ok: false, error: err.message });
  } catch (e) {
    /* storage unavailable too, so there is nothing left to report with */
  }
}

// The next worker start retries; surface it in the meantime.
reconcileAlarm().catch((err) =>
  reportFailure(new Error(`Could not schedule sync: ${err.message}`)),
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) syncNow().catch(reportFailure);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "syncNow") {
    syncNow().catch(reportFailure).then(sendResponse);
    return true;
  }
  if (msg.type === "rescheduleAlarm") {
    scheduleAlarm().then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function scheduleAlarm() {
  const { intervalMinutes } = await getDeviceSettings();
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: intervalMinutes,
    delayInMinutes: 1,
  });
}

async function syncNow() {
  const config = await chrome.storage.sync.get(["spreadsheetId", "sheetName"]);
  if (!config.spreadsheetId || !config.sheetName) {
    return recordResult({
      ok: false,
      error: "Not configured — set a spreadsheet and tab in Options.",
    });
  }
  const { deviceLabel } = await getDeviceSettings();

  const state = await chrome.storage.local.get([
    "lastSyncTime",
    "seenVisitIds",
    "pendingRows",
  ]);
  const now = Date.now();
  const since = state.lastSyncTime
    ? state.lastSyncTime - OVERLAP_MS
    : now - FIRST_SYNC_BACKFILL_MS;
  const seen = new Set(state.seenVisitIds || []);

  // Collect before pushing, and keep the two failures apart. Until collection
  // succeeds the window must not move, or the visits it would have found are
  // never scanned again.
  let visits;
  try {
    visits = await collectVisits(since, seen);
  } catch (err) {
    return recordResult({ ok: false, error: err.message });
  }

  const rows = (state.pendingRows || []).concat(
    visits.map((v) => visitToRow(v, deviceLabel)),
  );
  // Only has to cover the OVERLAP_MS rescan, since the window always advances
  // past everything collected — so the cap is a backstop, not a working limit.
  const seenIds = visits
    .map((v) => v.visitId)
    .concat(state.seenVisitIds || [])
    .slice(0, MAX_SEEN_IDS);

  try {
    if (rows.length > 0) {
      await ensureSheetTab(config.spreadsheetId, config.sheetName);
      await ensureHeader(config.spreadsheetId, config.sheetName);
      await appendRows(config.spreadsheetId, config.sheetName, rows);
    }
    await chrome.storage.local.set({
      lastSyncTime: now,
      seenVisitIds: seenIds,
      pendingRows: [],
    });
    return recordResult({ ok: true, rowsPushed: rows.length });
  } catch (err) {
    // Every collected visit is now either in the sheet or queued below, so the
    // window advances even though the push failed. Freezing it instead would
    // rescan an ever-growing span, and once seenVisitIds filled, its oldest
    // entries would drop while still inside that span — re-queueing rows the
    // queue already holds, once more per run.
    await chrome.storage.local.set({
      lastSyncTime: now,
      seenVisitIds: seenIds,
      pendingRows: err.remainingRows ?? rows,
    });
    return recordResult({ ok: false, error: err.message });
  }
}

async function collectVisits(since, seen) {
  const historyItems = await chrome.history.search({
    text: "",
    startTime: since,
    maxResults: 10000,
  });

  const visits = [];
  for (const item of historyItems) {
    const visitItems = await chrome.history.getVisits({ url: item.url });
    for (const visit of visitItems) {
      // Chrome Sync copies other machines' visits into this profile's history
      // and isLocal is false for those. Without this each machine re-uploads
      // every other machine's browsing. isLocal landed in Chrome 115, which
      // manifest.json requires as the minimum version.
      if (visit.isLocal === false) continue;
      if (visit.visitTime >= since && !seen.has(visit.visitId)) {
        visits.push({
          visitId: visit.visitId,
          visitTime: visit.visitTime,
          transition: visit.transition,
          referringVisitId: visit.referringVisitId,
          isLocal: visit.isLocal,
          title: item.title || "",
          url: item.url,
          visitCount: item.visitCount,
          typedCount: item.typedCount,
        });
      }
    }
  }

  visits.sort((a, b) => a.visitTime - b.visitTime);
  return visits;
}

function visitToRow(visit, deviceLabel) {
  const d = new Date(visit.visitTime);
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.toISOString(),
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    visit.title,
    visit.url,
    visit.transition,
    visit.visitId,
    visit.visitCount,
    visit.typedCount,
    deviceLabel,
    // "0" means no referrer (address bar, bookmark, etc.)
    visit.referringVisitId ?? "",
    visit.isLocal === undefined ? "" : visit.isLocal ? "TRUE" : "FALSE",
  ];
}

async function recordResult(result) {
  await chrome.storage.local.set({
    lastResult: { ...result, at: Date.now() },
  });
  // The popup is the only place the error text appears, so flag failures on
  // the toolbar icon rather than letting a broken device stay silent.
  await chrome.action.setBadgeText({ text: result.ok ? "" : "!" });
  await chrome.action.setBadgeBackgroundColor({ color: "#990b27" });
  return result;
}
