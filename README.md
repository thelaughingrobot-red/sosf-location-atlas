# S/SF — The Streets of San Francisco · Location Atlas

A static, generated site that catalogs the show's shooting locations by
**Season → Episode → Location**, plus a filterable map. No database, no API,
no build dependencies beyond Node. You edit one JSON file, drop in images,
run one command, and upload the result.

---

## How it works

`data/atlas.json` is the single source of truth. `build.js` reads it and
generates a directory tree where the URLs mirror the taxonomy:

```
site/
├─ index.html                         → Index (home)
├─ browse/index.html                  → all seasons
├─ season-2/index.html                → Season 2 (episode tiles)
├─ season-2/episode-1/index.html      → Episode 1 (location tiles)
├─ season-2/episode-1/golden-gate-bridge/index.html   → location detail
├─ map/index.html                     → filterable map
└─ assets/  (css, js, images — copied from src/)
```

Every page is real, standalone HTML. If one page breaks, the rest are
unaffected; everything renders with JavaScript off (the map and before/after
slider are the only JS-enhanced pieces, and they degrade gracefully).

---

## Build & preview

```bash
node build.js              # generates ./site
```

Preview locally over HTTP (needed because asset paths are root-absolute):

```bash
cd site && python3 -m http.server 8099
# open http://localhost:8099
```

Then upload the **contents of `site/`** to your server.

---

## Adding a location

In `data/atlas.json`, find the episode and add to its `locations` array:

```jsonc
{
  "slug": "ferry-building",          // becomes the URL folder; lowercase, hyphens
  "name": "Ferry Building",
  "element": "Fb",                   // 2-letter periodic tag (you choose it)
  "timestamp": "00:42:10",           // scene timecode (optional)
  "address": "1 Ferry Building, San Francisco, CA",
  "coords": [37.7955, -122.3937],    // [lat, lng] — omit/null to skip the map pin
  "notes": "Foot chase along the Embarcadero.",
  "then": { "src": "locations/ferry-building/then.jpg", "year": "1974" },
  "now":  { "src": "locations/ferry-building/now.jpg" }   // or null
}
```

Then add the images under `src/images/locations/ferry-building/` and rebuild.

### Images & the before/after slider
- **Both `then` and `now` present** → draggable before/after wipe.
- **One present** → single image with a THEN or NOW badge.
- **Neither** → a clean placeholder showing the element tag.

Image paths are relative to `src/images/`. JPG, PNG, WebP, or SVG all work;
WebP is recommended for size. If a referenced file is missing, the page falls
back to the placeholder rather than breaking.

### Getting coordinates for address-only spots
Right-click the spot in any map app → copy the lat/long → paste into `coords`.
Until you add coordinates, the location still gets a full page; it just won't
drop a pin on the map.

---

## Theming

Open `src/assets/css/theme.css`. Everything visual is a token at the top —
swap the six core colors and the whole atlas re-skins:

```css
--bg:       #f2ede5;   /* page background  */
--ink:      #2b211b;   /* text             */
--accent:   #ce451c;   /* links / active   */
--muted:    #9d9288;   /* labels           */
--hairline: #c6bbae;   /* cell borders     */
--rule:     #2b211b;   /* strong rules     */
```

A starter dark theme is included: set `<html data-theme="night">`.

---

## Hosting in a subfolder

If the site lives at `https://example.com/sosf/` instead of the domain root,
set `baseUrl` in `build.config.js` to `"/sosf/"` and rebuild. All asset and
internal links are prefixed accordingly.

---

## Map

Uses Leaflet + OpenStreetMap tiles — free, no API key. Leaflet loads from a
CDN (unpkg). If you'd rather self-host it, drop `leaflet.js`/`leaflet.css`
into `src/assets/` and update the two `<script>`/`<link>` references in
`build.js`. Markers are styled in `theme.css` via `.marker-sq`.

---

## Notes on the sample data

Seasons 1–2 and the six locations are filled in to demonstrate every state
(before/after, single image, placeholder, coords vs none). Episode titles and
air dates are placeholders for you to correct. The show ran 5 seasons
(1972–1977) — add seasons 3–5 the same way.
