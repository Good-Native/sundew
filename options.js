const NEW_VALUE = "__new__";

// Hosted Google Picker page (Cloudflare Workers) — see README.
const PICKER_URL = "https://app.sundew.goodnative.co/";

const els = {};
for (const id of [
  "signedOutView",
  "signedInView",
  "signInButton",
  "signOutButton",
  "destLinked",
  "linkedSheetButton",
  "changeDestButton",
  "destEditor",
  "spreadsheetSelect",
  "browseDriveButton",
  "newSheetWrap",
  "newSheetName",
  "createSheetButton",
  "openSheetLink",
  "tabSelect",
  "newTabWrap",
  "newTabName",
  "deviceLabel",
  "intervalSelect",
  "saveButton",
  "syncNowButton",
  "status",
]) {
  els[id] = document.getElementById(id);
}

function setStatus(message, ok) {
  els.status.textContent = message;
  els.status.className = ok === undefined ? "" : ok ? "ok" : "error";
}

function addOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function setAuthUI(signedIn) {
  els.signedOutView.classList.toggle("hidden", signedIn);
  els.signedInView.classList.toggle("hidden", !signedIn);
}

async function checkAuth() {
  try {
    await getToken(false);
    setAuthUI(true);
    return true;
  } catch (e) {
    setAuthUI(false);
    return false;
  }
}

function showLinkedDestination(config) {
  els.linkedSheetButton.textContent = `${config.spreadsheetName || "Sheet"} [${config.sheetName}]`;
  els.destLinked.classList.remove("hidden");
  els.destEditor.classList.add("hidden");
}

function showDestinationEditor() {
  els.destLinked.classList.add("hidden");
  els.destEditor.classList.remove("hidden");
}

async function loadSpreadsheets(selectId) {
  try {
    const files = await listAppSpreadsheets();
    els.spreadsheetSelect.replaceChildren();
    addOption(els.spreadsheetSelect, "", "— select —");
    for (const file of files) {
      addOption(els.spreadsheetSelect, file.id, file.name);
    }
    addOption(els.spreadsheetSelect, NEW_VALUE, "+ Create new spreadsheet…");
    els.spreadsheetSelect.disabled = false;

    if (
      selectId &&
      [...els.spreadsheetSelect.options].some((o) => o.value === selectId)
    ) {
      els.spreadsheetSelect.value = selectId;
    }
    await onSpreadsheetChange();
  } catch (err) {
    setStatus(`Could not list spreadsheets: ${err.message}`, false);
  }
}

async function onSpreadsheetChange() {
  const value = els.spreadsheetSelect.value;
  els.newSheetWrap.classList.toggle("hidden", value !== NEW_VALUE);
  els.openSheetLink.classList.toggle("hidden", !value || value === NEW_VALUE);

  els.tabSelect.replaceChildren();
  els.tabSelect.disabled = true;

  if (!value || value === NEW_VALUE) {
    addOption(els.tabSelect, "", "Select a spreadsheet first");
    return;
  }

  els.openSheetLink.href = `https://docs.google.com/spreadsheets/d/${value}`;
  await loadTabs(value);
}

async function loadTabs(spreadsheetId) {
  setStatus("Loading tabs…");
  try {
    const meta = await getSpreadsheetMeta(spreadsheetId);
    els.tabSelect.replaceChildren();
    for (const sheet of meta.sheets) {
      addOption(els.tabSelect, sheet.properties.title, sheet.properties.title);
    }
    addOption(els.tabSelect, NEW_VALUE, "+ Create new tab…");
    els.tabSelect.disabled = false;

    const saved = await chrome.storage.sync.get(["spreadsheetId", "sheetName"]);
    if (
      saved.spreadsheetId === spreadsheetId &&
      saved.sheetName &&
      [...els.tabSelect.options].some((o) => o.value === saved.sheetName)
    ) {
      els.tabSelect.value = saved.sheetName;
    }
    onTabSelectChange();
    setStatus("");
  } catch (err) {
    setStatus(`Could not load tabs: ${err.message}`, false);
  }
}

function onTabSelectChange() {
  els.newTabWrap.classList.toggle("hidden", els.tabSelect.value !== NEW_VALUE);
}

async function createSheet() {
  const title = els.newSheetName.value.trim();
  if (!title) {
    setStatus("Enter a name for the new spreadsheet.", false);
    return;
  }
  setStatus("Creating spreadsheet…");
  try {
    const created = await createSpreadsheet(title, true);
    setStatus(`Created "${title}".`, true);
    await loadSpreadsheets(created.spreadsheetId);
  } catch (err) {
    setStatus(`Create failed: ${err.message}`, false);
  }
}

function selectedSheetName() {
  if (els.tabSelect.value === NEW_VALUE) {
    return els.newTabName.value.trim();
  }
  return els.tabSelect.value;
}

async function save() {
  const spreadsheetId = els.spreadsheetSelect.value;
  const sheetName = selectedSheetName();
  if (!spreadsheetId || spreadsheetId === NEW_VALUE || !sheetName) {
    setStatus("Spreadsheet and tab are both required.", false);
    return;
  }
  const selectedOption = [...els.spreadsheetSelect.options].find(
    (o) => o.value === spreadsheetId,
  );
  const config = {
    spreadsheetId,
    spreadsheetName: selectedOption?.textContent || "",
    sheetName,
    deviceLabel: els.deviceLabel.value.trim() || "Chrome",
    intervalMinutes: Number(els.intervalSelect.value),
  };
  await chrome.storage.sync.set(config);
  await chrome.runtime.sendMessage({ type: "rescheduleAlarm" });
  showLinkedDestination(config);
  setStatus("Saved.", true);
}

async function syncNow() {
  setStatus("Syncing…");
  const result = await chrome.runtime.sendMessage({ type: "syncNow" });
  if (result?.ok) {
    setStatus(`Synced — ${result.rowsPushed} row(s) pushed.`, true);
  } else {
    setStatus(`Sync failed: ${result?.error || "unknown error"}`, false);
  }
}

async function restore() {
  const config = await chrome.storage.sync.get([
    "spreadsheetId",
    "spreadsheetName",
    "sheetName",
    "deviceLabel",
    "intervalMinutes",
  ]);
  if (config.deviceLabel) els.deviceLabel.value = config.deviceLabel;
  if (config.intervalMinutes) {
    els.intervalSelect.value = String(config.intervalMinutes);
  }

  const signedIn = await checkAuth();
  const configured = config.spreadsheetId && config.sheetName;

  if (configured) {
    // Backfill the display name for configs saved before it was stored.
    if (!config.spreadsheetName && signedIn) {
      try {
        const meta = await getSpreadsheetMeta(config.spreadsheetId);
        config.spreadsheetName = meta.properties.title;
        await chrome.storage.sync.set({
          spreadsheetName: config.spreadsheetName,
        });
      } catch (e) {
        /* leave blank; editor still works */
      }
    }
    showLinkedDestination(config);
  } else if (signedIn) {
    await loadSpreadsheets(config.spreadsheetId);
  }
}

els.signInButton.addEventListener("click", async () => {
  try {
    await getToken(true);
    setAuthUI(true);
    const { spreadsheetId } = await chrome.storage.sync.get("spreadsheetId");
    if (!els.destEditor.classList.contains("hidden")) {
      await loadSpreadsheets(spreadsheetId);
    }
    setStatus("Signed in.", true);
  } catch (err) {
    setStatus(`Sign-in failed: ${err.message}`, false);
  }
});

els.signOutButton.addEventListener("click", async () => {
  // Clearing Chrome's cache alone isn't enough — the Google-side grant
  // survives and getAuthToken silently mints a fresh token. Revoke it.
  try {
    const token = await getToken(false);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    await removeToken(token);
  } catch (e) {
    /* no live token to revoke */
  }
  chrome.identity.clearAllCachedAuthTokens(() => {
    setAuthUI(false);
    setStatus("Signed out.", true);
  });
});

els.linkedSheetButton.addEventListener("click", async () => {
  const { spreadsheetId } = await chrome.storage.sync.get("spreadsheetId");
  if (spreadsheetId) {
    window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  }
});

els.changeDestButton.addEventListener("click", async () => {
  showDestinationEditor();
  const { spreadsheetId } = await chrome.storage.sync.get("spreadsheetId");
  if (await checkAuth()) {
    await loadSpreadsheets(spreadsheetId);
  }
});

async function browseDrive() {
  try {
    const token = await getToken(true);
    const fragment = new URLSearchParams({
      token,
      origin: location.origin,
    });
    window.open(
      `${PICKER_URL}#${fragment}`,
      "sheetPicker",
      "width=1050,height=650",
    );
    setStatus("Pick a spreadsheet in the popup…");
  } catch (err) {
    setStatus(`Sign-in required: ${err.message}`, false);
  }
}

window.addEventListener("message", async (event) => {
  if (event.origin !== new URL(PICKER_URL).origin) return;
  if (event.data?.type !== "sheet-picked") return;

  const { id, name } = event.data;
  if (![...els.spreadsheetSelect.options].some((o) => o.value === id)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    const newEntry = [...els.spreadsheetSelect.options].find(
      (o) => o.value === NEW_VALUE,
    );
    els.spreadsheetSelect.insertBefore(option, newEntry || null);
  }
  els.spreadsheetSelect.value = id;
  await onSpreadsheetChange();
  setStatus(`Connected "${name}".`, true);
});

els.spreadsheetSelect.addEventListener("change", onSpreadsheetChange);
els.browseDriveButton.addEventListener("click", browseDrive);
els.createSheetButton.addEventListener("click", createSheet);
els.tabSelect.addEventListener("change", onTabSelectChange);
els.saveButton.addEventListener("click", save);
els.syncNowButton.addEventListener("click", syncNow);

restore();
