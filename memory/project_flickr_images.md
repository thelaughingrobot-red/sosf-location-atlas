---
name: project_flickr_images
description: Flickr image hosting wired up — paste Flickr photo page URL directly into sheet, build resolves via oEmbed
metadata:
  type: project
---

Flickr image hosting is fully implemented (as of 2026-06-17).

**Workflow:** Copy the URL from the browser address bar on any Flickr photo page (e.g. `https://www.flickr.com/photos/d3bas3r/54241669332/in/album-...`) and paste it directly into the `Then Image` or `Now Image` column in the Sheet. No downloading needed.

**How it works:**
- `csv-to-json.js` detects Flickr photo page URLs (`flickr.com/photos/…`) and calls Flickr's free oEmbed API to resolve them to direct `live.staticflickr.com` image URLs
- Resolved URLs are cached in `data/flickr-cache.json` (keyed by page URL) so repeat builds skip the API call
- `build.js` `resolveImg()` detects any `https://` URL and passes it through as `{ src, external: true }` rather than looking for a local file
- Both local paths (e.g. `s1/e0/loc1-then.jpg`) and external URLs work; before/after slider works with either

**User's Flickr album:** Photos already uploaded with naming convention matching the Atlas (e.g. `s1-ep0-loc-1`)

**Why:** User uploads screenshots/photos to Flickr and wants to reference them without downloading files to the project.
