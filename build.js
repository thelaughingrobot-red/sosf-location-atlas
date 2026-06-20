#!/usr/bin/env node
/* ============================================================
   S/SF Location Atlas — static site generator
   Zero dependencies. Reads data/atlas.json, writes ./site/.
   Each entity becomes its own directory + index.html so the
   URL tree mirrors the taxonomy:  /season-2/episode-1/golden-gate-bridge/
   ============================================================ */
const fs = require("fs");
const path = require("path");
const cfg = require("./build.config.js");

const ROOT = __dirname;
const SRC = path.join(ROOT, cfg.srcDir);
const OUT = path.join(ROOT, cfg.outDir);
const BASE = cfg.baseUrl.endsWith("/") ? cfg.baseUrl : cfg.baseUrl + "/";

const data = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.dataFile), "utf8"));
const show = data.show;

/* ---------- helpers ---------- */
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (p) => BASE + String(p).replace(/^\/+/, "");
// cache-busting: a fresh token each build, appended to css/js links so the
// browser always re-fetches them after a rebuild (no more stale-cache surprises).
const BUILD = Date.now().toString(36);
const asset = (p) => url(p) + "?v=" + BUILD;
const sym = (s) => String(s || "").toUpperCase();              // GG, AS — caps display
const tileSym = (s) => {                                       // Gg, As — periodic display
  s = String(s || ""); return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : "";
};
const pad2 = (n) => String(n).padStart(2, "0");
const locPath = (s, e, l) => `season-${s}/episode-${e}/${l}/`;

function write(relDir, html) {
  const dir = path.join(OUT, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html.trim() + "\n");
}
function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, ent.name), d = path.join(to, ent.name);
    ent.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
const imgExists = (rel) => rel && fs.existsSync(path.join(SRC, "images", rel));
// Image paths from the sheet (Then Image / Now Image columns):
//   - Local path  e.g. "s1/e0/loc1-then.jpg"  → resolved relative to src/images/locations/
//   - External URL e.g. "https://live.staticflickr.com/…"  → used directly as <img src>
// Returns { src, external } or null (missing / local file not found).
function resolveImg(sheetPath) {
  if (!sheetPath) return null;
  if (/^https?:\/\//i.test(sheetPath)) return { src: sheetPath, external: true };
  const rel = "locations/" + String(sheetPath).trim().replace(/^\/+/, "");
  return imgExists(rel) ? { src: rel } : null;
}
function imgSrc(resolved) {
  if (!resolved) return null;
  return resolved.external ? resolved.src : url("assets/images/" + resolved.src);
}

/* ---------- derived counts ---------- */
const seasons = data.seasons;
let nEp = 0, nLoc = 0;
const points = [];
seasons.forEach((se) => {
  se.episodes.forEach((ep) => {
    nEp++;
    ep.locations.forEach((lo) => {
      nLoc++;
      points.push({
        id: `s${se.number}e${ep.number}-${lo.slug}`,
        name: lo.name, element: sym(lo.element),
        season: se.number, episode: ep.number,
        url: url(locPath(se.number, ep.number, lo.slug)),
        lat: Array.isArray(lo.coords) ? lo.coords[0] : null,
        lng: Array.isArray(lo.coords) ? lo.coords[1] : null
      });
    });
  });
});

/* ---------- shared chrome ---------- */
function head(title, extraHead = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(show.title)}</title>
<meta name="description" content="${esc(show.tagline)} — ${esc(show.title)}.">
<link rel="stylesheet" href="${asset("assets/css/theme.css")}">
<link rel="stylesheet" href="${asset("assets/css/styles.css")}">
${extraHead}
</head>
<body>`;
}

function nav(active) {
  const item = (key, label, href, icon) =>
    `<a class="nav__item" href="${href}"${active === key ? ' aria-current="page"' : ""}>${icon} ${label}</a>`;
  const grid = '<svg class="nav__ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="1.5" width="13" height="13"/><path d="M1.5 6h13M1.5 10.5h13M6 1.5v13M10.5 1.5v13"/></svg>';
  const home = '<svg class="nav__ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 7l6-5 6 5v7H2z"/></svg>';
  const mapi = '<svg class="nav__ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.5 3.5 6 2l4 1.5L14.5 2v10L10 13.5 6 12l-4.5 1.5zM6 2v10M10 3.5v10"/></svg>';
  return `<header class="masthead"><div class="shell masthead__inner">
  <a class="brand" href="${url("")}">
    <span class="brand__mark">S/SF</span>
    <span class="brand__name">${esc(show.title)} · ${esc(show.tagline)}</span>
  </a>
  <nav class="nav">
    ${item("index", "Index", url(""), home)}
    ${item("browse", "Browse", url("browse/"), grid)}
    ${item("map", "Map", url("map/"), mapi)}
  </nav>
</div></header>`;
}

function footer() {
  return `<footer class="foot"><div class="shell foot__inner">
  <span class="label">&copy; ${esc(show.footerNote)}</span>
  <span class="label">${esc(show.studio)} · ${esc(show.network)} · ${esc(show.years)}</span>
</div></footer>
</body></html>`;
}

/* ---------- periodic tiles ---------- */
const MAX_TILE_COLS = 7;   // periodic block max width; seasons up to ~28 episodes wrap into rows
function tilesGrid(html, count) {
  const cols = Math.min(Math.max(count, 1), MAX_TILE_COLS);
  return `<div class="tiles-scroll"><div class="tiles" style="--cols:${cols}">${html}</div></div>`;
}
function tile({ href, num, top, symbol, name }) {
  return `<a class="tile" href="${href}">
    <span class="tile__top"><span>${esc(num)}</span><span>${esc(top)}</span></span>
    <span class="tile__sym">${esc(symbol)}</span>
    <span class="tile__name">${esc(name)}</span>
  </a>`;
}

/* ============================================================
   PAGE: Home / Index
   ============================================================ */
function pageHome() {
  const seasonTiles = seasons.map((se) => {
    const eps = se.episodes.length;
    const locs = se.episodes.reduce((a, e) => a + e.locations.length, 0);
    return tile({
      href: url(`season-${se.number}/`),
      num: pad2(se.number),
      top: `${eps} EP · ${locs} LOC`,
      symbol: `S${se.number}`,
      name: se.title
    });
  }).join("");

  return head("Index") + nav("index") + `
<main class="page"><div class="shell">
  <div class="home__head">
    <span class="label eyebrow">${esc(show.volume)}</span>
    <span class="label">${esc(show.place)} · ${esc(show.placeCoords)}</span>
  </div>
  <h1 class="h-hero">The Streets<br><span class="of">of</span> San Francisco</h1>
  <p class="home__lede">${esc(show.intro)}</p>
  <div class="cta-row">
    <a class="btn btn--solid" href="${url("browse/")}"><svg class="btn__ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="1.5" width="13" height="13"/><path d="M1.5 6h13M1.5 10.5h13M6 1.5v13M10.5 1.5v13"/></svg>Browse index &rarr;</a>
    <a class="btn btn--ghost" href="${url("map/")}"><svg class="btn__ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.5 3.5 6 2l4 1.5L14.5 2v10L10 13.5 6 12l-4.5 1.5zM6 2v10M10 3.5v10"/></svg>Open map</a>
  </div>

  <section class="stats">
    <div class="stat"><span class="label">Seasons</span><div class="stat__n">${pad2(seasons.length)}</div></div>
    <div class="stat"><span class="label">Episodes</span><div class="stat__n">${pad2(nEp)}</div></div>
    <div class="stat"><span class="label">Locations</span><div class="stat__n">${pad2(nLoc)}</div></div>
  </section>

  <div class="section-head">
    <h2>Seasons</h2>
    <a class="label label--accent" href="${url("browse/")}">All seasons &rarr;</a>
  </div>
  ${tilesGrid(seasonTiles, seasons.length)}
</div></main>` + footer();
}

/* ============================================================
   PAGE: Browse (all seasons)
   ============================================================ */
function pageBrowse() {
  const seasonTiles = seasons.map((se) => {
    const eps = se.episodes.length;
    const locs = se.episodes.reduce((a, e) => a + e.locations.length, 0);
    return tile({
      href: url(`season-${se.number}/`), num: pad2(se.number),
      top: `${eps} EP · ${locs} LOC`, symbol: `S${se.number}`, name: se.title
    });
  }).join("");
  return head("Browse") + nav("browse") + `
<main class="page"><div class="shell">
  <a class="crumb" href="${url("")}">&lsaquo; Index</a>
  <span class="label eyebrow">Index / All Seasons</span>
  <h1 class="h-title">Browse the Atlas</h1>
  <div class="section-head"><h2>Seasons</h2></div>
  ${tilesGrid(seasonTiles, seasons.length)}
</div></main>` + footer();
}

/* ============================================================
   PAGE: Season detail
   ============================================================ */
function pageSeason(se) {
  const epTiles = se.episodes.map((ep) =>
    tile({
      href: url(`season-${se.number}/episode-${ep.number}/`),
      num: `EP ${pad2(ep.number)}`,
      top: `${ep.locations.length} LOC`,
      symbol: `E${ep.number}`,
      name: ep.title
    })).join("");
  return head(se.title) + nav("browse") + `
<main class="page"><div class="shell">
  <a class="crumb" href="${url("browse/")}">&lsaquo; All seasons</a>
  <span class="label eyebrow">Index / Season ${se.number}</span>
  <h1 class="h-title">${esc(se.title.toUpperCase())}</h1>
  <div class="section-head"><h2>Episodes</h2></div>
  ${tilesGrid(epTiles, se.episodes.length)}
</div></main>` + footer();
}

/* ============================================================
   PAGE: Episode detail
   ============================================================ */
function pageEpisode(se, ep) {
  const locTiles = ep.locations.map((lo, i) =>
    tile({
      href: url(locPath(se.number, ep.number, lo.slug)),
      num: pad2(i + 1),
      top: lo.timestamp || "",
      symbol: tileSym(lo.element),
      name: lo.name
    })).join("");
  return head(ep.title) + nav("browse") + `
<main class="page"><div class="shell">
  <a class="crumb" href="${url(`season-${se.number}/`)}">&lsaquo; Season ${se.number}</a>
  <span class="label eyebrow">Season ${se.number} · Episode ${ep.number}</span>
  <h1 class="h-title">${esc(ep.title.toUpperCase())}</h1>
  <div class="section-head"><h2>Locations</h2></div>
  ${ep.locations.length ? tilesGrid(locTiles, ep.locations.length)
    : `<p class="empty-note">No locations catalogued yet.</p>`}
</div></main>` + footer();
}

/* ============================================================
   PAGE: Location detail
   ============================================================ */
function imageBlock(lo, year) {
  const thenImg = resolveImg(lo.then && lo.then.src);
  const nowImg = resolveImg(lo.now && lo.now.src);
  const thenOk = !!thenImg, nowOk = !!nowImg;
  const thenSrc = imgSrc(thenImg);
  const nowSrc = imgSrc(nowImg);
  const thenYear = year || "";

  if (thenOk && nowOk) {
    // before/after wipe
    return `<div class="frame">
      <span class="frame__badge">Then${thenYear ? " · " + esc(thenYear) : ""}</span>
      <span class="frame__badge frame__badge--after">Now</span>
      <div class="compare">
        <img class="compare__before" src="${thenSrc}" alt="${esc(lo.name)} — then">
        <img class="compare__after"  src="${nowSrc}"  alt="${esc(lo.name)} — now">
        <span class="compare__line"></span>
        <span class="compare__grip">&harr;</span>
        <input class="compare__range" type="range" min="0" max="100" value="50"
               aria-label="Reveal before / after">
      </div>
    </div>`;
  }
  if (thenOk || nowOk) {
    const single = thenOk ? thenSrc : nowSrc;
    const badge = thenOk ? `Then${thenYear ? " · " + esc(thenYear) : ""}` : "Now";
    return `<div class="frame"><span class="frame__badge">${badge}</span>
      <img src="${single}" alt="${esc(lo.name)}"></div>`;
  }
  return `<div class="frame"><div class="placeholder">
      <span class="placeholder__sym">${esc(sym(lo.element))}</span>
      <span class="label">No screen grab yet</span>
    </div></div>`;
}

function pageLocation(se, ep, lo, idx, sibs) {
  const thenYear = (ep.airDate || "").slice(0, 4);
  // prev / next within the same episode
  const prev = idx > 0 ? sibs[idx - 1] : null;
  const next = sibs && idx < sibs.length - 1 ? sibs[idx + 1] : null;
  const lp = (l) => url(locPath(se.number, ep.number, l.slug));
  const locnav = sibs && sibs.length > 1 ? `
  <div class="locnav__count">${pad2(idx + 1)} / ${pad2(sibs.length)}</div>
  <nav class="locnav">
    ${prev ? `<a class="locnav__link locnav__prev" href="${lp(prev)}"><span class="locnav__dir">&larr; Prev location</span><span class="locnav__name">${esc(prev.name)}</span></a>` : `<span class="locnav__link"></span>`}
    ${next ? `<a class="locnav__link locnav__next" href="${lp(next)}"><span class="locnav__dir">Next location &rarr;</span><span class="locnav__name">${esc(next.name)}</span></a>` : `<span class="locnav__link"></span>`}
  </nav>` : "";
  const hasCoords = Array.isArray(lo.coords);
  const coordStr = hasCoords ? `${lo.coords[0].toFixed(4)}\u00b0 N · ${Math.abs(lo.coords[1]).toFixed(4)}\u00b0 W` : "";
  const coordDec = hasCoords ? `${lo.coords[0].toFixed(5)}, ${lo.coords[1].toFixed(5)}` : "—";

  const minimap = hasCoords ? `
  <section class="det__map">
    <span class="label eyebrow">Pinpoint</span>
    <div id="minimap" class="minimap"></div>
  </section>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function(){ if(typeof L==="undefined")return;
      var m=L.map("minimap",{scrollWheelZoom:false}).setView([${lo.coords[0]},${lo.coords[1]}],15);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{subdomains:"abcd",maxZoom:20,attribution:"&copy; OpenStreetMap contributors &copy; CARTO"}).addTo(m);
      L.marker([${lo.coords[0]},${lo.coords[1]}],{icon:L.divIcon({className:"",html:'<div class="marker-sq"></div>',iconSize:[14,14],iconAnchor:[7,7]})}).addTo(m);
    })();
  </script>` : "";

  return head(lo.name) + nav("browse") + `
<main class="page"><div class="shell">
  <a class="crumb" href="${url(`season-${se.number}/episode-${ep.number}/`)}">&lsaquo; S${se.number} · E${ep.number}</a>
  <div class="det__head">
    <div class="det__eyebrow-row">
      <span class="label eyebrow">Season ${pad2(se.number)} · Episode ${pad2(ep.number)} · ${esc(ep.title)}</span>
    </div>
    <div class="det__title-row">
      <span class="det__sym">${esc(sym(lo.element))}</span>
      <h1 class="h-hero" style="font-size:var(--fs-title)">${esc(lo.name.toUpperCase())}</h1>
    </div>
  </div>
  <hr class="det__rule">

  <div class="det__grid">
    <div>${imageBlock(lo, thenYear)}</div>
    <div>
      <span class="label eyebrow">Scene notes</span>
      <p class="notes-p">${esc(lo.notes || "—")}</p>
      <table class="meta">
        <tr><th>Address</th><td>${esc(lo.address || "—")}</td></tr>
        <tr><th>Timestamp</th><td class="mono">${esc(lo.timestamp || "—")}</td></tr>
        <tr><th>Air date</th><td class="mono">${esc(ep.airDate || "—")}</td></tr>
        <tr><th>Coords</th><td class="mono">${esc(coordDec)}</td></tr>
        <tr><th>Episode</th><td>S${se.number} · E${ep.number} — ${esc(ep.title)}</td></tr>
      </table>
    </div>
  </div>
  ${locnav}
  ${minimap}
</div></main>
<script src="${asset("assets/js/compare.js")}"></script>` + footer();
}

/* ============================================================
   PAGE: Map
   ============================================================ */
function pageMap() {
  const rows = points.map((p) => `
    <a class="map-row" data-id="${esc(p.id)}" data-season="${p.season}" data-episode="${p.episode}" href="${p.url}">
      <span class="map-row__id label">S${p.season} · E${p.episode} · ${esc(p.element)}</span>
      <span class="map-row__name">${esc(p.name)}</span>
    </a>`).join("");

  const seasonOpts = ['<option value="all">All seasons</option>']
    .concat(seasons.map((s) => `<option value="${s.number}">Season ${s.number}</option>`)).join("");
  const epNums = [...new Set(points.map((p) => p.episode))].sort((a, b) => a - b);
  const epOpts = ['<option value="all">All episodes</option>']
    .concat(epNums.map((n) => `<option value="${n}">Episode ${n}</option>`)).join("");

  const extraHead = `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>`;

  return head("Map", extraHead) + nav("map") + `
<main><div class="shell">
  <span class="label eyebrow" style="display:block;padding-top:1.5rem">Atlas / Coordinates</span>
  <div class="home__head" style="align-items:baseline">
    <h1 class="h-title">Map of the Streets</h1>
    <span class="label">${nLoc} locations · ${points.filter(p=>p.lat!=null).length} plotted</span>
  </div>
  <div class="filters">
    <select id="f-season" aria-label="Filter by season">${seasonOpts}</select>
    <select id="f-episode" aria-label="Filter by episode">${epOpts}</select>
  </div>
</div>
<div class="shell mapwrap">
  <div class="map"><div id="map"></div></div>
  <aside class="map-index">
    <div class="map-index__head"><span class="label">Index</span><div class="n">${nLoc} locations</div></div>
    ${rows}
  </aside>
</div></main>
<script>
  window.SOSF_DATA = ${JSON.stringify({ center: show.mapCenter, zoom: show.mapZoom })};
  window.SOSF_POINTS = ${JSON.stringify(points)};
</script>
<script src="${asset("assets/js/map.js")}"></script>` + footer();
}

/* ============================================================
   RUN
   ============================================================ */
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

// assets + images
copyDir(path.join(SRC, "assets"), path.join(OUT, "assets"));
copyDir(path.join(SRC, "images"), path.join(OUT, "assets", "images"));

// pages
write(".", pageHome());
write("browse", pageBrowse());
seasons.forEach((se) => {
  write(`season-${se.number}`, pageSeason(se));
  se.episodes.forEach((ep) => {
    write(`season-${se.number}/episode-${ep.number}`, pageEpisode(se, ep));
    ep.locations.forEach((lo, i) => {
      write(locPath(se.number, ep.number, lo.slug), pageLocation(se, ep, lo, i, ep.locations));
    });
  });
});
write("map", pageMap());

// report
let count = 0;
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) {
  if (e.isDirectory()) walk(path.join(d,e.name));
  else if (e.name === "index.html") count++;
}})(OUT);
console.log(`Built ${count} pages → ${cfg.outDir}/  (base "${BASE}")`);
console.log(`Seasons ${seasons.length} · Episodes ${nEp} · Locations ${nLoc}`);
