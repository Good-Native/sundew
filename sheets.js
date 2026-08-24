// Google Sheets API helpers, shared by background.js and options.js via importScripts / <script>.

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

const HEADER = [
  "isoTime",
  "date",
  "time",
  "title",
  "url",
  "transition",
  "visitId",
  "visitCount",
  "typedCount",
  "device",
];

function getToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || "No auth token"));
      } else {
        resolve(token);
      }
    });
  });
}

function removeToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

// Fetch wrapper: retries once on 401 with a fresh token.
async function apiFetch(url, options = {}, interactive = false) {
  let token = await getToken(interactive);

  const doFetch = (t) =>
    fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    await removeToken(token);
    token = await getToken(interactive);
    res = await doFetch(token);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error?.message || "";
    } catch (e) {
      /* non-JSON error body */
    }
    throw new Error(`Google API ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

function sheetsFetch(path, options = {}, interactive = false) {
  return apiFetch(`${SHEETS_BASE}${path}`, options, interactive);
}

// drive.file scope only sees spreadsheets this extension created.
async function listAppSpreadsheets(interactive = false) {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id,name)",
    orderBy: "modifiedTime desc",
    pageSize: "50",
  });
  const res = await apiFetch(`${DRIVE_FILES_URL}?${params}`, {}, interactive);
  return res.files || [];
}

async function createSpreadsheet(title, interactive = false) {
  return sheetsFetch(
    "",
    {
      method: "POST",
      body: JSON.stringify({ properties: { title } }),
    },
    interactive,
  );
}

async function getSpreadsheetMeta(spreadsheetId, interactive = false) {
  return sheetsFetch(
    `/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)`,
    {},
    interactive,
  );
}

async function ensureSheetTab(spreadsheetId, sheetName) {
  const meta = await getSpreadsheetMeta(spreadsheetId);
  const exists = meta.sheets.some((s) => s.properties.title === sheetName);
  if (!exists) {
    await sheetsFetch(`/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      }),
    });
  }
}

// A1 notation requires single-quoting for tab names with spaces etc.
function a1Range(sheetName, cells) {
  return encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!${cells}`);
}

async function ensureHeader(spreadsheetId, sheetName) {
  const range = a1Range(
    sheetName,
    `A1:${String.fromCharCode(64 + HEADER.length)}1`,
  );
  const existing = await sheetsFetch(`/${spreadsheetId}/values/${range}`);
  if (!existing.values || existing.values.length === 0) {
    await sheetsFetch(
      `/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values: [HEADER] }),
      },
    );
  }
}

async function appendRows(spreadsheetId, sheetName, rows) {
  const range = a1Range(sheetName, "A1");
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    try {
      await sheetsFetch(
        `/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          body: JSON.stringify({ values: rows.slice(i, i + CHUNK) }),
        },
      );
    } catch (err) {
      // Rows before this chunk were appended; only the rest need retrying.
      err.remainingRows = rows.slice(i);
      throw err;
    }
  }
}
