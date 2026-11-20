// R.O.U.G.E web app: plain JavaScript, no build step, no network access needed.
"use strict";

/* ---------------- icons (24px line icons) ---------------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>',
  map: '<path d="m9 4-6 2.5v14L9 18l6 2.5 6-2.5v-14L15 6.5z"/><path d="M9 4v14M15 6.5v14"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  disk: '<path d="M22 12H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/><path d="M6 16h.01M10 16h.01"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  thermo: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  sunrise: '<path d="M12 2v6M5.6 9.6 7 11M2 18h20M17 11l1.4-1.4M18 18a6 6 0 0 0-12 0M4 22h16"/><path d="m9 5 3-3 3 3"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21h14v-3H5zM12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>',
  crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5"/>',
  "radio-tower": '<path d="M4.9 16.1a10 10 0 0 1 0-14.2M7.8 13.2a6 6 0 0 1 0-8.4M16.2 4.8a6 6 0 0 1 0 8.4M19.1 1.9a10 10 0 0 1 0 14.2"/><circle cx="12" cy="9" r="2"/><path d="m9 22 3-11 3 11M10 18h4"/>',
  radio: '<rect x="2" y="8" width="20" height="13" rx="2"/><path d="m6 8 12-5"/><circle cx="8" cy="14.5" r="2.5"/><path d="M14 12h4M14 16h4"/>',
  gauge: '<path d="M12 14 16 9"/><path d="M3.3 19a10 10 0 1 1 17.4 0z"/>',
  puzzle: '<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  bluetooth: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  ruler: '<path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4zM7.5 10.5l2-2M10.5 13.5l2-2M13.5 16.5l2-2"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
  navigation: '<path d="m3 11 19-9-9 19-2-8z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  play: '<path d="m6 3 14 9-14 9z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  droplet: '<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.5 1.5 2.8 2.5 2.8z"/>',
  tent: '<path d="M3.5 21 12 4l8.5 17M12 4l-2 4M2 21h20M9 21l3-6 3 6"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2M6 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>'
};
function icon(name, cls = "") {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}
function fillIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => { if (!el.firstChild) el.innerHTML = icon(el.dataset.icon); });
}

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) {
    let msg = `${res.status} ${path}`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}
function fmtBytes(n) {
  if (!n && n !== 0) return "–";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${u[i]}`;
}
function fmtNum(n) { return (n ?? 0).toLocaleString(); }
function fmtUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function fmtAgo(iso) {
  const t = Date.parse(iso);
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem("rouge-" + key));
    localStorage.setItem("rouge-" + key, JSON.stringify(val));
  } catch (e) { return null; }
}

/* ---------------- modal ---------------- */
function openModal(html, onMount) {
  const back = $("#modal"), body = $("#modal-body");
  body.innerHTML = html;
  fillIcons(body);
  back.hidden = false;
  const close = () => { back.hidden = true; body.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  back.onclick = (e) => { if (e.target === back) close(); };
  onMount && onMount(body, close);
  return close;
}
function confirmDialog(title, text, okLabel = "Delete") {
  return new Promise((resolve) => {
    openModal(`<div class="dialog-pad"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="dialog-actions"><button class="btn btn-outline" data-x>Cancel</button><button class="btn btn-destructive" data-ok>${esc(okLabel)}</button></div></div>`,
    (b, close) => {
      b.querySelector("[data-x]").onclick = () => { close(); resolve(false); };
      b.querySelector("[data-ok]").onclick = () => { close(); resolve(true); };
    });
  });
}

/* ---------------- theme ---------------- */
const theme = {
  isDark: () => document.documentElement.classList.contains("dark"),
  set(dark) {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("rouge-theme", dark ? "dark" : "light"); } catch (e) {}
    $("#theme-toggle").innerHTML = icon(dark ? "moon" : "sun");
    window.dispatchEvent(new Event("themechange"));
  }
};
$("#theme-toggle").onclick = () => theme.set(!theme.isDark());

/* ---------------- status (sidebar) ---------------- */
let lastStatus = null;
async function pollStatus() {
  try {
    lastStatus = await api("/api/status");
    const s = lastStatus, line = $("#side-status");
    let cls = "ok", text = "Offline-ready";
    if (s.power && s.power.underVoltageNow) { cls = "bad"; text = "Low voltage!"; }
    else if (s.tempC != null && s.tempC >= 75) { cls = "warn"; text = `Hot: ${s.tempC.toFixed(0)}°C`; }
    else if (s.tempC != null) text = `Offline-ready · ${s.tempC.toFixed(0)}°C`;
    line.innerHTML = `<span class="dot ${cls}"></span><span>${esc(text)}</span>`;
    window.dispatchEvent(new CustomEvent("status", { detail: s }));
  } catch (e) {
    $("#side-status").innerHTML = `<span class="dot bad"></span><span>Server not responding</span>`;
  }
}
setInterval(pollStatus, 10000);

/* ---------------- router ---------------- */
const routes = {};
let cleanup = null;
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "") || "home";
  const [path, qs] = raw.split("?");
  const [name, ...rest] = path.split("/");
  return { name, arg: rest.join("/"), q: new URLSearchParams(qs || "") };
}
function go(hash) { location.hash = hash; }
function render() {
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  if (cmd.open) closeCommand();
  const r = parseHash();
  const view = $("#view");
  view.innerHTML = "";
  view.scrollTop = 0;
  document.querySelectorAll("#nav a").forEach((a) => {
    const n = a.dataset.route;
    a.classList.toggle("active", n === r.name || (n === "library" && r.name === "read") || (n === "tools" && !!(window.toolRoutes || {})[r.name]));
  });
  const fn = routes[r.name] || routes.home;
  cleanup = fn(view, r) || null;
  fillIcons(view);
}
window.addEventListener("hashchange", render);

/* ---------------- command palette ---------------- */
const cmd = { open: false, items: [], index: 0, notes: null, seq: 0 };
function openCommand(prefill = "") {
  cmd.open = true;
  $("#command").hidden = false;
  const q = $("#command-q");
  q.value = prefill;
  q.focus();
  cmd.notes = null;
  runCommand(prefill);
}
function closeCommand() { cmd.open = false; $("#command").hidden = true; }
const runCommandDebounced = debounce((v) => runCommand(v), 150);
async function runCommand(q) {
  const list = $("#command-list");
  const seq = ++cmd.seq;
  q = q.trim();
  if (!q) {
    cmd.items = [
      { group: "Go to", title: "Library", sub: "Wikipedia and other offline books", icon: "book", action: () => go("#/library") },
      { group: "Go to", title: "Maps", sub: "Offline maps and saved pins", icon: "map", action: () => go("#/maps") },
      { group: "Go to", title: "Notes", sub: "Your notes, saved on this device", icon: "note", action: () => go("#/notes") },
      { group: "Go to", title: "New note", sub: "", icon: "plus", action: () => newNote() },
      ...(typeof moduleCommands === "function" ? moduleCommands("") : [])
    ];
    if (ROUGE.guest) cmd.items = cmd.items.filter((x) => !/note/i.test(x.title));
    return drawCommand();
  }
  list.innerHTML = `<div class="command-empty">Searching…</div>`;
  if (!cmd.notes) cmd.notes = ROUGE.guest ? [] : await api("/api/notes").catch(() => []);
  const [arts, places] = await Promise.all([
    api("/api/suggest?q=" + encodeURIComponent(q)).catch(() => []),
    api("/api/places?q=" + encodeURIComponent(q)).catch(() => [])
  ]);
  if (seq !== cmd.seq) return;
  const lq = q.toLowerCase();
  const extra = [];
  for (const h of window.paletteHooks || []) { try { extra.push(...(await h(q))); } catch (e) {} }
  if (seq !== cmd.seq) return;
  const notes = cmd.notes.filter((n) => (n.title || "").toLowerCase().includes(lq) || (n.body || "").toLowerCase().includes(lq)).slice(0, 5);
  cmd.items = [
    ...arts.slice(0, 8).map((a) => ({ group: "Articles", title: a.title, sub: a.book, icon: "book",
      action: () => go(`#/read?u=${encodeURIComponent(a.url)}`) })),
    { group: "Articles", title: `Search every book for “${q}”`, sub: "Full-text search", icon: "search",
      action: () => go(`#/library?search=${encodeURIComponent(q)}`) },
    ...places.slice(0, 6).map((p) => ({ group: "Places", title: p.name, sub: p.detail, icon: "pin",
      action: () => go(`#/maps?lat=${p.lat}&lon=${p.lon}&z=12&label=${encodeURIComponent(p.name)}`) })),
    ...notes.map((n) => ({ group: "Notes", title: n.title || "Untitled", sub: fmtAgo(n.updated), icon: "note",
      action: () => go(`#/notes/${n.id}`) })),
    ...extra,
    ...moduleCommands(q).slice(0, 4)
  ];
  if (extra.length) { // field guide matches first: in an emergency they matter most
    const g = cmd.items.filter((x) => x.group === "Field Guide");
    cmd.items = [...g, ...cmd.items.filter((x) => x.group !== "Field Guide")];
  }
  drawCommand();
}
function drawCommand() {
  const list = $("#command-list");
  cmd.index = 0;
  if (!cmd.items.length) { list.innerHTML = `<div class="command-empty">No results.</div>`; return; }
  let html = "", group = "";
  cmd.items.forEach((it, i) => {
    if (it.group !== group) { group = it.group; html += `<div class="command-group">${esc(group)}</div>`; }
    html += `<div class="list-item${i === 0 ? " active" : ""}" data-i="${i}">${icon(it.icon)}
      <div class="grow"><div class="truncate">${esc(it.title)}</div>${it.sub ? `<div class="meta truncate">${esc(it.sub)}</div>` : ""}</div></div>`;
  });
  list.innerHTML = html;
  list.querySelectorAll("[data-i]").forEach((el) => {
    el.onclick = () => pickCommand(+el.dataset.i);
    el.onmousemove = () => setCommandIndex(+el.dataset.i);
  });
}
function setCommandIndex(i) {
  const els = $("#command-list").querySelectorAll("[data-i]");
  if (!els.length) return;
  cmd.index = (i + els.length) % els.length;
  els.forEach((el) => el.classList.toggle("active", +el.dataset.i === cmd.index));
  els[cmd.index].scrollIntoView({ block: "nearest" });
}
function pickCommand(i) { const it = cmd.items[i]; closeCommand(); it && it.action(); }
$("#command-q").addEventListener("input", (e) => runCommandDebounced(e.target.value));
$("#command-q").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); setCommandIndex(cmd.index + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setCommandIndex(cmd.index - 1); }
  else if (e.key === "Enter") { e.preventDefault(); pickCommand(cmd.index); }
  else if (e.key === "Escape") closeCommand();
});
$("#command").addEventListener("click", (e) => { if (e.target.id === "command") closeCommand(); });
$("#open-command").onclick = () => openCommand();
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); cmd.open ? closeCommand() : openCommand(); }
});

/* ================= HOME ================= */
routes.home = (view) => {
  view.innerHTML = `<div class="page">
    <div class="hero">
      <div class="grow"><div class="clock" id="clock"></div><p class="muted" id="date" style="margin-top:6px"></p></div>
      <button class="btn btn-outline" id="home-search">${icon("search")} Search everything <kbd>Ctrl K</kbd></button>
    </div>
    <div id="home-alerts"></div>
    <div class="grid ${ROUGE.guest ? "grid-3" : "grid-4"}" id="stats"></div>
    <div class="grid grid-2" id="home-extra" style="margin-top:12px"></div>
    <div class="grid grid-2" style="margin-top:12px">
      <div class="card card-pad" id="system"></div>
      <div class="card card-pad guest-hide">
        <div class="card-head">${icon("download")}<h3>Adding content</h3></div>
        <p class="muted small">Everything here works with no internet. To add or update Wikipedia, other books, maps or place names,
        connect to the internet and open Get content.</p>
        <div class="row" style="margin-top:12px"><a class="btn" href="#/content">${icon("download")} Get content</a></div>
        <p class="muted small" style="margin-top:10px">Files live in <span class="code" id="datadir">~/rouge</span>.</p>
      </div>
    </div></div>`;
  $("#home-search").onclick = () => openCommand();
  const tick = () => {
    const d = new Date();
    $("#clock").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    $("#date").textContent = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + " · offline";
  };
  tick();
  const t = setInterval(tick, 10000);
  const draw = (s) => {
    if (!s || !$("#stats")) return;
    $("#datadir").textContent = s.dataDir;
    const stat = (href, ic, label, value, sub) => `<a class="card card-pad book" href="${href}" style="display:block">
      <div class="card-head" style="margin-bottom:6px">${icon(ic)}<span class="muted small">${label}</span></div>
      <div class="stat-value">${value}</div><div class="muted small">${sub}</div></a>`;
    $("#stats").innerHTML =
      stat("#/library", "book", "Library", fmtNum(s.library), s.kiwix ? "books ready" : s.library ? "library starting…" : "no books yet") +
      stat("#/maps", "map", "Maps", fmtNum(s.maps), s.maps ? "offline regions" : "no maps yet") +
      stat("#/maps", "pin", "Places", fmtNum(s.places), `${fmtNum(s.pins)} saved pins`) +
      (ROUGE.guest ? "" : stat("#/notes", "note", "Notes", fmtNum(s.notes), "saved on this device"));
    const used = s.diskTotal ? 1 - s.diskFree / s.diskTotal : 0;
    const memUsed = s.memTotal ? 1 - s.memAvail / s.memTotal : 0;
    let power = `<span class="badge">unknown</span>`;
    if (s.power) {
      power = s.power.underVoltageNow ? `<span class="badge badge-bad">Under-voltage now</span>`
        : s.power.throttledNow ? `<span class="badge badge-warn">Throttled</span>`
        : s.power.underVoltageEver ? `<span class="badge badge-warn">OK · dipped earlier</span>`
        : `<span class="badge badge-ok">Good</span>`;
    }
    const temp = s.tempC == null ? "–" : `${s.tempC.toFixed(0)}°C`;
    $("#system").innerHTML = `<div class="card-head">${icon("cpu")}<h3 class="grow">This computer</h3><span class="muted small">${esc(s.model || s.hostname)}</span></div>
      <div class="kv"><span>Power</span>${power}</div>
      <div class="kv"><span>Temperature</span><span>${temp}</span></div>
      <div class="kv"><span>Load</span><span>${s.load.toFixed(2)} on ${s.cpus} cores</span></div>
      <div class="kv"><span>Memory</span><span>${fmtBytes(s.memTotal - s.memAvail)} of ${fmtBytes(s.memTotal)}</span></div>
      <div class="progress" style="margin:2px 0 6px"><div style="width:${(memUsed * 100).toFixed(1)}%"></div></div>
      <div class="kv"><span>Storage</span><span>${fmtBytes(s.diskFree)} free of ${fmtBytes(s.diskTotal)}</span></div>
      <div class="progress" style="margin:2px 0 6px"><div style="width:${(used * 100).toFixed(1)}%"></div></div>
      <div class="kv"><span>Up for</span><span>${fmtUptime(s.uptime)}</span></div>
      <div class="kv"><span>Network</span><span class="mono">${s.ips.length ? esc(s.ips.join(", ")) : "none (offline)"}</span></div>`;
  };
  draw(lastStatus);
  const onStatus = (e) => draw(e.detail);
  window.addEventListener("status", onStatus);
  pollStatus();
  const t2 = setInterval(pollStatus, 5000);
  const extras = (window.homeHooks || []).map((fn) => { try { return fn(view); } catch (e) { console.error(e); } }).filter(Boolean);
  return () => { clearInterval(t); clearInterval(t2); window.removeEventListener("status", onStatus); extras.forEach((c) => c()); };
};

/* ================= LIBRARY ================= */
routes.library = (view, r) => {
  view.innerHTML = `<div class="page">
    <div class="page-head"><div class="grow"><h1>Library</h1><p class="muted">Wikipedia and other books, readable with no internet.</p></div>
      <button class="btn btn-outline btn-sm" id="rescan">${icon("refresh")} Rescan</button>${ROUGE.guest ? "" : `<a class="btn btn-sm" href="#/content">${icon("download")} Get content</a>`}</div>
    <div class="row" style="position:relative;margin-bottom:16px">
      <div class="input-icon"><span data-icon="search"></span><input class="input" id="lib-q" placeholder="Search article titles…" autocomplete="off"></div>
      <select class="select" id="lib-book"><option value="">All books</option></select>
      <button class="btn" id="lib-full">Full-text search</button>
      <div class="card suggest" id="lib-suggest" hidden></div>
    </div>
    <div id="lib-books" class="grid grid-2"></div></div>`;
  let books = [];
  const load = async () => {
    const lib = await api("/api/library").catch(() => ({ books: [], running: false, error: "server not responding" }));
    books = lib.books || [];
    const sel = $("#lib-book");
    sel.innerHTML = `<option value="">All books</option>` + books.map((b) => `<option value="${esc(b.name)}">${esc(b.title)}</option>`).join("");
    const box = $("#lib-books");
    if (!books.length) {
      box.className = "";
      box.innerHTML = `<div class="empty"><div class="empty-icon">${icon("book")}</div><h3>No books yet</h3>
        <p class="muted">Download Wikipedia and other offline books while you have internet.</p>
        ${ROUGE.guest ? "" : `<a class="btn" href="#/content">${icon("download")} Get content</a>`}${lib.error ? `<p class="muted small">${esc(lib.error)}</p>` : ""}</div>`;
      return;
    }
    box.className = "grid grid-2";
    box.innerHTML = books.map((b, i) => `<div class="card book" data-i="${i}">
      <div class="book-icon">${b.icon && lib.running ? `<img src="${esc(b.icon)}" alt="">` : icon("book")}</div>
      <div class="grow"><h3 class="truncate">${esc(b.title)}</h3>
        <p class="muted small" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(b.summary || b.file)}</p>
        <div class="row" style="margin-top:8px;flex-wrap:wrap">
          ${b.language ? `<span class="badge">${esc(b.language)}</span>` : ""}
          ${b.articles ? `<span class="badge">${fmtNum(b.articles)} articles</span>` : ""}
          <span class="badge">${fmtBytes(b.size)}</span>
          ${lib.running ? "" : `<span class="badge badge-warn">not running</span>`}
        </div></div></div>`).join("");
    box.querySelectorAll("[data-i]").forEach((el) => {
      el.onclick = () => { const b = books[+el.dataset.i]; go(`#/read?u=${encodeURIComponent(b.url)}`); };
    });
    if (!lib.running && lib.error) {
      box.insertAdjacentHTML("afterbegin", `<div class="card card-pad" style="grid-column:1/-1"><span class="badge badge-warn">Library not running</span>
        <span class="muted small" style="margin-left:8px">${esc(lib.error)}</span></div>`);
    }
  };
  load();
  $("#rescan").onclick = async () => {
    const b = $("#rescan");
    b.disabled = true;
    b.innerHTML = `${icon("refresh")} Rescanning…`;
    const res = await api("/api/rescan", { method: "POST" }).catch(() => ({ ok: false }));
    toast(res.ok ? "Library rescanned" : "Rescan finished with a problem");
    b.disabled = false;
    b.innerHTML = `${icon("refresh")} Rescan`;
    load();
  };
  const sug = $("#lib-suggest"), q = $("#lib-q");
  let seq = 0, idx = -1, items = [];
  const fullText = () => {
    const v = q.value.trim();
    if (!v) return;
    const book = $("#lib-book").value || (books[0] && books[0].name);
    if (!book) return toast("No books installed yet");
    go(`#/read?u=${encodeURIComponent(`/kiwix/search?content=${encodeURIComponent(book)}&pattern=${encodeURIComponent(v)}`)}`);
  };
  const showSuggest = debounce(async () => {
    const v = q.value.trim(), s = ++seq;
    if (!v) { sug.hidden = true; return; }
    items = await api(`/api/suggest?q=${encodeURIComponent(v)}&book=${encodeURIComponent($("#lib-book").value)}`).catch(() => []);
    if (s !== seq) return;
    idx = -1;
    sug.innerHTML = (items.length ? items.map((it, i) => `<div class="list-item" data-i="${i}">${icon("book")}<div class="grow">
        <div class="truncate">${esc(it.title)}</div><div class="meta truncate">${esc(it.book)}</div></div></div>`).join("")
      : `<div class="list-item muted">No matching titles</div>`) +
      `<div class="list-item" data-full>${icon("search")}<div class="grow">Search inside articles for “${esc(v)}”</div><kbd>Enter</kbd></div>`;
    sug.hidden = false;
    sug.querySelectorAll("[data-i]").forEach((el) => { el.onclick = () => go(`#/read?u=${encodeURIComponent(items[+el.dataset.i].url)}`); });
    sug.querySelector("[data-full]").onclick = fullText;
  }, 150);
  q.addEventListener("input", showSuggest);
  q.addEventListener("keydown", (e) => {
    const els = sug.querySelectorAll("[data-i]");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!els.length) return;
      idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length;
      els.forEach((el, i) => el.classList.toggle("active", i === idx));
    } else if (e.key === "Enter") {
      if (idx >= 0 && items[idx]) go(`#/read?u=${encodeURIComponent(items[idx].url)}`);
      else fullText();
    } else if (e.key === "Escape") sug.hidden = true;
  });
  $("#lib-full").onclick = fullText;
  const hide = (e) => { if (!e.target.closest("#lib-suggest") && e.target !== q) sug.hidden = true; };
  document.addEventListener("click", hide);
  if (r.q.get("search")) { q.value = r.q.get("search"); setTimeout(fullText, 0); }
  else setTimeout(() => q.focus(), 0);
  return () => document.removeEventListener("click", hide);
};

routes.read = (view, r) => {
  const u = r.q.get("u") || "/kiwix/";
  const m = u.match(/\/kiwix\/content\/([^/]+)/) || u.match(/[?&](?:content|books\.name)=([^&]+)/);
  const book = m ? decodeURIComponent(m[1]) : "";
  view.innerHTML = `<div class="reader">
    <div class="reader-bar">
      <a class="btn btn-ghost btn-sm" href="#/library">${icon("back")} Library</a>
      <button class="btn btn-ghost btn-sm btn-icon" id="r-back" title="Back">${icon("left")}</button>
      <button class="btn btn-ghost btn-sm btn-icon" id="r-fwd" title="Forward">${icon("right")}</button>
      ${book ? `<button class="btn btn-ghost btn-sm btn-icon" id="r-home" title="Book home">${icon("home")}</button>
      <button class="btn btn-ghost btn-sm btn-icon" id="r-rand" title="Random article">${icon("dice")}</button>` : ""}
      <div class="grow truncate" id="r-title" style="font-weight:600;padding:0 6px"></div>
      ${book ? `<div class="input-icon" style="flex:0 0 240px"><span data-icon="search"></span><input class="input" id="r-q" style="height:30px" placeholder="Search this book…"></div>` : ""}
      <button class="btn btn-ghost btn-sm btn-icon" id="r-text" title="Text size">${icon("text")}</button>
    </div>
    <iframe id="r-frame" title="Article"></iframe></div>`;
  const f = $("#r-frame");
  let zoom = store("reader-zoom") || 100;
  const applyZoom = () => {
    try { f.contentDocument.documentElement.style.zoom = zoom + "%"; } catch (e) {}
  };
  f.onload = () => {
    try { $("#r-title").textContent = f.contentDocument.title || ""; } catch (e) {}
    applyZoom();
  };
  f.src = u;
  $("#r-back").onclick = () => { try { f.contentWindow.history.back(); } catch (e) {} };
  $("#r-fwd").onclick = () => { try { f.contentWindow.history.forward(); } catch (e) {} };
  $("#r-text").onclick = () => { zoom = zoom >= 140 ? 90 : zoom + 15; store("reader-zoom", zoom); applyZoom(); toast(`Text size ${zoom}%`); };
  if (book) {
    $("#r-home").onclick = () => { f.src = `/kiwix/content/${encodeURIComponent(book)}/`; };
    $("#r-rand").onclick = () => { f.src = `/kiwix/random?content=${encodeURIComponent(book)}`; };
    $("#r-q").addEventListener("keydown", (e) => {
      const v = e.target.value.trim();
      if (e.key === "Enter" && v) f.src = `/kiwix/search?content=${encodeURIComponent(book)}&pattern=${encodeURIComponent(v)}`;
    });
  }
};

/* ================= MAPS ================= */
let pmtilesProtocolAdded = false;
routes.maps = (view, r) => {
  view.style.overflow = "hidden";
  view.innerHTML = `<div class="map-wrap"><div id="map"></div>
    <div class="map-panel map-search">
      <div class="card"><div class="input-icon"><span data-icon="search"></span>
        <input class="input" id="m-q" style="border:0;height:40px" placeholder="Search places or lat, lon…" autocomplete="off"></div></div>
      <div class="card map-results" id="m-results" hidden></div>
    </div>
    <div class="map-panel map-tools">
      <div class="row" id="m-toolrow">
        <select class="select card" id="m-file" hidden></select>
        <button class="btn btn-outline" id="m-pins">${icon("pin")} Pins <span class="badge" id="m-pin-count">0</span></button>
      </div>
      <div class="card pins-panel" id="m-pin-list" hidden></div>
    </div>
    <div class="map-panel map-coords card mono" id="m-coords"></div></div>`;
  const back = () => { view.style.overflow = ""; };

  if (!window.maplibregl || !window.pmtiles) {
    $(".map-wrap").innerHTML = `<div class="page"><div class="empty"><div class="empty-icon">${icon("map")}</div>
      <h3>The map engine isn't downloaded yet</h3><p class="muted">It downloads by itself as soon as the Pi is connected to the internet.
      You can also start it from Get content.</p>${ROUGE.guest ? "" : `<a class="btn" href="#/content">${icon("download")} Get content</a>`}</div></div>`;
    return back;
  }
  let map = null, markers = [], tempMarker = null, pins = [], disposed = false;

  (async () => {
    const maps = (await api("/api/maps").catch(() => [])).filter((m) => m.valid);
    if (disposed) return;
    if (!maps.length) {
      $(".map-wrap").innerHTML = `<div class="page"><div class="empty"><div class="empty-icon">${icon("map")}</div>
        <h3>No offline maps yet</h3><p class="muted">Download a map of your area while you have internet.</p>
        ${ROUGE.guest ? "" : `<a class="btn" href="#/content">${icon("download")} Get maps</a>`}</div></div>`;
      return;
    }
    if (!pmtilesProtocolAdded) {
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      pmtilesProtocolAdded = true;
    }
    let current = maps.find((m) => m.file === store("map-file")) || maps[0];
    const sel = $("#m-file");
    if (maps.length > 1) {
      sel.hidden = false;
      sel.innerHTML = maps.map((m) => `<option value="${esc(m.file)}">${esc(m.name)}</option>`).join("");
      sel.value = current.file;
      sel.onchange = () => {
        current = maps.find((m) => m.file === sel.value);
        store("map-file", current.file);
        map.setStyle(rougeMapStyle(location.origin + current.url, theme.isDark()));
        map.fitBounds([[current.bounds[0], current.bounds[1]], [current.bounds[2], current.bounds[3]]], { duration: 0 });
      };
    }
    const saved = store("map-view");
    const lat = parseFloat(r.q.get("lat")), lon = parseFloat(r.q.get("lon"));
    const start = !isNaN(lat) && !isNaN(lon) ? { center: [lon, lat], zoom: parseFloat(r.q.get("z")) || 12 }
      : saved ? { center: saved.center, zoom: saved.zoom }
      : { center: [current.center[0], current.center[1]], zoom: current.center[2] || 6 };
    map = new maplibregl.Map({
      container: "map", style: rougeMapStyle(location.origin + current.url, theme.isDark()), ...start,
      attributionControl: { compact: true }, maxZoom: 19, dragRotate: false, pitchWithRotate: false
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: store("units") || "imperial" }), "bottom-right");
    if (!saved && isNaN(lat)) map.fitBounds([[current.bounds[0], current.bounds[1]], [current.bounds[2], current.bounds[3]]], { duration: 0 });

    const coords = $("#m-coords");
    const showCoords = (ll) => { coords.textContent = window.fmtCoord ? fmtCoord(ll.lat, ll.lng) : `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`; };
    coords.onclick = () => { if (window.nextCoordFormat) { nextCoordFormat(); showCoords(map.getCenter()); } };
    showCoords(map.getCenter());
    map.on("mousemove", (e) => showCoords(e.lngLat));
    map.on("moveend", () => { showCoords(map.getCenter()); store("map-view", { center: map.getCenter().toArray(), zoom: map.getZoom() }); });

    if (!isNaN(lat) && !isNaN(lon)) showTemp(lon, lat, r.q.get("label") || "");
    window.dispatchEvent(new CustomEvent("mapready", { detail: { map, view, r, showTemp } }));
    await loadPins();

    // right-click, or press and hold on a touch screen, to drop a pin
    map.on("contextmenu", (e) => { if (!ROUGE.guest && !window.mapBusy) addPinDialog(e.lngLat.lng, e.lngLat.lat); });
    let hold = null;
    map.on("touchstart", (e) => {
      if (e.points && e.points.length > 1) return;
      if (ROUGE.guest || window.mapBusy) return;
      hold = setTimeout(() => addPinDialog(e.lngLat.lng, e.lngLat.lat), 650);
    });
    ["touchend", "touchmove", "movestart"].forEach((ev) => map.on(ev, () => clearTimeout(hold)));
  })();

  function popupHTML(title, sub, lng, lat, actions) {
    return `<div style="min-width:200px"><div style="font-weight:600">${esc(title || "Dropped pin")}</div>
      ${sub ? `<div class="muted small" style="white-space:pre-wrap;margin-top:2px">${esc(sub)}</div>` : ""}
      <div class="mono small muted" style="margin:6px 0 10px">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
      <div class="row">${actions}</div></div>`;
  }
  function showTemp(lng, lat, label) {
    if (tempMarker) tempMarker.remove();
    const el = document.createElement("div");
    el.className = "here-marker";
    const popup = new maplibregl.Popup({ offset: 12, closeButton: false })
      .setHTML(popupHTML(label, "", lng, lat, ROUGE.guest ? "" : `<button class="btn btn-sm" data-save>${icon("pin")} Save pin</button>`));
    popup.on("open", () => {
      const b = popup.getElement().querySelector("[data-save]");
      if (b) b.onclick = () => { popup.remove(); addPinDialog(lng, lat, label); };
    });
    tempMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).setPopup(popup).addTo(map);
    tempMarker.togglePopup();
  }
  async function loadPins() {
    pins = await api("/api/pins").catch(() => []);
    markers.forEach((m) => m.remove());
    markers = pins.map((p) => {
      const el = document.createElement("div");
      el.className = "pin-marker";
      el.title = p.name || "";
      const popup = new maplibregl.Popup({ offset: 18, closeButton: false })
        .setHTML(popupHTML(p.name, p.note, p.lon, p.lat, (ROUGE.guest ? "" : `<button class="btn btn-outline btn-sm" data-del>${icon("trash")} Delete</button><button class="btn btn-outline btn-sm" data-home>${icon("home")} Set as home</button>`)));
      popup.on("open", () => {
        const h = popup.getElement().querySelector("[data-home]");
        if (h) h.onclick = async () => {
          ROUGE.config = await api("/api/config", { method: "PUT", body: { home: { lat: +p.lat, lon: +p.lon } } });
          popup.remove(); toast("Home location set");
        };
        const b = popup.getElement().querySelector("[data-del]");
        if (b) b.onclick = async () => {
          if (!(await confirmDialog("Delete this pin?", p.name || "Dropped pin"))) return;
          await api(`/api/pins/${p.id}`, { method: "DELETE" });
          popup.remove();
          toast("Pin deleted");
          loadPins();
        };
      });
      return new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, 4] }).setLngLat([p.lon, p.lat]).setPopup(popup).addTo(map);
    });
    $("#m-pin-count").textContent = pins.length;
    drawPinList();
  }
  function drawPinList() {
    const box = $("#m-pin-list");
    box.innerHTML = pins.length ? pins.map((p, i) => `<div class="list-item" data-i="${i}">${icon("pin")}<div class="grow">
        <div class="truncate">${esc(p.name || "Dropped pin")}</div><div class="meta mono">${(+p.lat).toFixed(4)}, ${(+p.lon).toFixed(4)}</div></div></div>`).join("")
      : `<div class="muted small" style="padding:10px">No pins yet. Right-click the map (or press and hold) to drop one.</div>`;
    box.querySelectorAll("[data-i]").forEach((el) => {
      el.onclick = () => {
        const p = pins[+el.dataset.i];
        map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 13) });
        markers[+el.dataset.i].togglePopup();
      };
    });
  }
  function addPinDialog(lng, lat, name = "") {
    openModal(`<div class="dialog-pad"><h2>Save a pin</h2>
      <p class="mono small muted">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
      <input class="input" id="pin-name" placeholder="Name, e.g. Water source" value="${esc(name)}">
      <textarea class="textarea" id="pin-note" rows="3" placeholder="Note (optional)"></textarea>
      <div class="dialog-actions"><button class="btn btn-outline" data-x>Cancel</button><button class="btn" data-ok>Save pin</button></div></div>`,
    (b, close) => {
      const n = b.querySelector("#pin-name");
      n.focus();
      b.querySelector("[data-x]").onclick = close;
      const save = async () => {
        await api("/api/pins", { method: "POST", body: { name: n.value.trim(), note: b.querySelector("#pin-note").value.trim(), lat, lon: lng } });
        close();
        if (tempMarker) { tempMarker.remove(); tempMarker = null; }
        toast("Pin saved");
        loadPins();
      };
      b.querySelector("[data-ok]").onclick = save;
      n.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    });
  }

  $("#m-pins").onclick = () => { const l = $("#m-pin-list"); l.hidden = !l.hidden; };
  const q = $("#m-q"), res = $("#m-results");
  let seq = 0, results = [];
  const search = debounce(async () => {
    const v = q.value.trim(), s = ++seq;
    if (!v) { res.hidden = true; return; }
    results = await api("/api/places?q=" + encodeURIComponent(v)).catch(() => []);
    if (s !== seq) return;
    res.innerHTML = results.length ? results.map((p, i) => `<div class="list-item" data-i="${i}">${icon("pin")}<div class="grow">
      <div class="truncate">${esc(p.name)}</div><div class="meta truncate">${esc(p.detail)}${p.population ? " · " + fmtNum(p.population) + " people" : ""}</div></div></div>`).join("")
      : `<div class="muted small" style="padding:10px">No places found. Place names come from the GeoNames download (Get content → Place names). You can also type coordinates, e.g. 40.71, -74.00.</div>`;
    res.hidden = false;
    res.querySelectorAll("[data-i]").forEach((el) => {
      el.onclick = () => {
        const p = results[+el.dataset.i];
        res.hidden = true;
        q.blur();
        if (!map) return;
        map.flyTo({ center: [p.lon, p.lat], zoom: p.population > 500000 ? 10 : p.detail === "Coordinates" ? 14 : 12 });
        showTemp(p.lon, p.lat, p.name);
      };
    });
  }, 150);
  q.addEventListener("input", search);
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = res.querySelector("[data-i]"); first && first.click(); }
    if (e.key === "Escape") { res.hidden = true; q.blur(); }
  });
  const onTheme = () => {
    if (!map) return;
    const sel = $("#m-file");
    const file = sel && !sel.hidden ? sel.value : null;
    api("/api/maps").then((maps) => {
      const m = maps.find((x) => x.file === file) || maps.find((x) => x.valid);
      if (m) map.setStyle(rougeMapStyle(location.origin + m.url, theme.isDark()));
    });
  };
  window.addEventListener("themechange", onTheme);
  return () => { disposed = true; window.removeEventListener("themechange", onTheme); window.dispatchEvent(new Event("mapgone")); if (map) map.remove(); back(); };
};

/* ================= NOTES ================= */
async function newNote() {
  const n = await api("/api/notes", { method: "POST", body: { title: "", body: "" } });
  go(`#/notes/${n.id}`);
}
routes.notes = (view, r) => {
  view.innerHTML = `<div class="notes${r.arg ? " editing" : ""}">
    <div class="notes-list">
      <div class="row" style="padding:12px 12px 6px"><h2 class="grow">Notes</h2>
        <button class="btn btn-sm" id="n-new">${icon("plus")} New</button></div>
      <div style="padding:6px 12px"><div class="input-icon"><span data-icon="search"></span><input class="input" id="n-q" placeholder="Filter notes"></div></div>
      <div class="list" id="n-list"></div>
    </div>
    <div class="notes-editor" id="n-editor"></div></div>`;
  let notes = [], currentId = r.arg || null, saveTimer = null, pending = null;
  $("#n-new").onclick = newNote;
  const drawList = () => {
    const f = $("#n-q").value.trim().toLowerCase();
    const shown = notes.filter((n) => !f || (n.title || "").toLowerCase().includes(f) || (n.body || "").toLowerCase().includes(f));
    $("#n-list").innerHTML = shown.length ? shown.map((n) => `<a class="list-item${n.id === currentId ? " active" : ""}" href="#/notes/${n.id}">
      <div class="grow"><div class="truncate" style="font-weight:500">${esc(n.title || "Untitled")}</div>
      <div class="meta truncate">${esc(fmtAgo(n.updated))} · ${esc((n.body || "").slice(0, 60) || "Empty")}</div></div></a>`).join("")
      : `<div class="muted small" style="padding:12px">${notes.length ? "No matches." : "No notes yet."}</div>`;
  };
  $("#n-q").addEventListener("input", drawList);
  const flush = async () => {
    if (!pending) return;
    const doc = pending;
    pending = null;
    clearTimeout(saveTimer);
    await api(`/api/notes/${doc.id}`, { method: "PUT", body: { title: doc.title, body: doc.body } }).catch(() => toast("Could not save"));
    const st = $("#n-saved");
    if (st) st.innerHTML = `${icon("check")} Saved`;
  };
  const drawEditor = () => {
    const ed = $("#n-editor");
    const n = notes.find((x) => x.id === currentId);
    if (!n) {
      ed.innerHTML = `<div class="page" style="margin:auto"><div class="empty"><div class="empty-icon">${icon("note")}</div>
        <h3>${notes.length ? "Pick a note" : "Write your first note"}</h3><p class="muted">Notes are saved on this device as you type.</p>
        <button class="btn" id="n-new2">${icon("plus")} New note</button></div></div>`;
      $("#n-new2").onclick = newNote;
      return;
    }
    ed.innerHTML = `<div class="row" style="padding:10px 14px 0">
        <a class="btn btn-ghost btn-sm" href="#/notes" id="n-back">${icon("back")}</a>
        <span class="muted small grow row" id="n-saved">${icon("check")} Saved</span>
        <button class="btn btn-ghost btn-sm" id="n-del">${icon("trash")} Delete</button></div>
      <input class="title-input" id="n-title" placeholder="Title" value="${esc(n.title)}">
      <textarea class="body-input" id="n-body" placeholder="Start writing…">${esc(n.body)}</textarea>`;
    const change = () => {
      n.title = $("#n-title").value;
      n.body = $("#n-body").value;
      n.updated = new Date().toISOString();
      pending = n;
      $("#n-saved").innerHTML = "Saving…";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { flush(); drawList(); }, 600);
    };
    $("#n-title").addEventListener("input", change);
    $("#n-body").addEventListener("input", change);
    $("#n-del").onclick = async () => {
      if (!(await confirmDialog("Delete this note?", n.title || "Untitled"))) return;
      pending = null;
      await api(`/api/notes/${n.id}`, { method: "DELETE" });
      toast("Note deleted");
      go("#/notes");
    };
    if (!n.title && !n.body) $("#n-title").focus();
  };
  api("/api/notes").then((list) => { notes = list; drawList(); drawEditor(); }).catch(() => toast("Could not load notes"));
  window.addEventListener("beforeunload", flush);
  return () => { flush(); window.removeEventListener("beforeunload", flush); };
};

/* startup is in shell.js */
