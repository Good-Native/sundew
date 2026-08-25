const destinationEl = document.getElementById("destination");
const lastResultEl = document.getElementById("lastResult");

async function render() {
  const config = await chrome.storage.sync.get([
    "spreadsheetId",
    "spreadsheetName",
    "sheetName",
  ]);
  if (config.sheetName) {
    destinationEl.textContent = "Sync to:";
    const label = `${config.spreadsheetName || "sheet"} [${config.sheetName}]`;
    if (config.spreadsheetId) {
      const link = document.createElement("a");
      link.href = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`;
      link.target = "_blank";
      link.className = "sheet-button";
      link.textContent = label;
      destinationEl.appendChild(link);
    } else {
      destinationEl.textContent += ` ${label}`;
    }
  }

  const { lastResult } = await chrome.storage.local.get("lastResult");
  if (!lastResult) {
    lastResultEl.textContent = "No sync yet.";
    lastResultEl.className = "";
    return;
  }
  const when = new Date(lastResult.at).toLocaleString();
  if (lastResult.ok) {
    lastResultEl.textContent = `Last: ${when}, ${lastResult.rowsPushed} rows`;
    lastResultEl.className = "ok";
  } else {
    lastResultEl.textContent = `Last attempt: ${when}\n${lastResult.error}`;
    lastResultEl.className = "error";
  }
}

document.getElementById("syncNowButton").addEventListener("click", async () => {
  lastResultEl.textContent = "Syncing…";
  lastResultEl.className = "";
  await chrome.runtime.sendMessage({ type: "syncNow" });
  render();
});

document.getElementById("optionsButton").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
