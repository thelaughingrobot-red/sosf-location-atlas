#!/usr/bin/env python3
"""One-time import of the Google My Maps export into the editable CSVs.

Reads ~/Documents/Apps/SOSF/SOSF.csv (a My Maps WKT export), matches each
POINT to a Wikipedia episode by title (handling Season 1's Pilot off-by-one),
and writes data/csv/season-*.csv + tv-movies.csv.

  - LINESTRING / POLYGON features are skipped (drawn routes, not locations).
  - Timestamps normalized to hh:mm:ss.
  - Columns: Episode, Episode Title, Air Date, Description, Timestamp,
    Address, Latitude, Longitude, Notes, Then Image, Then Year, Now Image
    (Element is auto-generated at build time, so it's not a column.)

Run:  python3 tools/import-mymaps.py
"""
import csv, re, difflib, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MYMAPS = os.path.expanduser("~/Documents/Apps/SOSF/SOSF.csv")
CSV_DIR = os.path.join(HERE, "data", "csv")
HEADER = ["Episode", "Episode Title", "Air Date", "Description", "Timestamp",
          "Address", "Latitude", "Longitude", "Notes"]

# --- Wikipedia episode skeleton (number,title,airdate) from current CSVs ---
wiki = {}
for n in range(1, 6):
    rows = list(csv.DictReader(open(f"{CSV_DIR}/season-{n}.csv", encoding="utf-8")))
    wiki[n] = [(int(r["Episode"]), r["Episode Title"], r["Air Date"]) for r in rows if r.get("Episode")]
# Pilot = Season 1, Episode 0 (IMDB-style) — not a separate special.
if not any(e[0] == 0 for e in wiki[1]):
    wiki[1].append((0, "Pilot", "1972-09-16"))
for n in wiki:
    wiki[n].sort(key=lambda e: e[0])

def norm(s):
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"^the ", "", re.sub(r"\s+", " ", s).strip())

def match_ep(season, t):
    nt = norm(t)
    if not nt:
        return None, 0
    best, br = None, 0
    for ep, title, _ in wiki[season]:
        r = difflib.SequenceMatcher(None, nt, norm(title)).ratio()
        if r > br:
            br, best = r, ep
    return best, br

def fmt_time(l):
    m = re.search(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", l)
    if not m:
        return ""
    if m.group(3):                                   # h:mm:ss
        return f"{int(m.group(1)):02d}:{m.group(2)}:{m.group(3)}"
    return f"00:{int(m.group(1)):02d}:{m.group(2)}"   # mm:ss -> 00:mm:ss

# --- parse My Maps ---
lines = open(MYMAPS, encoding="utf-8", errors="replace").read().split("\n")
locs = []
cur = None
skipped_geom = 0
ptre = re.compile(r"POINT \(([-\d.]+) ([-\d.]+)\)")
sere = re.compile(r"Season\s*(\d+)\b.*?\bEp(?:isode)?\b\.?\s*[-:]?\s*(\d+)\s*[-:]?\s*(.*)", re.I)

for l in lines:
    if re.match(r'^\s*"?(LINESTRING|POLYGON|MULTI)', l, re.I):
        cur = None
        skipped_geom += 1
        continue
    if l.startswith("POINT"):
        m = ptre.search(l)
        coords = (round(float(m.group(2)), 6), round(float(m.group(1)), 6)) if m else None
        rest = l.split(",", 1)[1] if "," in l else ""
        sm = sere.search(rest)
        cur = None
        if sm:
            parts = [p.strip() for p in sm.group(3).split(",")]
            cur = dict(season=int(sm.group(1)), myep=int(sm.group(2)),
                       mytitle=parts[0] if parts else "",
                       desc=(parts[1] if len(parts) > 1 and parts[1] else (parts[0] if parts else "Unknown")),
                       coords=coords, time="", addr="", notes=[])
            locs.append(cur)
        else:
            locs.append(dict(season=None, myep=None, mytitle="", desc="(orphan)",
                             coords=coords, time="", addr="", notes=[], raw=l[:70]))
            cur = locs[-1]
    elif re.match(r'\s*"?\s*TIME', l, re.I) and cur is not None:
        t = fmt_time(l)
        if t and not cur["time"]:
            cur["time"] = t
    elif l.strip().strip(",").strip() and cur is not None and not re.search(r"Aired", l, re.I):
        t = l.strip().strip(",").strip()
        if re.search(r"\d+\s+\w+.*\b(St|Ave|Blvd|Street|Avenue|Boulevard|Dr|Rd|Way)\b", t) and not cur["addr"]:
            cur["addr"] = t
        else:
            cur["notes"].append(t)

# --- map each loc to (season,wikiEp) / pilot / flag ---
grouped, flags = {}, []
for L in locs:
    s = L["season"]
    if s is None:
        flags.append(("orphan", L.get("raw", ""))); continue
    if re.search(r"pilot", L["mytitle"], re.I) or (s == 1 and L["myep"] == 1):
        grouped.setdefault((1, 0), []).append(L); continue   # Pilot -> S1 E0
    te, r = match_ep(s, L["mytitle"])
    ep = te if (te and r >= 0.7) else ((L["myep"] - 1) if s == 1 else L["myep"])
    if not ep or ep < 1 or ep > len(wiki[s]):
        flags.append(("unplaceable", f"S{s} myEp{L['myep']} '{L['mytitle']}'")); continue
    grouped.setdefault((s, ep), []).append(L)

def jnotes(L):
    return "; ".join(L["notes"])[:300]

def loc_cols(L):
    la, lo = (L["coords"] or ("", ""))
    return [L["desc"], L["time"], L["addr"], la, lo, jnotes(L)]

placed = 0
for n in range(1, 6):
    out = [HEADER]
    for ep, title, date in wiki[n]:
        ls = sorted(grouped.get((n, ep), []), key=lambda L: (L["time"] == "", L["time"]))
        if ls:
            placed += len(ls)
            out.append([ep, title, date] + loc_cols(ls[0]))
            for L in ls[1:]:
                out.append(["", "", ""] + loc_cols(L))
        else:
            out.append([ep, title, date] + [""] * (len(HEADER) - 3))
    csv.writer(open(f"{CSV_DIR}/season-{n}.csv", "w", newline="", encoding="utf-8")).writerows(out)

# TV Movies (specials): Pilot + its locations, then the 1992 film
TV_HEADER = ["Title", "Air Date", "Description", "Timestamp", "Address",
             "Latitude", "Longitude", "Notes"]
tv = [TV_HEADER,
      ["Back to the Streets of San Francisco", "1992-01-27"] + [""] * (len(TV_HEADER) - 2)]
csv.writer(open(f"{CSV_DIR}/tv-movies.csv", "w", newline="", encoding="utf-8")).writerows(tv)

pilot_n = len(grouped.get((1, 0), []))
print(f"Skipped geometry features (linestrings/polygons): {skipped_geom}")
print(f"Placed into seasons (incl. {pilot_n} in S1 E0 Pilot): {placed} | flagged: {len(flags)}")
for f in flags:
    print("   -", f[0], "|", f[1])
