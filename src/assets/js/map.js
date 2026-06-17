/* Map view. Expects two globals injected by the build:
     window.SOSF_DATA   = { center:[lat,lng], zoom:n }
     window.SOSF_POINTS = [{ id, name, url, season, episode, element, lat, lng }]
   Locations without coordinates are listed but not plotted. */
(function () {
  if (typeof L === "undefined") return;
  var data = window.SOSF_DATA || { center: [37.7749, -122.4194], zoom: 13 };
  var points = (window.SOSF_POINTS || []).filter(function (p) {
    return typeof p.lat === "number" && typeof p.lng === "number";
  });

  var map = L.map("map", { scrollWheelZoom: true }).setView(data.center, data.zoom);
  // CARTO Positron — minimal light/grayscale basemap (free, no API key)
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);

  function squareIcon() {
    return L.divIcon({ className: "", html: '<div class="marker-sq"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
  }

  var markers = {};
  points.forEach(function (p) {
    var m = L.marker([p.lat, p.lng], { icon: squareIcon() }).addTo(map);
    m.bindPopup('<strong>' + p.name + '</strong><br>S' + p.season + ' · E' + p.episode +
      '<br><a href="' + p.url + '">Open location &rarr;</a>');
    m.on("click", function () { setActive(p.id); });
    markers[p.id] = { marker: m, point: p };
  });

  function setActive(id) {
    document.querySelectorAll(".map-row").forEach(function (r) {
      r.classList.toggle("is-active", r.getAttribute("data-id") === id);
    });
    var row = document.querySelector('.map-row[data-id="' + id + '"]');
    if (row) row.scrollIntoView({ block: "nearest" });
  }

  // sidebar rows -> pan & open
  document.querySelectorAll(".map-row").forEach(function (row) {
    row.addEventListener("click", function () {
      var id = row.getAttribute("data-id");
      var entry = markers[id];
      if (entry) { map.setView(entry.marker.getLatLng(), 15); entry.marker.openPopup(); setActive(id); }
    });
  });

  // filters
  var fSeason = document.getElementById("f-season");
  var fEpisode = document.getElementById("f-episode");

  function applyFilters() {
    var s = fSeason ? fSeason.value : "all";
    var e = fEpisode ? fEpisode.value : "all";
    Object.keys(markers).forEach(function (id) {
      var p = markers[id].point;
      var show = (s === "all" || String(p.season) === s) &&
                 (e === "all" || String(p.episode) === e);
      if (show) { markers[id].marker.addTo(map); } else { map.removeLayer(markers[id].marker); }
    });
    document.querySelectorAll(".map-row").forEach(function (row) {
      var rs = row.getAttribute("data-season"), re = row.getAttribute("data-episode");
      var show = (s === "all" || rs === s) && (e === "all" || re === e);
      row.style.display = show ? "" : "none";
    });
  }
  if (fSeason) fSeason.addEventListener("change", applyFilters);
  if (fEpisode) fEpisode.addEventListener("change", applyFilters);
})();
