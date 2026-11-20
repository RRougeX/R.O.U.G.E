// Supplies module: what you have, how long it lasts, what expires.
"use strict";
(() => {
  const CATS = [
    ["water", "Water", "droplet"], ["food", "Food", "utensils"], ["medicine", "Medicine & first aid", "cross"],
    ["power", "Batteries & fuel", "battery"], ["gear", "Gear & tools", "box"], ["other", "Other", "file"]
  ];
  const catName = (k) => (CATS.find((c) => c[0] === k) || CATS[5])[1];
  const L_PER_GAL = 3.78541;
  // Ready.gov basic disaster supplies kit, plus commonly recommended extras
  const KIT = [
    "Water: 1 gallon per person per day, for at least 3 days", "Food: at least a 3-day supply of non-perishable food",
    "Battery or hand-crank radio and a NOAA Weather Radio", "Flashlight", "First aid kit", "Extra batteries", "Whistle to signal for help",
    "Dust masks, plastic sheeting and duct tape", "Moist towelettes, garbage bags and plastic ties", "Wrench or pliers to turn off utilities",
    "Manual can opener", "Local paper maps", "Phone chargers and a backup battery", "Prescription medicines and glasses",
    "Infant formula, diapers and pet food if needed", "Copies of important documents (see Documents)", "Cash",
    "Fire extinguisher", "Matches in a waterproof container", "Sleeping bag or warm blanket for each person",
    "Change of clothes and sturdy shoes", "Unscented household bleach and a medicine dropper", "Paper and pencil"
  ];
  const isImperial = () => (ROUGE.config.units || "imperial") === "imperial";
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const daysUntil = (iso) => iso ? Math.round((new Date(iso + "T00:00:00") - today()) / 86400000) : null;

  function summarize(items) {
    const people = Math.max(1, ROUGE.config.household || 2);
    let liters = 0, cal = 0;
    const expired = [], soon = [];
    for (const it of items) {
      const q = +it.qty || 0;
      if (it.cat === "water") liters += q * (+it.litersEach || 0);
      if (it.cat === "food") cal += q * (+it.calEach || 0);
      const d = daysUntil(it.expires);
      if (d !== null && q > 0) { if (d < 0) expired.push(it); else if (d <= 60) soon.push(it); }
    }
    return { people, liters, cal, waterDays: liters / (L_PER_GAL * people), foodDays: cal / (2000 * people), expired, soon };
  }
  const fmtDays = (d) => d >= 100 ? Math.round(d) : d >= 10 ? d.toFixed(0) : d.toFixed(1);
  const fmtWater = (l) => isImperial() ? `${(l / L_PER_GAL).toFixed(1)} gal` : `${l.toFixed(0)} L`;

  routes.supplies = (view) => {
    view.innerHTML = `<div class="page">
      <div class="page-head"><div class="grow"><h1>Supplies</h1><p class="muted" id="sp-sub"></p></div>
        <div class="seg" id="sp-tabs"><button data-t="list" class="active">Inventory</button><button data-t="kit">Kit checklist</button></div>
        <button class="btn" id="sp-add">${icon("plus")} Add</button></div>
      <div class="grid grid-4" id="sp-sum"></div>
      <div class="card" style="margin-top:12px" id="sp-body"></div></div>`;
    let items = [], check = null, tab = "list";
    const reload = async () => {
      const all = await api("/api/supplies").catch(() => []);
      items = all.filter((d) => d.type === "item");
      check = all.find((d) => d.type === "checklist") || null;
      draw();
    };
    const draw = () => {
      if (!$("#sp-sum")) return;
      const s = summarize(items);
      $("#sp-sub").textContent = `Counting ${s.people} ${s.people === 1 ? "person" : "people"} (change in Settings). Water at 1 gallon per person per day; food at 2,000 calories.`;
      const stat = (ic, label, value, sub, cls = "") => `<div class="card card-pad"><div class="card-head" style="margin-bottom:6px">${icon(ic)}<span class="muted small">${label}</span></div>
        <div class="stat-value ${cls}">${value}</div><div class="muted small">${sub}</div></div>`;
      const dayCls = (d) => d < 3 ? "text-bad" : d < 14 ? "text-warn" : "text-ok";
      $("#sp-sum").innerHTML =
        stat("droplet", "Water", `${fmtDays(s.waterDays)} days`, `${fmtWater(s.liters)} stored`, dayCls(s.waterDays)) +
        stat("utensils", "Food", `${fmtDays(s.foodDays)} days`, `${fmtNum(Math.round(s.cal))} calories`, dayCls(s.foodDays)) +
        stat("calendar", "Expiring soon", s.soon.length, "within 60 days", s.soon.length ? "text-warn" : "") +
        stat("alert", "Expired", s.expired.length, s.expired.length ? "replace these" : "nothing expired", s.expired.length ? "text-bad" : "");
      fillIcons($("#sp-sum"));
      tab === "kit" ? drawKit() : drawList();
    };
    const drawList = () => {
      const body = $("#sp-body");
      if (!items.length) {
        body.innerHTML = `<div class="empty"><div class="empty-icon">${icon("box")}</div><h3>No supplies yet</h3>
          <p class="muted">Add your water, food, medicine and batteries to see how many days they'll last and get reminders before things expire.</p>
          <button class="btn" id="sp-add2">${icon("plus")} Add the first item</button></div>`;
        $("#sp-add2").onclick = () => edit();
        return;
      }
      let html = `<table class="table"><tr><th>Item</th><th>Amount</th><th>Expires</th><th>Where</th><th style="width:96px"></th></tr>`;
      for (const [k, label, ic] of CATS) {
        const list = items.filter((i) => (i.cat || "other") === k).sort((a, b) => (a.expires || "9") < (b.expires || "9") ? -1 : 1);
        if (!list.length) continue;
        html += `<tr><td colspan="5" class="muted small" style="padding-top:14px"><span class="row">${icon(ic)} <b>${label}</b></span></td></tr>`;
        for (const it of list) {
          const d = daysUntil(it.expires);
          const exp = it.expires ? `<span class="${d < 0 ? "text-bad" : d <= 60 ? "text-warn" : ""}">${new Date(it.expires + "T00:00:00").toLocaleDateString()}${d < 0 ? " · expired" : d <= 60 ? ` · ${d} days` : ""}</span>` : `<span class="muted">–</span>`;
          let amt = `${fmtNum(+it.qty || 0)} ${esc(it.unit || "")}`;
          if (it.cat === "water" && it.litersEach) amt += ` <span class="muted small">(${fmtWater(it.qty * it.litersEach)})</span>`;
          if (it.cat === "food" && it.calEach) amt += ` <span class="muted small">(${fmtNum(Math.round(it.qty * it.calEach))} cal)</span>`;
          html += `<tr class="click" data-id="${it.id}"><td><b>${esc(it.name)}</b>${it.note ? `<div class="muted small">${esc(it.note)}</div>` : ""}</td>
            <td>${amt}</td><td>${exp}</td><td class="muted">${esc(it.where || "")}</td>
            <td><div class="row" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm btn-icon" data-dec="${it.id}" title="Used one">−</button>
            <button class="btn btn-ghost btn-sm btn-icon" data-inc="${it.id}" title="Add one">+</button></div></td></tr>`;
        }
      }
      body.innerHTML = html + `</table>`;
      body.querySelectorAll("tr[data-id]").forEach((tr) => { tr.onclick = (e) => { if (!e.target.closest("button")) edit(items.find((i) => i.id === tr.dataset.id)); }; });
      const bump = async (id, n) => {
        const it = items.find((i) => i.id === id);
        it.qty = Math.max(0, (+it.qty || 0) + n);
        await api(`/api/supplies/${id}`, { method: "PUT", body: it });
        draw();
      };
      body.querySelectorAll("[data-inc]").forEach((b) => { b.onclick = () => bump(b.dataset.inc, 1); });
      body.querySelectorAll("[data-dec]").forEach((b) => { b.onclick = () => bump(b.dataset.dec, -1); });
    };
    const drawKit = () => {
      const done = (check && check.done) || {};
      const n = KIT.filter((k) => done[k]).length;
      $("#sp-body").innerHTML = `<div class="card-pad"><div class="card-head">${icon("check")}<h3 class="grow">Basic disaster kit</h3><span class="muted small">${n} of ${KIT.length}</span></div>
        <div class="progress" style="margin-bottom:10px"><div style="width:${(n / KIT.length * 100).toFixed(0)}%"></div></div>
        <p class="muted small" style="margin-bottom:8px">From Ready.gov's recommended kit. Tick what you have.</p>
        ${KIT.map((k, i) => `<label class="check-row"><input type="checkbox" data-k="${i}" ${done[k] ? "checked" : ""}><span>${esc(k)}</span></label>`).join("")}</div>`;
      $("#sp-body").querySelectorAll("[data-k]").forEach((cb) => {
        cb.onchange = async () => {
          const d = { ...((check && check.done) || {}) };
          d[KIT[+cb.dataset.k]] = cb.checked;
          const doc = { type: "checklist", done: d };
          check = check ? await api(`/api/supplies/${check.id}`, { method: "PUT", body: doc })
                        : await api("/api/supplies", { method: "POST", body: doc });
          drawKit();
        };
      });
    };
    const edit = (it) => {
      const isNew = !it;
      it = it ? { ...it } : { type: "item", cat: "water", qty: 1 };
      const imp = isImperial();
      const sizeVal = it.litersEach ? (imp ? +(it.litersEach / L_PER_GAL).toFixed(3) : +it.litersEach.toFixed(2)) : "";
      openModal(`<div class="dialog-pad"><h2>${isNew ? "Add supplies" : "Edit supplies"}</h2>
        <div class="form-grid">
          <label style="grid-column:1/-1">Name<input class="input" id="e-name" placeholder="e.g. Bottled water, Canned beans, AA batteries" value="${esc(it.name || "")}"></label>
          <label>Type<select class="select" id="e-cat">${CATS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label>How many<input class="input" type="number" min="0" step="any" id="e-qty" value="${it.qty ?? 1}"></label>
          <label>Unit<input class="input" id="e-unit" placeholder="bottles, cans, packs…" value="${esc(it.unit || "")}"></label>
          <label data-for="water">${imp ? "Gallons" : "Litres"} in each<input class="input" type="number" min="0" step="any" id="e-size" value="${sizeVal}" placeholder="${imp ? "e.g. 0.13 for a 16.9 oz bottle" : "e.g. 0.5"}"></label>
          <label data-for="food">Calories in each<input class="input" type="number" min="0" step="any" id="e-cal" value="${it.calEach || ""}" placeholder="from the label: servings × calories"></label>
          <label>Expires<input class="input" type="date" id="e-exp" value="${esc(it.expires || "")}"></label>
          <label>Where it's kept<input class="input" id="e-where" placeholder="Basement shelf" value="${esc(it.where || "")}"></label>
          <label style="grid-column:1/-1">Note<input class="input" id="e-note" value="${esc(it.note || "")}"></label>
        </div>
        <div class="dialog-actions">${isNew ? "" : `<button class="btn btn-ghost" data-del style="margin-right:auto">${icon("trash")} Delete</button>`}
          <button class="btn btn-outline" data-x>Cancel</button><button class="btn" data-ok>Save</button></div></div>`,
      (b, close) => {
        const catSel = b.querySelector("#e-cat");
        catSel.value = it.cat || "other";
        const sync = () => b.querySelectorAll("[data-for]").forEach((el) => { el.hidden = el.dataset.for !== catSel.value; });
        catSel.onchange = sync; sync();
        b.querySelector("#e-name").focus();
        b.querySelector("[data-x]").onclick = close;
        const del = b.querySelector("[data-del]");
        if (del) del.onclick = async () => { close(); if (await confirmDialog("Delete this item?", it.name)) { await api(`/api/supplies/${it.id}`, { method: "DELETE" }); reload(); } };
        b.querySelector("[data-ok]").onclick = async () => {
          const size = parseFloat(b.querySelector("#e-size").value);
          const doc = { type: "item", name: b.querySelector("#e-name").value.trim() || "Unnamed", cat: catSel.value,
            qty: parseFloat(b.querySelector("#e-qty").value) || 0, unit: b.querySelector("#e-unit").value.trim(),
            litersEach: !isNaN(size) ? (imp ? size * L_PER_GAL : size) : null, calEach: parseFloat(b.querySelector("#e-cal").value) || null,
            expires: b.querySelector("#e-exp").value || "", where: b.querySelector("#e-where").value.trim(), note: b.querySelector("#e-note").value.trim() };
          try {
            if (isNew) await api("/api/supplies", { method: "POST", body: doc });
            else await api(`/api/supplies/${it.id}`, { method: "PUT", body: doc });
            close(); toast("Saved"); reload();
          } catch (e) { toast(e.message); }
        };
      });
    };
    $("#sp-add").onclick = () => edit();
    $("#sp-tabs").querySelectorAll("button").forEach((b) => {
      b.onclick = () => { tab = b.dataset.t; $("#sp-tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); draw(); };
    });
    reload();
  };

  homeHooks.push((view) => {
    if (ROUGE.guest) return null;
    api("/api/supplies").then((all) => {
      const s = summarize(all.filter((d) => d.type === "item"));
      if (s.expired.length) homeAlert(view, "sup-exp", `${icon("alert")}<div class="grow"><b>${s.expired.length} supply item${s.expired.length > 1 ? "s have" : " has"} expired:</b>
        <span class="muted">${esc(s.expired.slice(0, 3).map((i) => i.name).join(", "))}${s.expired.length > 3 ? "…" : ""}</span></div><a class="btn btn-sm btn-outline" href="#/supplies">Review</a>`, "bad");
      else if (s.soon.length) homeAlert(view, "sup-soon", `${icon("calendar")}<div class="grow"><b>${s.soon.length} item${s.soon.length > 1 ? "s expire" : " expires"} within 60 days:</b>
        <span class="muted">${esc(s.soon.slice(0, 3).map((i) => i.name).join(", "))}</span></div><a class="btn btn-sm btn-outline" href="#/supplies">Review</a>`);
    }).catch(() => {});
    return null;
  });
})();
