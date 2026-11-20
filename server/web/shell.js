// R.O.U.G.E shell: modules, sidebar, Tools, Settings, custom modules, startup.
"use strict";

const ROUGE = { modules: [], plugins: [], guest: false, config: {}, version: "" };
window.toolRoutes = window.toolRoutes || {};   // id -> true for pages that live under Tools
window.toolStatus = window.toolStatus || {};   // id -> async () => short status text
window.homeHooks = window.homeHooks || [];     // fn(view) -> cleanup, adds cards to Home
const isOn = (id) => ROUGE.modules.some((m) => m.id === id && m.enabled);

/* ---------- small shared UI ---------- */
function switchHTML(id, on, disabled) {
  return `<button class="switch${on ? " on" : ""}" role="switch" aria-checked="${on}" data-switch="${esc(id)}" ${disabled ? "disabled" : ""}><span></span></button>`;
}
function homeCard(view, html) {
  const box = view.querySelector("#home-extra");
  if (!box) return null;
  const el = document.createElement("div");
  el.className = "card card-pad";
  el.innerHTML = html;
  fillIcons(el);
  box.appendChild(el);
  return el;
}
function homeAlert(view, key, html, kind = "warn") {
  const box = view.querySelector("#home-alerts");
  if (!box) return null;
  let el = box.querySelector(`[data-alert="${key}"]`);
  if (!html) { el && el.remove(); return null; }
  if (!el) { el = document.createElement("div"); el.dataset.alert = key; box.appendChild(el); }
  el.className = `alert alert-${kind}`;
  el.innerHTML = html;
  fillIcons(el);
  return el;
}
function pad2(n) { return String(n).padStart(2, "0"); }
function setTimeDialog() {
  const d = new Date();
  openModal(`<div class="dialog-pad"><h2>Set the clock</h2>
    <p class="muted small">Without internet or a GPS, a Raspberry Pi 4 can't keep time while it's off. Enter the current date and time.</p>
    <div class="row" style="margin-top:12px"><input class="input" type="date" id="st-d" value="${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}">
    <input class="input" type="time" id="st-t" value="${pad2(d.getHours())}:${pad2(d.getMinutes())}"></div>
    <div class="dialog-actions"><button class="btn btn-outline" data-x>Cancel</button><button class="btn" data-ok>Set time</button></div></div>`,
  (b, close) => {
    b.querySelector("[data-x]").onclick = close;
    b.querySelector("[data-ok]").onclick = async () => {
      const t = `${b.querySelector("#st-d").value} ${b.querySelector("#st-t").value}:00`;
      try { await api("/api/system", { method: "POST", body: { action: "settime", time: t } }); toast("Clock set"); close(); pollStatus(); }
      catch (e) { toast(e.message); }
    };
  });
}

/* ---------- sidebar ---------- */
function buildNav() {
  const items = [["home", "home", "Home"]];
  for (const m of ROUGE.modules) if (m.enabled && m.group === "main" && m.id === "guide") items.push([m.id, m.icon, m.name]);
  items.push(["library", "book", "Library"], ["maps", "map", "Maps"]);
  if (!ROUGE.guest) items.push(["notes", "note", "Notes"]);
  for (const m of ROUGE.modules) if (m.enabled && m.group === "main" && m.id !== "guide") items.push([m.id, m.icon, m.name]);
  const tools = ROUGE.modules.some((m) => m.enabled && m.group !== "main") || ROUGE.plugins.some((p) => p.enabled);
  if (tools) items.push(["tools", "grid", "Tools"]);
  $("#nav").innerHTML = items.map(([r, ic, label]) => `<a href="#/${r}" data-route="${r}">${icon(ic)}<span>${esc(label)}</span></a>`).join("");
  $("#open-settings").hidden = ROUGE.guest;
  if (ROUGE.guest) $("#open-settings").remove();
}

/* ---------- Tools ---------- */
routes.tools = (view) => {
  const list = [
    ...ROUGE.modules.filter((m) => m.enabled && m.group !== "main").map((m) => ({ ...m, href: `#/${m.id}` })),
    ...ROUGE.plugins.filter((p) => p.enabled).map((p) => ({ ...p, href: `#/x/${p.id}`, custom: true }))
  ];
  view.innerHTML = `<div class="page">
    <div class="page-head"><div class="grow"><h1>Tools</h1><p class="muted">Everything else R.O.U.G.E can do.</p></div></div>
    <div class="grid grid-3">${list.map((m) => `<a class="card card-pad tool-card" href="${m.href}">
      <div class="row"><span class="tool-icon">${icon(ICONS[m.icon] ? m.icon : "puzzle")}</span>
        <div class="grow"><h3>${esc(m.name)}</h3><div class="muted small truncate" data-st="${esc(m.id)}">${m.hardware ? esc(m.hardware) : m.custom ? "Custom module" : ""}</div></div></div>
      <p class="muted small" style="margin-top:10px">${esc(m.desc || "")}</p></a>`).join("")}
    ${ROUGE.guest ? "" : `<a class="card card-pad tool-card tool-add" href="#/settings">
      <div class="row"><span class="tool-icon">${icon("plus")}</span><div class="grow"><h3>Add or remove tools</h3>
      <div class="muted small">Settings → Modules</div></div></div>
      <p class="muted small" style="margin-top:10px">Turn modules on or off, or add a custom module of your own.</p></a>`}</div></div>`;
  let alive = true;
  const refresh = () => list.forEach(async (m) => {
    const fn = window.toolStatus[m.id];
    if (!fn) return;
    try {
      const txt = await fn();
      const el = alive && view.querySelector(`[data-st="${m.id}"]`);
      if (el && txt) el.textContent = txt;
    } catch (e) {}
  });
  refresh();
  const t = setInterval(refresh, 5000);
  return () => { alive = false; clearInterval(t); };
};

/* ---------- custom modules (plugins) ---------- */
routes.x = (view, r) => {
  const p = ROUGE.plugins.find((x) => x.id === r.arg && x.enabled);
  if (!p) { view.innerHTML = `<div class="page"><div class="empty"><h3>Module not found</h3><p class="muted">It may be turned off in Settings.</p></div></div>`; return; }
  view.style.overflow = "hidden";
  view.innerHTML = `<div class="plugin-page"><div class="reader-bar"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")} Tools</a>
    <span class="grow" style="font-weight:600">${esc(p.name)}</span><span class="muted small">custom module${p.version ? " · v" + esc(p.version) : ""}</span></div>
    <iframe src="/m/${encodeURIComponent(p.id)}/${p.entry.split("/").map(encodeURIComponent).join("/")}" title="${esc(p.name)}"></iframe></div>`;
  return () => { view.style.overflow = ""; };
};
toolRoutes.x = true;

/* ---------- Settings ---------- */
routes.settings = (view) => {
  if (ROUGE.guest) { view.innerHTML = `<div class="page"><div class="empty"><h3>Settings are on the device itself</h3></div></div>`; return; }
  const groups = [["main", "Main pages"], ["tool", "Tools"], ["hardware", "Hardware add-ons"]];
  const c = ROUGE.config;
  view.innerHTML = `<div class="page settings">
    <div class="page-head"><div class="grow"><h1>Settings</h1><p class="muted">Modules, your household and this device.</p></div></div>
    <div class="card"><div class="card-pad"><div class="card-head">${icon("grid")}<h3 class="grow">Modules</h3></div>
      <p class="muted small">Turn parts of R.O.U.G.E on or off. Turning one off hides it; nothing is deleted. Modules marked "Needs setup" need
      software installed once with internet: run <span class="code">rouge-setup</span> and select them.</p></div>
      ${groups.map(([g, label]) => `<div class="set-group">${label}</div>` + ROUGE.modules.filter((m) => m.group === g).map((m) => `
        <div class="set-row"><span class="tool-icon">${icon(m.icon)}</span><div class="grow"><div class="row"><b>${esc(m.name)}</b>
          ${m.enabled && !m.ready ? `<span class="badge badge-warn">Needs setup</span>` : ""}</div>
          <div class="muted small">${esc(m.desc)}${m.hardware ? ` <span class="nowrap">Needs: ${esc(m.hardware)}.</span>` : ""}</div>
          ${m.enabled && !m.ready ? `<div class="small" style="color:hsl(var(--warning));margin-top:2px">${esc(m.need)}</div>` : ""}</div>
          ${switchHTML(m.id, m.enabled)}</div>`).join("")).join("")}
      <div class="set-group">Custom modules</div>
      ${ROUGE.plugins.length ? ROUGE.plugins.map((p) => `<div class="set-row"><span class="tool-icon">${icon(ICONS[p.icon] ? p.icon : "puzzle")}</span>
        <div class="grow"><b>${esc(p.name)}</b>${p.version ? ` <span class="muted small">v${esc(p.version)}</span>` : ""}<div class="muted small">${esc(p.desc || "")}</div></div>
        ${switchHTML(p.id, p.enabled)}</div>`).join("") : ""}
      <div class="set-row"><span class="tool-icon">${icon("plus")}</span><div class="grow"><b>Add a module</b>
        <div class="muted small">A custom module is a folder with a <span class="code">module.json</span> and a web page. Install one with
        <span class="code">rouge-setup add /path/to/folder</span>, or copy it into <span class="code">${esc((lastStatus && lastStatus.dataDir) || "~/rouge")}/modules/</span> and reload.
        See MODULES.md in the project to write your own.</div></div></div>
    </div>

    <div class="card card-pad" style="margin-top:12px"><div class="card-head">${icon("users")}<h3>Household and location</h3></div>
      <div class="form-grid">
        <label>People in your household<input class="input" type="number" min="1" max="100" id="s-house" value="${c.household || 2}"></label>
        <label>Units<select class="select" id="s-units"><option value="imperial">Miles, °F, gallons</option><option value="metric">Kilometres, °C, litres</option></select></label>
        <label>Home latitude<input class="input" id="s-lat" inputmode="decimal" placeholder="e.g. 43.1566" value="${c.home ? c.home.lat : ""}"></label>
        <label>Home longitude<input class="input" id="s-lon" inputmode="decimal" placeholder="e.g. -77.6088" value="${c.home ? c.home.lon : ""}"></label>
        <label>Altitude (metres, for the barometer)<input class="input" type="number" id="s-alt" value="${c.altitudeM || 0}"></label>
      </div>
      <p class="muted small" style="margin-top:8px">Home location is used for sunrise and sunset. Tip: on the map, open a pin and choose "Set as home".</p>
      <div class="row" style="margin-top:12px"><button class="btn" id="s-save">Save</button>${isOn("gps") ? `<button class="btn btn-outline" id="s-gps">${icon("crosshair")} Use GPS position</button>` : ""}</div>
    </div>

    <div class="card card-pad" style="margin-top:12px"><div class="card-head">${icon("clock")}<h3 class="grow">Clock</h3><span class="mono small" id="s-now"></span></div>
      <p class="muted small">If the time is wrong after the Pi was unplugged, set it here. A GPS or an internet connection sets it automatically.</p>
      <div class="row" style="margin-top:10px"><button class="btn btn-outline" id="s-time">${icon("clock")} Set time</button></div></div>

    <div class="card card-pad" style="margin-top:12px"><div class="card-head">${icon("power")}<h3 class="grow">This device</h3><span class="muted small">R.O.U.G.E ${esc(ROUGE.version)}</span></div>
      <div class="set-row" style="padding:6px 0"><div class="grow"><b>Start at power-on</b><div class="muted small">Open R.O.U.G.E full screen whenever the Pi is switched on.
        Press F11 to leave full screen; Alt+F4 closes the window.</div></div><span id="s-auto"></span></div>
      <div class="kv"><span>Data folder</span><span class="mono small">${esc((lastStatus && lastStatus.dataDir) || "")}</span></div>
      <div class="row" style="margin-top:10px"><button class="btn btn-outline" id="s-reboot">${icon("refresh")} Restart Pi</button>
      <button class="btn btn-destructive" id="s-off">${icon("power")} Shut down</button></div></div>
  </div>`;
  $("#s-units").value = c.units || "imperial";
  view.querySelectorAll("[data-switch]").forEach((sw) => {
    sw.onclick = async () => {
      const on = !sw.classList.contains("on");
      sw.disabled = true;
      try {
        await api(`/api/modules/${sw.dataset.switch}`, { method: "PUT", body: { enabled: on } });
        sessionStorage.setItem("rouge-after-reload", "#/settings");
        location.reload();
      } catch (e) { toast(e.message); sw.disabled = false; }
    };
  });
  $("#s-save").onclick = async () => {
    const lat = parseFloat($("#s-lat").value), lon = parseFloat($("#s-lon").value);
    const body = { household: +$("#s-house").value, units: $("#s-units").value, altitudeM: +$("#s-alt").value || 0,
      home: !isNaN(lat) && !isNaN(lon) ? { lat, lon } : null };
    try { ROUGE.config = await api("/api/config", { method: "PUT", body }); store("units", body.units); toast("Saved"); }
    catch (e) { toast(e.message); }
  };
  if ($("#s-gps")) $("#s-gps").onclick = async () => {
    const f = await api("/api/gps").catch(() => null);
    if (!f || f.mode < 2) return toast("No GPS fix yet");
    $("#s-lat").value = f.lat.toFixed(5); $("#s-lon").value = f.lon.toFixed(5);
    if (f.alt) $("#s-alt").value = Math.round(f.alt);
  };
  $("#s-time").onclick = setTimeDialog;
  const drawAuto = (st) => {
    const box = $("#s-auto");
    if (!box) return;
    box.innerHTML = switchHTML("autostart", st.on, !st.launcher);
    box.firstChild.onclick = async () => {
      try { drawAuto(await api("/api/autostart", { method: "PUT", body: { on: !st.on } })); toast(st.on ? "Won't open at power-on" : "Opens at power-on"); }
      catch (e) { toast(e.message); }
    };
  };
  api("/api/autostart").then(drawAuto).catch(() => {});
  const tick = () => { const n = $("#s-now"); if (n) n.textContent = new Date().toLocaleString(); };
  tick();
  const t = setInterval(tick, 1000);
  const sys = async (action, title, text, label) => {
    if (!(await confirmDialog(title, text, label))) return;
    try { await api("/api/system", { method: "POST", body: { action } }); toast(action === "reboot" ? "Restarting…" : "Shutting down…"); }
    catch (e) { toast(e.message); }
  };
  $("#s-reboot").onclick = () => sys("reboot", "Restart the Pi?", "R.O.U.G.E will be back in about a minute.", "Restart");
  $("#s-off").onclick = () => sys("shutdown", "Shut down the Pi?", "Wait for the green light to stop blinking before unplugging power.", "Shut down");
  return () => clearInterval(t);
};

/* ---------- Home: clock warning ---------- */
homeHooks.push((view) => {
  const onStatus = (e) => {
    const s = e.detail;
    homeAlert(view, "clock", s && s.clockSuspect && !s.guest
      ? `${icon("clock")}<div class="grow"><b>The clock may be wrong.</b> <span class="muted">It's earlier than your last saved notes. This happens when the Pi loses power with no internet.</span></div>
         <button class="btn btn-sm" data-settime>Set time</button>` : "");
    const b = view.querySelector("[data-settime]");
    if (b) b.onclick = setTimeDialog;
  };
  window.addEventListener("status", onStatus);
  if (lastStatus) onStatus({ detail: lastStatus });
  return () => window.removeEventListener("status", onStatus);
});

/* ---------- command palette: jump to modules ---------- */
function moduleCommands(q) {
  const lq = q.toLowerCase();
  const all = [
    ...ROUGE.modules.filter((m) => m.enabled).map((m) => ({ group: "Go to", title: m.name, sub: m.desc, icon: m.icon, action: () => go(`#/${m.id}`) })),
    ...ROUGE.plugins.filter((p) => p.enabled).map((p) => ({ group: "Go to", title: p.name, sub: p.desc, icon: "puzzle", action: () => go(`#/x/${p.id}`) }))
  ];
  if (!ROUGE.guest) all.push({ group: "Go to", title: "Settings", sub: "Modules, household, clock", icon: "settings", action: () => go("#/settings") },
    { group: "Go to", title: "Get content", sub: "Download Wikipedia, books, maps and place names", icon: "download", action: () => go("#/content") });
  return all.filter((x) => !q || x.title.toLowerCase().includes(lq));
}
window.paletteHooks = window.paletteHooks || [];

/* ---------- startup ---------- */
function loadScript(src) {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = s.onerror = () => resolve();
    document.body.appendChild(s);
  });
}

async function boot() {
  fillIcons();
  $("#theme-toggle").innerHTML = icon(theme.isDark() ? "moon" : "sun");
  try {
    const m = await api("/api/modules");
    Object.assign(ROUGE, { modules: m.modules, plugins: m.plugins, guest: m.guest, version: m.version });
  } catch (e) { console.error(e); }
  ROUGE.config = await api("/api/config").catch(() => ({}));
  if (ROUGE.config.units) store("units", ROUGE.config.units);
  document.documentElement.classList.toggle("guest", ROUGE.guest);
  buildNav();
  const scripts = ["/mod/maptools.js", "/mod/content.js", ...ROUGE.modules.filter((m) => m.enabled).map((m) => `/mod/${m.id}.js`)];
  await Promise.all(scripts.map(loadScript));
  await pollStatus();
  const back = sessionStorage.getItem("rouge-after-reload");
  if (back) { sessionStorage.removeItem("rouge-after-reload"); if (location.hash !== back) { location.hash = back; return; } }
  render();
}
$("#open-settings").onclick = () => go("#/settings");
boot();
