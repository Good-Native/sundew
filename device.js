// Per-machine settings, shared by background.js and options.js via
// importScripts / <script>.
//
// These deliberately live in chrome.storage.local. Chrome Sync replicates
// chrome.storage.sync to every profile signed into the same Google account, so
// a device label kept there is identical on every machine — the Device column
// then can't tell two machines apart. The destination (spreadsheet and tab)
// stays in sync storage: sharing one sheet across machines is the point.

const DEFAULT_INTERVAL_MINUTES = 60;

// chrome.runtime.getPlatformInfo() os values.
const PLATFORM_LABELS = {
  mac: "Mac",
  win: "Windows",
  linux: "Linux",
  cros: "Chrome OS",
  android: "Android",
  openbsd: "OpenBSD",
  fuchsia: "Fuchsia",
};

async function defaultDeviceLabel() {
  try {
    const { os } = await chrome.runtime.getPlatformInfo();
    return PLATFORM_LABELS[os] || "Chrome";
  } catch (e) {
    return "Chrome";
  }
}

async function getDeviceSettings() {
  const stored = await chrome.storage.local.get([
    "deviceLabel",
    "intervalMinutes",
  ]);
  return {
    deviceLabel: stored.deviceLabel || (await defaultDeviceLabel()),
    intervalMinutes: stored.intervalMinutes || DEFAULT_INTERVAL_MINUTES,
  };
}

async function setDeviceSettings({ deviceLabel, intervalMinutes }) {
  await chrome.storage.local.set({ deviceLabel, intervalMinutes });
  await dropSyncedDeviceSettings();
}

// Settings written by versions that stored these in sync storage. Left in
// place they would keep landing on every other machine on the account.
async function dropSyncedDeviceSettings() {
  await chrome.storage.sync.remove(["deviceLabel", "intervalMinutes"]);
}
