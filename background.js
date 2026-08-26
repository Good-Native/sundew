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

// Alarms usually outlive a browser restart but Chrome doesn't guarantee it, so
// re-assert on every service worker start.
chrome.alarms.get(ALARM_NAME).then((alarm) => {
  if (!alarm) scheduleAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) syncNow();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "syncNow") {
    syncNow()
      .catch((err) => recordResult({ ok: false, error: err.message }))
      .then(sendResponse);
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

  let rows = state.pendingRows || [];
  let visits = [];
  try {
    visits = await collectVisits(since, seen);
    rows = rows.concat(visits.map((v) => visitToRow(v, deviceLabel)));

    if (rows.length > 0) {
      await ensureSheetTab(config.spreadsheetId, config.sheetName);
      await ensureHeader(config.spreadsheetId, config.sheetName);
      await appendRows(config.spreadsheetId, config.sheetName, rows);
    }

    const seenIds = visits
      .map((v) => v.visitId)
      .concat(state.seenVisitIds || []);
    await chrome.storage.local.set({
      lastSyncTime: now,
      seenVisitIds: seenIds.slice(0, MAX_SEEN_IDS),
      pendingRows: [],
    });
    return recordResult({ ok: true, rowsPushed: rows.length });
  } catch (err) {
    // Queue unappended rows for the next run. Collected visits are marked
    // seen so the retry doesn't re-collect them on top of the queue.
    const seenIds = visits
      .map((v) => v.visitId)
      .concat(state.seenVisitIds || []);
    await chrome.storage.local.set({
      pendingRows: err.remainingRows ?? rows,
      seenVisitIds: seenIds.slice(0, MAX_SEEN_IDS),
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
      // every other machine's browsing. Strict compare: isLocal is undefined
      // before Chrome 115, where there are no synced visits to exclude.
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
