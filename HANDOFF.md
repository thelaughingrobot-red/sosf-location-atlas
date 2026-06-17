# S/SF Location Atlas — Project Handoff / Status

Paste the contents of this file as your FIRST message to a new Claude Code session
(opened in this project folder) to continue with full context.

## What this is
A static website cataloguing filming locations of *The Streets of San Francisco* TV show,
organized Season → Episode → Location, plus a filterable map. Built with a tiny zero-dependency
Node generator. Periodic-table visual style (cream/espresso/rust, Helvetica Neue).

## Where it lives
`~/Developer/TheStreetsOfSanFranciscoWebApp/` (moved OUT of the iCloud-synced Desktop —
see the iCloud warning below). The app is in `dev/`.

## How it works (the whole workflow)
- **Source of truth = a Google Sheet** (6 tabs: TV Movies / Season 1–5).
  Sheet ID `1NZPEwRjo1JtFtiG6S9R9OIDHcKrPB6UL`, shared "Anyone with link → Viewer".
- **`node update.js`** (the "Update Site" button) pulls every tab from the Sheet → overwrites
  `data/csv/*.csv` → runs `csv-to-json.js` → builds `site/`.
- **`node csv-to-json.js`** turns the CSVs + `data/show.json` into `data/sosf.json` (generated).
- **`node build.js`** generates `site/` from `sosf.json`.
- **`Start Server.command`** = `python3 -m http.server 8099 --directory site` → http://localhost:8099
- Two double-click shortcuts in `dev/`: **Start Server.command** (view) and **Update Site.command** (rebuild).
- Requires **Node** + **Python 3** installed. Final deploy = upload contents of `site/` to Dreamhost.

## Data model — Sheet columns (12)
`Episode, Episode Title, Air Date, Description, Timestamp (hh:mm:ss), Address, Latitude,
Longitude, Notes, Then Image, Now Image, Published`
- One row per location; Episode/Title/Air Date filled once per episode (fill down).
- **Description** = the location name shown on the site. **Element** (2-letter tile symbol) auto-generated.
- **Then Image / Now Image** = EXPLICIT relative paths under `src/images/locations/`
  (e.g. `s1/e0/loc-1-then.jpg`). Both present → before/after slider; one → single image; none → placeholder.
  Then-Year auto-derives from the episode air date.
- **Published** = location shows ONLY if truthy (TRUE/yes/1). Blank/FALSE hides it everywhere
  (page, tile, map pin, prev-next nav). All 372 existing pre-filled TRUE.

## Current totals
5 seasons · 120 episodes (Pilot = S1 E0, IMDB-style) · 372 locations.
Coverage from a Google My Maps import: S1=154 (incl. 16 pilot), S2=152, S3=60, S4=0, S5=6.
Location pages have prev/next nav. Map uses CARTO Positron (minimal grayscale) at zoom 14.

## ⚠️ OPEN / IN-PROGRESS ITEMS
1. **CRITICAL — re-import `data/SOSF-Atlas.xlsx` into the Google Sheet** (File → Import → Replace
   spreadsheet). An iCloud sync conflict corrupted Season 1 (header fused into row 1) and that
   corruption propagated to the Sheet. The local data was repaired and the corrected xlsx is ready.
   DO NOT run Update Site until this re-import is done, or it pulls the broken Season 1 again.
2. "David J Farr's office" (pilot) was set Published=FALSE on purpose (a test) — it is hidden.
3. Before/after slider question: the slider needs BOTH `Then Image` AND `Now Image` columns filled
   in the Sheet with the paths — having the files (e.g. loc-4-now.jpg) present is NOT enough on its
   own; the build reads the explicit path from the column. (Possible enhancement: auto-detect a
   `-now` companion file when only the `-then` path is given.)

## ⚠️ iCloud WARNING
Never keep this project in `~/Desktop` or `~/Documents` while iCloud "Desktop & Documents" sync is
ON. The builds rewrite ~500 files each run; iCloud makes "Keep Both" conflict copies that duplicate
`site/` and can corrupt CSVs/the Sheet. Keep it in `~/Developer/` (not synced).

## Two-machine note
Edit the Google Sheet from any machine (it's cloud). But run the BUILD (Update Site / Start Server)
on ONE machine only, with Node + Python installed and the latest project files. Claude Code chats
do not sync between machines — carry context via this file.
