const destinationEl = document.getElementById("destination");
const lastResultEl = document.getElementById("lastResult");

async function render() {
  const config = await chrome.storage.sync.get([
    "spreadsheetId",
    "sheetName",
    "deviceLabel",
  ]);
  if (config.sheetName) {
    destinationEl.textContent = "";
    const label = `Tab: ${config.sheetName} (${config.deviceLabel || "Chrome"})`;
    if (config.spreadsheetId) {
      const link = document.createElement("a");
      link.href = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`;
      link.target = "_blank";
      link.textContent = label;
      destinationEl.appendChild(link);
    } else {
      destinationEl.textContent = label;
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
    lastResultEl.textContent = `Last sync: ${when}\n${lastResult.rowsPushed} row(s) pushed.`;
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
