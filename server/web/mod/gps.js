// GPS module: position, satellites, trail recording.
"use strict";
(() => {
  toolRoutes.gps = true;
  const fixText = (f) => !f.connected ? "GPS service not running" : !f.device ? "No GPS receiver plugged in"
    : f.mode >= 3 ? `3D fix · ${f.sats} satellites` : f.mode === 2 ? `2D fix · ${f.sats} satellites` : `Searching… ${f.satsSeen || 0} satellites seen`;
  toolStatus.gps = async () => fixText(await api("/api/gps"));
  const units = () => ROUGE.config.units || "imperial";
  const dist = (m) => units() === "imperial" ? (m >= 1609 ? `${(m / 1609.34).toFixed(2)} mi` : `${Math.round(m * 3.281)} ft`) : (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  const alt = (m) => units() === "imperial" ? `${Math.round(m * 3.281)} ft` : `${Math.round(m)} m`;
  const speed = (ms) => units() === "imperial" ? `${(ms * 2.237).toFixed(1)} mph` : `${(ms * 3.6).toFixed(1)} km/h`;

  routes.gps = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")}</a>
      <div class="grow"><h1>GPS</h1><p class="muted" id="g-sub"></p></div><a class="btn btn-outline" href="#/maps?follow=1">${icon("map")} Show on map</a></div>
      <div class="grid grid-2"><div class="card card-pad" id="g-fix"></div><div class="card card-pad" id="g-rec"></div></div>
      <div class="card" style="margin-top:12px" id="g-tracks"></div></div>`;
    const draw = async () => {
      const f = await api("/api/gps").catch(() => null);
      if (!f || !$("#g-fix")) return;
      $("#g-sub").textContent = fixText(f);
      const ok = f.mode >= 2;
      $("#g-fix").innerHTML = `<div class="card-head">${icon("crosshair")}<h3 class="grow">Position</h3>
          <span class="badge ${ok ? "badge-ok" : "badge-warn"}">${ok ? (f.mode >= 3 ? "3D fix" : "2D fix") : "no fix"}</span></div>
        ${ok ? `<div class="big-num mono" style="font-size:22px">${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}</div>
          <div class="kv"><span>Altitude</span><span>${alt(f.alt)}</span></div><div class="kv"><span>Speed</span><span>${speed(f.speed)}</span></div>
          <div class="kv"><span>Heading</span><span>${Math.round(f.track)}°</span></div><div class="kv"><span>Satellites used</span><span>${f.sats} of ${f.satsSeen}</span></div>
          <div class="kv"><span>GPS time</span><span>${f.time ? new Date(f.time).toLocaleString() : "–"}</span></div>`
        : `<p class="muted small">${!f.connected ? "The GPS service (gpsd) isn't running. Run rouge-setup and select GPS." : !f.device ? "Plug in a USB GPS receiver. It can take a minute to be recognized."
          : "Getting a first fix can take a few minutes. Get a clear view of the sky: near a window is OK, outside is best."}</p>`}`;
      fillIcons($("#g-fix"));
      $("#g-rec").innerHTML = `<div class="card-head">${icon("navigation")}<h3 class="grow">Record a trail</h3>${f.recording ? `<span class="badge badge-bad">recording</span>` : ""}</div>
        <p class="muted small">Saves a point every 10 metres you move, so you can see where you've been and find your way back. Trails can be exported as GPX.</p>
        <div class="row" style="margin-top:12px">${f.recording ? `<button class="btn btn-destructive" id="g-stop">${icon("stop")} Stop recording</button>`
          : `<input class="input grow" id="g-name" placeholder="Trail name (optional)"><button class="btn" id="g-start">${icon("play")} Start</button>`}</div>`;
      fillIcons($("#g-rec"));
      const st = $("#g-start"), sp = $("#g-stop");
      if (st) st.onclick = async () => { await api("/api/gps/record", { method: "POST", body: { on: true, name: $("#g-name").value } }); draw(); tracks(); };
      if (sp) sp.onclick = async () => { await api("/api/gps/record", { method: "POST", body: { on: false } }); draw(); tracks(); };
    };
    const tracks = async () => {
      const list = await api("/api/gps/tracks").catch(() => []);
      const box = $("#g-tracks");
      if (!box) return;
      box.innerHTML = `<div class="card-pad" style="padding-bottom:0"><div class="card-head">${icon("map")}<h3>Saved trails</h3></div></div>` + (list.length
        ? `<table class="table">${list.map((t) => `<tr><td><b>${esc(t.name)}</b><div class="muted small">${new Date(t.started).toLocaleString()}</div></td>
            <td>${dist(t.meters)}</td><td class="muted">${t.points} points</td><td><div class="row" style="justify-content:flex-end">
            <a class="btn btn-ghost btn-sm" href="#/maps?track=${t.id}">${icon("map")} Map</a><a class="btn btn-ghost btn-sm" href="/api/gps/tracks/${t.id}.gpx">${icon("download")} GPX</a>
            <button class="btn btn-ghost btn-sm" data-del="${t.id}">${icon("trash")}</button></div></td></tr>`).join("")}</table>`
        : `<p class="muted small card-pad">No trails yet.</p>`);
      fillIcons(box);
      box.querySelectorAll("[data-del]").forEach((b) => { b.onclick = async () => {
        if (!(await confirmDialog("Delete this trail?", ""))) return;
        await api(`/api/gps/tracks/${b.dataset.del}`, { method: "DELETE" }); tracks(); }; });
    };
    draw(); tracks();
    const t = setInterval(draw, 2000);
    return () => clearInterval(t);
  };
})();
