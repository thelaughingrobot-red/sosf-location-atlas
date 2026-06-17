#!/usr/bin/env node
/* ============================================================
   csv-to-json — builds data/sosf.json from the editable CSVs.

   Source of truth you edit (mirrors a 6-tab Google Sheet):
     data/csv/season-1.csv … season-5.csv   (one row per location,
       grouped under episodes; Episode/Title/Air Date fill down)
     data/csv/tv-movies.csv                  (specials — pilot, 1992 film)
     data/show.json                          (static site metadata)

   Run:  node csv-to-json.js   →   writes data/sosf.json
   Then: node build.js         →   builds ./site
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CSV_DIR = path.join(ROOT, "data", "csv");
const OUT = path.join(ROOT, "data", "sosf.json");

/* ---------- minimal RFC-4180 CSV parser ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", i = 0, inQ = false;
  text = text.replace(/^﻿/, "");                 // strip BOM
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readTable(file) {
  const rows = parseCSV(fs.readFileSync(file, "utf8")).filter(r => r.some(c => c.trim() !== ""));
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = (r[i] == null ? "" : r[i]).trim(); });
    return o;
  });
}

/* ---------- helpers ---------- */
const STOP = new Set(["the", "of", "and", "a", "an", "to", "in", "on", "at", "for", "with", "&"]);
const issues = [];
let unpublished = 0;
// A location appears on the site only when "Published" is truthy (true/yes/1/x).
// If the column is absent entirely, everything shows (back-compat).
function isPublished(r) {
  if (!("Published" in r)) return true;
  return ["true", "yes", "y", "1", "x", "✓", "published"].includes((r["Published"] || "").trim().toLowerCase());
}
const slugify = (s) => s.toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function autoElement(name) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const sig = words.filter(w => !STOP.has(w.toLowerCase()));
  let a, b;
  if (sig.length >= 2) { a = sig[0][0]; b = sig[1][0]; }
  else { const w = (sig[0] || words[0] || "?"); a = w[0]; b = w[1] || ""; }
  return (a || "?").toUpperCase() + (b || "").toLowerCase();
}
function fmtTime(t) {
  t = t.trim();
  if (!t) return "";
  const parts = t.split(":").map(p => p.trim());
  if (!parts.every(p => /^\d+$/.test(p))) { issues.push(`Bad timestamp "${t}"`); return t; }
  let [a, b, c] = parts;
  if (parts.length === 2) return `00:${a.padStart(2, "0")}:${b.padStart(2, "0")}`;
  if (parts.length === 3) return `${a.padStart(2, "0")}:${b.padStart(2, "0")}:${c.padStart(2, "0")}`;
  issues.push(`Bad timestamp "${t}"`); return t;
}
const locName = (r) => (r["Description"] || r["Location"] || "").trim();  // "Description" col (legacy "Location")
function buildLocation(r, ctx) {
  const name = locName(r);
  const slug = (r["Slug"] || slugify(name)) || "loc";
  const latS = (r["Latitude"] || "").trim(), lngS = (r["Longitude"] || "").trim();
  let coords = null;
  if (latS || lngS) {
    const lat = parseFloat(latS), lng = parseFloat(lngS);
    if (Number.isFinite(lat) && Number.isFinite(lng)) coords = [lat, lng];
    else issues.push(`${ctx}: bad coords lat="${latS}" lng="${lngS}" for "${name}"`);
  }
  // image paths typed in the sheet, relative to src/images/locations/ (e.g. "s1/e0/loc1-then.jpg")
  // OR any https:// URL — Flickr photo page URLs are resolved to direct image URLs at build time.
  const thenImg = (r["Then Image"] || "").trim();
  const nowImg = (r["Now Image"] || "").trim();
  return {
    slug,
    name,
    element: (r["Element"] || "").trim() || autoElement(name),  // optional override; else auto
    timestamp: fmtTime(r["Timestamp"] || ""),
    address: (r["Address"] || "").trim(),
    coords,
    notes: (r["Notes"] || "").trim(),
    then: thenImg ? { src: thenImg } : null,
    now: nowImg ? { src: nowImg } : null,
  };
}

/* ---------- group a season table into episodes ----------
   One row per location. Episode/Episode Title/Air Date only need to be
   filled ONCE per episode:
     - Episode number fills DOWN (blank rows inherit the episode above), so
       you can leave it blank on a group's location rows.
     - Episode Title / Air Date are taken from the first row that has them
       for that episode number, so their position doesn't matter and you
       never repeat them. (Tip: if you sort the sheet, keep the Episode
       number on every row so grouping survives.) */
function buildEpisodes(rows, label) {
  const episodes = [];
  const byNum = new Map();
  let curEp = "";
  for (const r of rows) {
    if (r["Episode"]) curEp = r["Episode"].trim();           // fill-down for blank location rows
    if (!curEp) {
      if (locName(r))
        issues.push(`${label}: location "${locName(r)}" has no Episode number — skipped`);
      continue;
    }
    const num = parseInt(curEp, 10);
    if (Number.isNaN(num)) { issues.push(`${label}: non-numeric Episode "${curEp}" — row skipped`); continue; }
    let ep = byNum.get(num);
    if (!ep) { ep = { number: num, title: "", airDate: "", locations: [] }; byNum.set(num, ep); episodes.push(ep); }
    if (!ep.title && r["Episode Title"]) ep.title = r["Episode Title"].trim();   // first non-blank wins
    if (!ep.airDate && r["Air Date"]) ep.airDate = r["Air Date"].trim();
    if (locName(r)) {
      if (isPublished(r)) ep.locations.push(buildLocation(r, `${label} E${num}`));
      else unpublished++;
    }
  }
  // defaults, slug de-dupe, and flags
  for (const ep of episodes) {
    if (!ep.title) ep.title = `Episode ${ep.number}`;
    const seen = new Map();
    for (const lo of ep.locations) {
      if (seen.has(lo.slug)) { const n = seen.get(lo.slug) + 1; seen.set(lo.slug, n); issues.push(`${label} E${ep.number}: duplicate slug "${lo.slug}" → "${lo.slug}-${n}"`); lo.slug = `${lo.slug}-${n}`; }
      else seen.set(lo.slug, 1);
    }
    if (!ep.airDate) issues.push(`${label} E${ep.number} "${ep.title}": missing air date`);
  }
  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

/* ---------- Flickr URL resolution via oEmbed (no API key required) ----------
   Accepts Flickr photo page URLs (e.g. flickr.com/photos/user/12345/) in the
   Then Image / Now Image columns. Resolved URLs are cached in data/flickr-cache.json
   so repeat builds don't re-fetch. Direct image URLs pass through unchanged. */
const FLICKR_PAGE_RE = /^https?:\/\/(www\.)?flickr\.com\/photos\//i;
const FLICKR_CACHE_FILE = path.join(ROOT, "data", "flickr-cache.json");

async function flickrResolve(pageUrl) {
  const oembed = `https://www.flickr.com/services/oembed/?url=${encodeURIComponent(pageUrl)}&format=json`;
  const res = await fetch(oembed);
  if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
  const json = await res.json();
  if (!json.url) throw new Error("oEmbed response missing url field");
  return json.url;
}

async function resolveFlickrUrls(seasons, specials) {
  let cache = {};
  if (fs.existsSync(FLICKR_CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(FLICKR_CACHE_FILE, "utf8")); } catch {}
  }
  let dirty = false;
  const allLocs = [];
  seasons.forEach(s => s.episodes.forEach(e => allLocs.push(...e.locations)));
  specials.forEach(sp => allLocs.push(...sp.locations));
  for (const lo of allLocs) {
    for (const key of ["then", "now"]) {
      const img = lo[key];
      if (!img || !FLICKR_PAGE_RE.test(img.src)) continue;
      const pageUrl = img.src;
      if (!cache[pageUrl]) {
        process.stdout.write(`  Resolving Flickr: ${pageUrl} … `);
        try {
          cache[pageUrl] = await flickrResolve(pageUrl);
          process.stdout.write("ok\n");
          dirty = true;
        } catch (e) {
          process.stdout.write(`FAILED (${e.message})\n`);
          issues.push(`Flickr resolve failed for "${pageUrl}": ${e.message}`);
        }
      }
      if (cache[pageUrl]) img.src = cache[pageUrl];
    }
  }
  if (dirty) fs.writeFileSync(FLICKR_CACHE_FILE, JSON.stringify(cache, null, 2) + "\n");
}

/* ---------- assemble (skipped when required as a module for tests) ---------- */
module.exports = { parseCSV, readTable, buildEpisodes, buildLocation, issues };
if (require.main !== module) return;

(async () => {
  const show = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "show.json"), "utf8"));
  const seasons = [];
  for (let n = 1; n <= 5; n++) {
    const file = path.join(CSV_DIR, `season-${n}.csv`);
    if (!fs.existsSync(file)) { issues.push(`Missing ${file}`); continue; }
    const eps = buildEpisodes(readTable(file), `S${n}`);
    seasons.push({ number: n, title: `Season ${n}`, episodes: eps });
  }

  // Specials (TV Movies tab) — parsed but kept aside under `specials`.
  let specials = [];
  const tvFile = path.join(CSV_DIR, "tv-movies.csv");
  if (fs.existsSync(tvFile)) {
    specials = readTable(tvFile).filter(r => (r["Title"] || "").trim()).map(r => ({
      title: r["Title"].trim(),
      airDate: (r["Air Date"] || "").trim(),
      locations: locName(r) && isPublished(r) ? [buildLocation(r, `Special "${r["Title"].trim()}"`)] : [],
    }));
  }

  await resolveFlickrUrls(seasons, specials);

  const out = { show, seasons, specials };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  /* ---------- report ---------- */
  const totEp = seasons.reduce((a, s) => a + s.episodes.length, 0);
  const totLoc = seasons.reduce((a, s) => a + s.episodes.reduce((b, e) => b + e.locations.length, 0), 0);
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
  seasons.forEach(s => console.log(`  Season ${s.number}: ${s.episodes.length} episodes, ${s.episodes.reduce((b, e) => b + e.locations.length, 0)} locations`));
  console.log(`  Specials: ${specials.length}`);
  console.log(`  TOTAL: ${seasons.length} seasons · ${totEp} episodes · ${totLoc} locations`);
  if (unpublished) console.log(`  (${unpublished} location(s) hidden — Published not set to true)`);
  if (issues.length) {
    console.log(`\n⚠ ${issues.length} issue(s) to review:`);
    issues.slice(0, 50).forEach(i => console.log("  - " + i));
    if (issues.length > 50) console.log(`  …and ${issues.length - 50} more`);
  } else {
    console.log("\n✓ No issues flagged.");
  }
})().catch(e => { console.error("\n✗ " + e.message); process.exit(1); });
