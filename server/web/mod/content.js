// Get content: download books, maps and place names from inside the app.
"use strict";
(() => {
  const PRESETS = [
    ["Small", "Fits a 32 GB card", ["wp-mini", "wikimed", "post-disaster", "water", "medicine", "food", "places"]],
    ["Medium", "Fits a 64 GB card or drive", ["wp-mini", "wikimed", "post-disaster", "water", "medicine", "food", "appropedia", "ifixit", "wikivoyage", "wiktionary", "places"]],
    ["Large", "Needs 128 GB", ["wp-nopic", "wikimed", "post-disaster", "water", "medicine", "food", "appropedia", "ifixit", "wikivoyage", "wiktionary", "wikibooks", "places"]]
  ];
  const DETAIL = [[15, "Streets and buildings (biggest)"], [14, "Streets (about half the size)"], [12, "Roads and towns (small)"]];
  const gb = (n) => n >= 1 ? `${n.toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.max(1, Math.round(n * 1000))} MB`;

  routes.content = (view) => {
    if (ROUGE.guest) { view.innerHTML = `<div class="page"><div class="empty"><h3>Downloads are managed on the device itself</h3></div></div>`; return; }
    view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><h1>Get content</h1>
      <p class="muted">Download books and maps while you have internet. Everything keeps working offline afterwards.</p></div>
      <div class="row" id="ct-status"></div></div>
      <div id="ct-jobs"></div><div id="ct-body"><p class="muted">Loading…</p></div></div>`;
    let data = null, alive = true, first = true;

    const sizeOf = (ids) => ids.reduce((s, id) => s + (id === "places" ? 0.03 : ((data.items.find((i) => i.id === id) || {}).gb || 0)), 0);
    const installedIds = () => new Set(data.items.filter((i) => i.installed).map((i) => i.id).concat(data.places ? ["places"] : []));

    async function start(body, label) {
      try {
        const r = await api("/api/content/download", { method: "POST", body });
        toast(r.queued ? `${label}: started` : "Nothing to download");
        (r.notes || []).forEach((n) => toast(n));
        refresh();
      } catch (e) { toast(e.message); }
    }
    function confirmStart(title, approxGB, body) {
      const free = data.free / 1e9;
      const tight = approxGB > free - 0.5;
      openModal(`<div class="dialog-pad"><h2>Download ${esc(title)}?</h2>
        <p class="muted">About <b>${gb(approxGB)}</b>. You have <b>${gb(free)}</b> free. ${tight ? `<span class="text-bad">That may not fit.</span>` : ""}</p>
        <p class="muted small">The exact size is checked before it starts. Big downloads can take hours; you can keep using R.O.U.G.E, and if the connection drops, press download again to continue where it stopped.</p>
        <div class="dialog-actions"><button class="btn btn-outline" data-x>Cancel</button><button class="btn" data-ok>${icon("download")} Download</button></div></div>`,
      (b, close) => {
        b.querySelector("[data-x]").onclick = close;
        b.querySelector("[data-ok]").onclick = () => { close(); start(body, title); };
      });
    }

    function drawStatus() {
      $("#ct-status").innerHTML = `${data.online ? `<span class="badge badge-ok">Online</span>` : `<span class="badge badge-warn">No internet</span>`}
        <span class="muted small">${fmtBytes(data.free)} free</span>`;
    }
    function drawJobs() {
      const box = $("#ct-jobs");
      const jobs = data.jobs.filter((j) => j.state !== "done" || Date.now() - Date.parse(j.started) < 6 * 3600e3).slice(0, 8);
      if (!jobs.length) { box.innerHTML = ""; return; }
      box.innerHTML = `<div class="card card-pad" style="margin-bottom:12px"><div class="card-head">${icon("download")}<h3>Downloads</h3></div>
        ${jobs.map((j) => {
          const pct = j.total ? Math.min(100, (j.done / j.total) * 100) : 0;
          const label = j.state === "running" ? (j.total ? `${fmtBytes(j.done)} of ${fmtBytes(j.total)} · ${pct.toFixed(0)}%` : j.done ? `${fmtBytes(j.done)}` : "Starting…")
            : j.state === "queued" ? "Waiting" : j.state === "done" ? "Done" : j.state === "cancelled" ? "Cancelled" : "Failed";
          return `<div class="job"><div class="row"><b class="grow truncate">${esc(j.title)}</b><span class="muted small">${label}</span>
            ${j.state === "running" || j.state === "queued" ? `<button class="btn btn-ghost btn-sm" data-cancel="${j.id}">${icon("x")}</button>` : ""}</div>
            ${j.state === "running" || j.state === "queued" ? `<div class="progress${j.total ? "" : " indeterminate"}"><div style="width:${j.total ? pct.toFixed(1) : 30}%"></div></div>` : ""}
            ${j.error ? `<div class="small text-bad">${esc(j.error)}</div>` : ""}</div>`;
        }).join("")}</div>`;
      fillIcons(box);
      box.querySelectorAll("[data-cancel]").forEach((b) => { b.onclick = async () => { await api("/api/content/cancel", { method: "POST", body: { id: b.dataset.cancel } }); refresh(); }; });
    }
    function itemRow(it) {
      const busy = data.jobs.some((j) => (j.state === "running" || j.state === "queued") && j.title === it.name);
      return `<div class="set-row"><div class="grow"><div class="row"><b>${esc(it.name)}</b><span class="muted small">~${gb(it.gb)}</span>
          ${it.installed ? `<span class="badge badge-ok">installed</span>` : ""}</div><div class="muted small">${esc(it.desc)}</div></div>
        <button class="btn ${it.installed ? "btn-outline" : ""} btn-sm" data-get="${it.id}" ${busy || !data.online ? "disabled" : ""}>${icon(it.installed ? "refresh" : "download")} ${busy ? "In progress" : it.installed ? "Update" : "Download"}</button></div>`;
    }
    function drawBody() {
      const have = installedIds();
      const home = ROUGE.config.home;
      $("#ct-body").innerHTML = `
        ${data.online ? "" : `<div class="alert alert-warn">${icon("wifi")}<div class="grow"><b>No internet connection.</b> Connect the Pi to Wi-Fi (the network icon at the top of the screen) or plug in Ethernet, then come back here.</div></div>`}
        ${data.engineMissing ? `<div class="alert alert-warn">${icon("map")}<div class="grow"><b>The map engine isn't downloaded yet.</b>
          <span class="muted">Maps need it once (about 3 MB). It downloads by itself when there's internet.</span></div>
          <button class="btn btn-sm" data-engine ${!data.online ? "disabled" : ""}>${icon("download")} Get it now</button></div>` : ""}
        <div class="card card-pad"><div class="card-head">${icon("box")}<h3 class="grow">Quick start</h3></div>
          <p class="muted small">One click downloads a ready-made set: Wikipedia, medical and survival books, and place names for map search. Add a map of your area below.</p>
          <div class="grid grid-3" style="margin-top:10px">${PRESETS.map(([name, sub, ids], i) => {
            const need = sizeOf(ids.filter((id) => !have.has(id)));
            return `<button class="card card-pad preset" data-preset="${i}" ${!data.online ? "disabled" : ""}><b>${name}</b><span class="muted small">${sub}</span>
              <span class="big-num" style="font-size:20px">${need < 0.05 ? "Done" : "~" + gb(need)}</span></button>`;
          }).join("")}</div></div>

        <div class="card" style="margin-top:12px"><div class="card-pad" style="padding-bottom:4px"><div class="card-head">${icon("map")}<h3>Maps</h3></div>
          <p class="muted small">Street maps from OpenStreetMap. Get your area in detail, plus the world overview.</p></div>
          <div class="set-row"><div class="grow"><b>A US state</b><div class="row" style="margin-top:6px;flex-wrap:wrap">
            <select class="select" id="ct-state">${data.states.map((s) => `<option value="${s.code}">${esc(s.name)}</option>`).join("")}</select>
            <select class="select" id="ct-z1">${DETAIL.map(([z, l]) => `<option value="${z}">${l}</option>`).join("")}</select></div></div>
            <button class="btn btn-sm" id="ct-state-go" ${!data.online ? "disabled" : ""}>${icon("download")} Download</button></div>
          <div class="set-row"><div class="grow"><b>Around ${home ? "home" : "a point"}</b><div class="row" style="margin-top:6px;flex-wrap:wrap">
            <input class="input" id="ct-ll" style="width:190px" placeholder="lat, lon e.g. 43.16, -77.61" value="${home ? `${home.lat.toFixed(4)}, ${home.lon.toFixed(4)}` : ""}">
            <select class="select" id="ct-r">${[10, 25, 50, 100].map((m) => `<option value="${m}" ${m === 25 ? "selected" : ""}>${m} miles around</option>`).join("")}</select>
            <select class="select" id="ct-z2">${DETAIL.map(([z, l]) => `<option value="${z}">${l}</option>`).join("")}</select></div></div>
            <button class="btn btn-sm" id="ct-pt-go" ${!data.online ? "disabled" : ""}>${icon("download")} Download</button></div>
          <div class="set-row"><div class="grow"><b>World overview</b><div class="muted small">Countries, cities and main roads everywhere. About 1 GB.</div></div>
            <button class="btn btn-sm" id="ct-world" ${!data.online ? "disabled" : ""}>${icon("download")} Download</button></div>
          <div class="set-row"><div class="grow"><div class="row"><b>Place names</b><span class="muted small">~30 MB</span>${data.places ? `<span class="badge badge-ok">installed</span>` : ""}</div>
            <div class="muted small">Lets you search towns on the map and in the search box.</div></div>
            <button class="btn btn-sm ${data.places ? "btn-outline" : ""}" data-get="places" ${!data.online ? "disabled" : ""}>${icon(data.places ? "refresh" : "download")} ${data.places ? "Update" : "Download"}</button></div>
        </div>

        <div class="card" style="margin-top:12px"><div class="card-pad" style="padding-bottom:4px"><div class="card-head">${icon("book")}<h3>Wikipedia</h3></div>
          <p class="muted small">Pick one. A newer download replaces the older copy automatically.</p></div>
          ${data.items.filter((i) => i.group === "Wikipedia").map(itemRow).join("")}</div>

        <div class="card" style="margin-top:12px"><div class="card-pad" style="padding-bottom:4px"><div class="card-head">${icon("cross")}<h3>Books and guides</h3></div></div>
          ${data.items.filter((i) => i.group === "Books").map(itemRow).join("")}</div>

        <div class="card" style="margin-top:12px"><div class="card-pad" style="padding-bottom:4px"><div class="card-head">${icon("disk")}<h3 class="grow">On this device</h3>
          <span class="muted small">${fmtBytes(data.free)} free</span></div></div>
          ${[...data.zims, ...data.maps].map((f) => `<div class="set-row"><span class="tool-icon">${icon(f.path.startsWith("maps/") ? "map" : "book")}</span>
            <div class="grow"><div class="truncate"><b>${esc(f.name)}</b></div><div class="muted small">${fmtBytes(f.size)}</div></div>
            <button class="btn btn-ghost btn-sm" data-del="${esc(f.path)}">${icon("trash")} Delete</button></div>`).join("") || `<p class="muted small card-pad">Nothing downloaded yet.</p>`}
        </div>`;
      fillIcons($("#ct-body"));
      const st = data.states.find((s) => s.code === store("content-state"));
      if (st) $("#ct-state").value = st.code;
      $("#ct-body").querySelectorAll("[data-get]").forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.get;
          if (id === "places") return start({ ids: ["places"] }, "Place names");
          const it = data.items.find((i) => i.id === id);
          confirmStart(it.name, it.gb, { ids: [id] });
        };
      });
      const eng = $("#ct-body").querySelector("[data-engine]");
      if (eng) eng.onclick = () => start({ ids: ["engine"] }, "Map engine");
      $("#ct-body").querySelectorAll("[data-preset]").forEach((b) => {
        b.onclick = () => {
          const [name, , ids] = PRESETS[+b.dataset.preset];
          const todo = ids.filter((id) => !have.has(id));
          if (!todo.length) return toast("You already have everything in this set");
          confirmStart(`the ${name} set`, sizeOf(todo), { ids: todo });
        };
      });
      const padBox = (s, p = 0.2) => s.split(",").map(Number).map((v, i) => i < 2 ? v - p : v + p);
      $("#ct-state-go").onclick = () => {
        const s = data.states.find((x) => x.code === $("#ct-state").value);
        store("content-state", s.code);
        const z = +$("#ct-z1").value;
        const b = padBox(s.bbox);
        const area = (b[2] - b[0]) * (b[3] - b[1]);
        confirmStart(`a map of ${s.name}`, Math.min(40, area * 0.012 * Math.pow(2, z - 15) + 0.05), { map: { name: s.name, bbox: b, maxzoom: z } });
      };
      $("#ct-pt-go").onclick = () => {
        const m = $("#ct-ll").value.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
        if (!m) return toast("Type the latitude and longitude, e.g. 43.16, -77.61");
        const lat = +m[1], lon = +m[2], mi = +$("#ct-r").value, z = +$("#ct-z2").value;
        const d = mi / 69, e = d / Math.cos(lat * Math.PI / 180);
        const b = [lon - e, lat - d, lon + e, lat + d];
        confirmStart(`a map ${mi} miles around ${lat.toFixed(2)}, ${lon.toFixed(2)}`, Math.min(20, (2 * d) * (2 * e) * 0.012 * Math.pow(2, z - 15) + 0.02),
          { map: { name: home && $("#ct-ll").value.startsWith(home.lat.toFixed(4)) ? "Home" : `Area ${lat.toFixed(2)} ${lon.toFixed(2)}`, bbox: b, maxzoom: z } });
      };
      $("#ct-world").onclick = () => confirmStart("the world overview map", 1, { map: { name: "World", bbox: [-180, -85, 180, 85], maxzoom: 6 } });
      $("#ct-body").querySelectorAll("[data-del]").forEach((b) => {
        b.onclick = async () => {
          if (!(await confirmDialog("Delete this file?", b.dataset.del.split("/")[1] + " will be removed from this device. You can download it again later."))) return;
          try { await api("/api/content/file?path=" + encodeURIComponent(b.dataset.del), { method: "DELETE" }); toast("Deleted"); refresh(); } catch (e) { toast(e.message); }
        };
      });
    }
    let lastKey = "";
    async function refresh() {
      const d = await api("/api/content").catch(() => null);
      if (!d || !alive || !$("#ct-body")) return;
      data = d;
      drawStatus(); drawJobs();
      // only redraw the lists when something changed, so selections aren't lost
      const key = JSON.stringify([d.online, d.engineMissing, d.items.map((i) => i.installed), d.zims, d.maps, d.places, d.jobs.map((j) => j.state)]);
      if (first || key !== lastKey) { first = false; lastKey = key; drawBody(); }
    }
    refresh();
    const t = setInterval(refresh, 2000);
    return () => { alive = false; clearInterval(t); };
  };

  window.contentButton = (label = "Get content") => ROUGE.guest ? "" : `<a class="btn btn-sm" href="#/content">${icon("download")} ${label}</a>`;
})();
