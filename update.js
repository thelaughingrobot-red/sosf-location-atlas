#!/usr/bin/env node
/* ============================================================
   update.js — the one command to refresh the site from Google.

     node update.js

   It (1) pulls every tab of the Google Sheet as CSV, (2) rebuilds
   data/sosf.json, (3) regenerates ./site. Then upload site/ to the server.

   Requires the Sheet to be shared "Anyone with the link → Viewer".
   To point at a different Sheet, change SHEET_ID below.
   NOTE: this OVERWRITES data/csv/*.csv with the Sheet's contents —
   edit in Google Sheets, not the local CSVs.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SHEET_ID = "1NZPEwRjo1JtFtiG6S9R9OIDHcKrPB6UL";
const CSV_DIR = path.join(__dirname, "data", "csv");

// Google Sheet tab name  ->  local CSV filename
const TABS = {
  "TV Movies": "tv-movies.csv",
  "Season 1": "season-1.csv",
  "Season 2": "season-2.csv",
  "Season 3": "season-3.csv",
  "Season 4": "season-4.csv",
  "Season 5": "season-5.csv",
};

const gvizUrl = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

async function pull() {
  fs.mkdirSync(CSV_DIR, { recursive: true });
  for (const [tab, file] of Object.entries(TABS)) {
    let res;
    try { res = await fetch(gvizUrl(tab)); }
    catch (e) { throw new Error(`Tab "${tab}": network error (${e.message}).`); }
    if (!res.ok) throw new Error(`Tab "${tab}": HTTP ${res.status}. Is the Sheet shared "Anyone with the link → Viewer"?`);
    const text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text))
      throw new Error(`Tab "${tab}" returned a login page, not CSV — check link-sharing and that the tab name matches exactly.`);
    fs.writeFileSync(path.join(CSV_DIR, file), text.endsWith("\n") ? text : text + "\n");
    const rows = text.split("\n").filter((l) => l.trim()).length - 1;
    console.log(`  pulled "${tab}" → ${file} (${rows} rows)`);
  }
}

(async () => {
  console.log("1/3  Pulling tabs from Google Sheet…");
  await pull();
  console.log("\n2/3  Building data/sosf.json…");
  execFileSync("node", ["csv-to-json.js"], { cwd: __dirname, stdio: "inherit" });
  console.log("\n3/3  Generating site/…");
  execFileSync("node", ["build.js"], { cwd: __dirname, stdio: "inherit" });
  console.log("\n✓ Done. Upload the contents of site/ to your server.");
})().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
