// Map tools (always on): coordinate formats, distance measuring, nearby places,
// and GPS position / trails when the GPS module is on.
"use strict";
(() => {
  const rad = Math.PI / 180;

  /* ---------- coordinates: decimal, DMS, UTM, MGRS (WGS84) ---------- */
  function toUTM(lat, lon) {
    let zone = Math.floor((lon + 180) / 6) + 1;
    if (zone > 60) zone = 60;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
    if (lat >= 72 && lat < 84) {
      if (lon >= 0 && lon < 9) zone = 31; else if (lon >= 9 && lon < 21) zone = 33;
      else if (lon >= 21 && lon < 33) zone = 35; else if (lon >= 33 && lon < 42) zone = 37;
    }
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const lon0 = ((zone - 1) * 6 - 180 + 3) * rad, phi = lat * rad;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lon * rad - lon0);
    const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
      - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
      + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
    const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    let Nn = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    if (lat < 0) Nn += 10000000;
    const band = "CDEFGHJKLMNPQRSTUVWXX"[Math.max(0, Math.min(20, Math.floor((lat + 80) / 8)))];
    return { zone, band, E, N: Nn };
  }
  function toMGRS(lat, lon) {
    if (lat < -80 || lat > 84) return "outside MGRS range";
    const u = toUTM(lat, lon);
    const set = u.zone % 6 || 6;
    const cols = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"][(set - 1) % 3];
    const rows = u.zone % 2 ? "ABCDEFGHJKLMNPQRSTUV" : "FGHJKLMNPQRSTUVABCDE";
    const col = cols[Math.floor(u.E / 100000) - 1];
    const row = rows[Math.floor(u.N / 100000) % 20];
    const e = String(Math.floor(u.E % 100000)).padStart(5, "0"), n = String(Math.floor(u.N % 100000)).padStart(5, "0");
    return `${u.zone}${u.band} ${col}${row} ${e} ${n}`;
  }
  const dms = (v, pos, neg) => {
    const h = v >= 0 ? pos : neg; v = Math.abs(v);
    const d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60;
    return `${d}°${String(m).padStart(2, "0")}′${s.toFixed(1).padStart(4, "0")}″${h}`;
  };
  const FORMATS = [
    ["Decimal", (la, lo) => `${la.toFixed(5)}, ${lo.toFixed(5)}`],
    ["DMS", (la, lo) => `${dms(la, "N", "S")} ${dms(lo, "E", "W")}`],
    ["UTM", (la, lo) => { const u = toUTM(la, lo); return `${u.zone}${u.band} ${Math.round(u.E)}E ${Math.round(u.N)}N`; }],
    ["MGRS", (la, lo) => toMGRS(la, lo)]
  ];
  let fmtIdx = Math.max(0, FORMATS.findIndex((f) => f[0] === store("coord-format")));
  window.fmtCoord = (la, lo) => FORMATS[fmtIdx][1](la, lo);
  window.nextCoordFormat = () => { fmtIdx = (fmtIdx + 1) % FORMATS.length; store("coord-format", FORMATS[fmtIdx][0]); toast(`Coordinates: ${FORMATS[fmtIdx][0]}`); };
  window.rougeCoords = { toUTM, toMGRS };

  /* ---------- distances ---------- */
  function haversine(a, b) {
    const R = 6371000, p1 = a[1] * rad, p2 = b[1] * rad, dp = (b[1] - a[1]) * rad, dl = (b[0] - a[0]) * rad;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    const p1 = a[1] * rad, p2 = b[1] * rad, dl = (b[0] - a[0]) * rad;
    const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }
  const compass = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  const imperial = () => (ROUGE.config.units || store("units") || "imperial") === "imperial";
  const fmtDist = (m) => imperial() ? (m >= 1609 ? `${(m / 1609.34).toFixed(m < 16093 ? 2 : 1)} mi` : `${Math.round(m * 3.281)} ft`)
    : (m >= 1000 ? `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km` : `${Math.round(m)} m`);

  /* ---------- nearby places from the offline map ---------- */
  const NEARBY = [
    ["medical", "Medical", "cross", ["hospital", "clinic", "doctors", "pharmacy", "dentist"]],
    ["water", "Water", "droplet", ["drinking_water", "water_point", "spring", "water_well"]],
    ["shelter", "Shelter", "tent", ["shelter", "community_centre", "townhall", "school", "place_of_worship"]],
    ["help", "Police & fire", "siren", ["police", "fire_station", "ranger_station"]],
    ["supplies", "Fuel & food", "utensils", ["fuel", "supermarket", "convenience", "grocery", "hardware", "marketplace"]]
  ];

  window.addEventListener("mapready", (ev) => {
    const { map, view, r, showTemp } = ev.detail;
    const row = view.querySelector("#m-toolrow");
    const side = document.createElement("div");
    side.className = "card map-panel map-side";
    side.hidden = true;
    view.querySelector(".map-wrap").appendChild(side);
    const cross = document.createElement("div");
    cross.className = "crosshair";
    cross.hidden = true;
    view.querySelector(".map-wrap").appendChild(cross);
    const btn = (id, ic, label) => {
      const b = document.createElement("button");
      b.className = "btn btn-outline"; b.id = id; b.innerHTML = `${icon(ic)} ${label}`;
      row.insertBefore(b, row.querySelector("#m-pins"));
      return b;
    };
    const overlays = {}; // id -> {data, layer}
    const setOverlay = (id, data, layer) => { overlays[id] = { data, layer }; drawOverlay(id); };
    const drawOverlay = (id) => {
      const o = overlays[id];
      if (!o || !map.isStyleLoaded()) return;
      if (map.getSource(id)) map.getSource(id).setData(o.data);
      else { map.addSource(id, { type: "geojson", data: o.data }); o.layer.forEach((l) => map.addLayer({ ...l, source: id })); }
    };
    map.on("style.load", () => Object.keys(overlays).forEach(drawOverlay));
    let panel = "";
    const openPanel = (name, html) => { panel = name; side.innerHTML = html; side.hidden = false; fillIcons(side); };
    const closePanel = () => { panel = ""; side.hidden = true; };

    /* --- measure --- */
    const mBtn = btn("m-measure", "ruler", "Measure");
    let measuring = false, pts = [];
    const lineLayers = (color) => [{ id: "measure-line", type: "line", paint: { "line-color": color, "line-width": 3, "line-dasharray": [2, 1] } },
      { id: "measure-pts", type: "circle", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": color, "circle-stroke-width": 2 } }];
    const drawMeasure = () => {
      const feats = pts.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p } }));
      if (pts.length > 1) feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: pts } });
      setOverlay("measure", { type: "FeatureCollection", features: feats }, lineLayers("#e11d48"));
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i]);
      const last = pts.length > 1 ? `${compass(bearing(pts[pts.length - 2], pts[pts.length - 1]))} ${Math.round(bearing(pts[pts.length - 2], pts[pts.length - 1]))}°` : "";
      openPanel("measure", `<div class="card-head">${icon("ruler")}<h3 class="grow">Measure</h3><button class="btn btn-ghost btn-sm btn-icon" data-close>${icon("x")}</button></div>
        <div class="big-num">${fmtDist(total)}</div><p class="muted small">${pts.length < 2 ? "Click or tap points on the map." : `${pts.length} points · last leg heading ${last}`}</p>
        <div class="row" style="margin-top:10px"><button class="btn btn-outline btn-sm" data-undo ${pts.length ? "" : "disabled"}>Undo</button>
        <button class="btn btn-outline btn-sm" data-clear ${pts.length ? "" : "disabled"}>Clear</button></div>`);
      side.querySelector("[data-close]").onclick = stopMeasure;
      side.querySelector("[data-undo]").onclick = () => { pts.pop(); drawMeasure(); };
      side.querySelector("[data-clear]").onclick = () => { pts = []; drawMeasure(); };
    };
    const stopMeasure = () => { measuring = false; window.mapBusy = false; mBtn.classList.remove("on"); pts = []; setOverlay("measure", { type: "FeatureCollection", features: [] }, lineLayers("#e11d48")); map.getCanvas().style.cursor = ""; if (panel === "measure") closePanel(); };
    mBtn.onclick = () => {
      if (measuring) return stopMeasure();
      stopNearby(); measuring = true; window.mapBusy = true; mBtn.classList.add("on"); map.getCanvas().style.cursor = "crosshair"; drawMeasure();
    };
    map.on("click", (e) => { if (measuring) { pts.push([e.lngLat.lng, e.lngLat.lat]); drawMeasure(); } });

    /* --- nearby --- */
    const nBtn = btn("m-nearby", "search", "Nearby");
    const stopNearby = () => { nBtn.classList.remove("on"); if (panel === "nearby") closePanel(); };
    const reference = async () => {
      if (isOn("gps")) {
        const f = await api("/api/gps").catch(() => null);
        if (f && f.mode >= 2) return { pt: [f.lon, f.lat], from: "your GPS position" };
      }
      return { pt: map.getCenter().toArray(), from: "the centre of the map" };
    };
    const nearbyMenu = () => {
      openPanel("nearby", `<div class="card-head">${icon("search")}<h3 class="grow">What's nearby?</h3><button class="btn btn-ghost btn-sm btn-icon" data-close>${icon("x")}</button></div>
        <div class="stack" style="gap:6px">${NEARBY.map(([k, label, ic]) => `<button class="btn btn-outline" style="justify-content:flex-start" data-k="${k}">${icon(ic)} ${label}</button>`).join("")}</div>
        <p class="muted small" style="margin-top:10px">Searches the offline map around your GPS position, or the centre of the map.</p>`);
      side.querySelector("[data-close]").onclick = stopNearby;
      side.querySelectorAll("[data-k]").forEach((b) => { b.onclick = () => findNearby(b.dataset.k); });
    };
    const findNearby = async (key) => {
      const [, label, ic, kinds] = NEARBY.find((n) => n[0] === key);
      const ref = await reference();
      openPanel("nearby", `<div class="card-head">${icon(ic)}<h3 class="grow">${label}</h3></div><p class="muted small">Looking…</p>`);
      map.jumpTo({ center: ref.pt, zoom: 14 });
      await new Promise((res) => { const done = () => res(); map.once("idle", done); setTimeout(done, 6000); });
      const seen = new Set(), found = [];
      for (const f of map.querySourceFeatures("base", { sourceLayer: "pois" })) {
        const p = f.properties || {};
        if (!kinds.includes(p.kind) || f.geometry.type !== "Point") continue;
        const c = f.geometry.coordinates;
        const name = p["name:en"] || p.name || p.kind.replace(/_/g, " ");
        const k = name + c[0].toFixed(4) + c[1].toFixed(4);
        if (seen.has(k)) continue;
        seen.add(k);
        found.push({ name, kind: p.kind.replace(/_/g, " "), c, d: haversine(ref.pt, c), b: bearing(ref.pt, c) });
      }
      found.sort((a, b) => a.d - b.d);
      openPanel("nearby", `<div class="card-head"><button class="btn btn-ghost btn-sm btn-icon" data-back>${icon("back")}</button>${icon(ic)}<h3 class="grow">${label}</h3>
        <button class="btn btn-ghost btn-sm btn-icon" data-close>${icon("x")}</button></div>
        <p class="muted small" style="margin-bottom:6px">Nearest to ${ref.from}</p>
        ${found.length ? found.slice(0, 12).map((x, i) => `<div class="list-item" data-i="${i}">${icon(ic)}<div class="grow"><div class="truncate">${esc(x.name)}</div>
          <div class="meta">${esc(x.kind)} · ${fmtDist(x.d)} ${compass(x.b)}</div></div></div>`).join("")
          : `<p class="muted small">Nothing found within the area loaded around this point. Try moving the map and searching again. Small places only appear on maps downloaded at zoom 15.</p>`}`);
      side.querySelector("[data-close]").onclick = stopNearby;
      side.querySelector("[data-back]").onclick = nearbyMenu;
      side.querySelectorAll("[data-i]").forEach((el) => {
        el.onclick = () => { const x = found[+el.dataset.i]; map.flyTo({ center: x.c, zoom: 16 }); showTemp(x.c[0], x.c[1], x.name); };
      });
    };
    nBtn.onclick = () => { if (panel === "nearby") return stopNearby(); stopMeasure(); nBtn.classList.add("on"); nearbyMenu(); };

    /* --- crosshair toggle via coordinates box --- */
    const coords = view.querySelector("#m-coords");
    coords.title = "Click to change format (decimal, DMS, UTM, MGRS)";
    cross.hidden = false;

    /* --- trail from ?track= --- */
    const trailLayers = [{ id: "trail-line", type: "line", paint: { "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.85 }, layout: { "line-cap": "round", "line-join": "round" } }];
    const tid = r.q.get("track");
    if (tid && isOn("gps")) {
      api(`/api/gps/tracks/${encodeURIComponent(tid)}`).then((t) => {
        const c = t.points.map((p) => [p.lon, p.lat]);
        if (!c.length) return toast("This trail has no points yet");
        setOverlay("trail", { type: "Feature", geometry: { type: "LineString", coordinates: c } }, trailLayers);
        const b = c.reduce((acc, p) => [Math.min(acc[0], p[0]), Math.min(acc[1], p[1]), Math.max(acc[2], p[0]), Math.max(acc[3], p[1])], [180, 90, -180, -90]);
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 16, duration: 0 });
        toast(`${t.name}: ${fmtDist(c.slice(1).reduce((s, p, i) => s + haversine(c[i], p), 0))}`);
      }).catch(() => toast("Trail not found"));
    }

    /* --- GPS position --- */
    let gpsTimer = null, marker = null, following = r.q.get("follow") === "1";
    if (isOn("gps")) {
      const gBtn = btn("m-gps", "crosshair", "Me");
      gBtn.title = "Show and follow my GPS position";
      const el = document.createElement("div");
      el.className = "gps-dot";
      const tick = async () => {
        const f = await api("/api/gps").catch(() => null);
        if (!f) return;
        const ok = f.mode >= 2;
        gBtn.classList.toggle("on", following && ok);
        if (!ok) { el.classList.add("stale"); return; }
        el.classList.remove("stale");
        if (!marker) marker = new maplibregl.Marker({ element: el }).setLngLat([f.lon, f.lat]).addTo(map);
        else marker.setLngLat([f.lon, f.lat]);
        if (following) map.easeTo({ center: [f.lon, f.lat], duration: 500 });
      };
      gBtn.onclick = async () => {
        const f = await api("/api/gps").catch(() => null);
        if (!f || f.mode < 2) return toast(f && f.device ? "No GPS fix yet: it needs a view of the sky" : "No GPS receiver found");
        following = !following;
        if (following) map.flyTo({ center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 15) });
        tick();
      };
      map.on("dragstart", () => { if (following) { following = false; gBtn.classList.remove("on"); } });
      tick();
      gpsTimer = setInterval(tick, 2000);
    }
    fillIcons(row);
    const gone = () => { clearInterval(gpsTimer); window.mapBusy = false; window.removeEventListener("mapgone", gone); };
    window.addEventListener("mapgone", gone);
  });
})();
