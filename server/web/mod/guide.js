// Field Guide module: quick survival and first-aid cards.
"use strict";
(() => {
  let cards = null;
  const load = async () => (cards = cards || await api("/api/guide").catch(() => []));
  const catIcon = { "First aid": "cross", Water: "droplet", Food: "utensils", "Fire & shelter": "flame",
    "Signals & navigation": "compass", "Power & safety": "zap" };
  const match = (c, q) => (c.title + " " + c.summary + " " + (c.tags || "") + " " + c.cat).toLowerCase().includes(q);

  routes.guide = (view, r) => {
    if (r.arg) return showCard(view, r.arg);
    view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><h1>Field Guide</h1>
      <p class="muted">What to do when there's no one to call. Reading this is no substitute for a first-aid class.</p></div></div>
      <div class="guide-emergency" id="g-em"></div>
      <div class="row" style="margin-bottom:12px;flex-wrap:wrap">
        <div class="input-icon" style="min-width:220px"><span data-icon="search"></span><input class="input" id="g-q" placeholder="Search the guide…" autocomplete="off"></div>
      </div>
      <div class="chips" id="g-cats" style="margin-bottom:14px"></div>
      <div class="guide-list" id="g-list"></div></div>`;
    fillIcons(view);
    let cat = r.q.get("cat") || "";
    load().then((all) => {
      if (!$("#g-list")) return;
      $("#g-em").innerHTML = all.filter((c) => c.emergency).map((c) => `<a href="#/guide/${esc(c.id)}">${icon("alert")}<span>${esc(c.title)}</span></a>`).join("");
      const cats = [...new Set(all.map((c) => c.cat))];
      const draw = () => {
        const q = $("#g-q").value.trim().toLowerCase();
        $("#g-cats").innerHTML = [`<button class="chip${!cat ? " active" : ""}" data-c="">All</button>`,
          ...cats.map((c) => `<button class="chip${c === cat ? " active" : ""}" data-c="${esc(c)}">${icon(catIcon[c] || "file")}${esc(c)}</button>`)].join("");
        $("#g-cats").querySelectorAll("[data-c]").forEach((b) => { b.onclick = () => { cat = b.dataset.c; draw(); }; });
        const list = all.filter((c) => (!cat || c.cat === cat) && (!q || match(c, q)));
        $("#g-list").innerHTML = list.length ? list.map((c) => `<a class="card guide-item" href="#/guide/${esc(c.id)}">
          <span class="guide-tag">${esc(c.cat)}${c.custom ? " · yours" : ""}</span><h3>${esc(c.title)}</h3>
          <p class="muted small">${esc(c.summary)}</p></a>`).join("") : `<p class="muted">Nothing found. Try the Library for more.</p>`;
      };
      $("#g-q").addEventListener("input", debounce(draw, 100));
      draw();
    });
  };

  function showCard(view, id) {
    view.innerHTML = `<div class="page"><div class="guide-card" id="g-card"></div></div>`;
    load().then((all) => {
      const c = all.find((x) => x.id === id);
      const box = $("#g-card");
      if (!box) return;
      if (!c) { box.innerHTML = `<p class="muted">Card not found.</p>`; return; }
      const t = c.table;
      box.innerHTML = `<div class="row" style="margin-bottom:10px"><a class="btn btn-ghost btn-sm" href="#/guide">${icon("back")} Field Guide</a>
          <span class="grow"></span><span class="guide-tag">${esc(c.cat)}</span></div>
        <h1>${esc(c.title)}</h1><p class="summary">${esc(c.summary)}</p>
        ${c.steps && c.steps.length ? `<ol class="guide-steps">${c.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join("")}</ol>` : ""}
        ${t ? `<div class="card guide-table"><table class="table"><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>
          ${t.rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table></div>` : ""}
        ${c.warn ? `<div class="guide-warn"><b>Warning:</b> ${esc(c.warn)}</div>` : ""}
        <p class="guide-source">Source: ${esc(c.source || "your own card")}</p>
        <div class="row" style="margin-top:14px"><button class="btn btn-outline btn-sm" id="g-lib">${icon("book")} More in the Library</button></div>`;
      $("#g-lib").onclick = () => go(`#/library?search=${encodeURIComponent(c.title.replace(/\(.*?\)/g, ""))}`);
    });
  }

  // search palette: guide cards first
  paletteHooks.push(async (q) => {
    const all = await load();
    const lq = q.toLowerCase();
    return all.filter((c) => match(c, lq)).slice(0, 4).map((c) => ({ group: "Field Guide", title: c.title, sub: c.summary, icon: "cross", action: () => go(`#/guide/${c.id}`) }));
  });
})();
