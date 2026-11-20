// Power module: power saver, radios, brightness and battery-run history.
"use strict";
(() => {
  toolRoutes.power = true;
  const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  toolStatus.power = async () => {
    const p = await api("/api/power");
    return p.state.powerSave ? "Power saver is on" : "Power saver is off";
  };

  routes.power = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")}</a>
      <div class="grow"><h1>Power</h1><p class="muted">Make the battery last longer.</p></div></div>
      <div id="p-alert"></div>
      <div class="grid grid-2"><div class="card" id="p-switches"></div><div class="card card-pad" id="p-runs"></div></div>
      <div class="card card-pad" style="margin-top:12px"><div class="card-head">${icon("zap")}<h3>Biggest savings</h3></div>
        <ul class="muted small tips">
          <li>Turn the screen brightness down: on a cyberdeck the screen often uses more power than the Pi.</li>
          <li>Close the Maps page when you're not using it. Drawing maps keeps the processor and graphics busy.</li>
          <li>Turn Wi-Fi and Bluetooth off when nothing needs them.</li>
          <li>Unplug USB devices you aren't using (radios, GPS, drives).</li>
          <li>A red under-voltage warning means the power bank or cable can't keep up. Use a short, thick USB-C cable.</li>
        </ul></div></div>`;
    const draw = async () => {
      const p = await api("/api/power").catch((e) => ({ error: e.message }));
      if (!$("#p-switches")) return;
      if (p.error) { $("#p-switches").innerHTML = `<div class="card-pad muted">${esc(p.error)}</div>`; return; }
      const s = p.state;
      $("#p-alert").innerHTML = s.helperReady ? "" : `<div class="alert alert-warn">${icon("alert")}<div class="grow">The switches need the R.O.U.G.E system helper. Run <span class="code">rouge-setup</span> and select Power.</div></div>`;
      const row = (key, ic, name, desc, on, avail = true) => `<div class="set-row"><span class="tool-icon">${icon(ic)}</span>
        <div class="grow"><b>${name}</b><div class="muted small">${desc}</div></div>${avail ? switchHTML(key, on, !s.helperReady) : `<span class="muted small">not found</span>`}</div>`;
      $("#p-switches").innerHTML =
        row("powersave", "battery", "Power saver", "Slower processor, Bluetooth off, screen dimmed, status lights off.", s.powerSave) +
        row("wifi", "wifi", "Wi-Fi", "Needed for the hotspot and for downloads.", !!s.wifi, s.wifi !== null) +
        row("bluetooth", "bluetooth", "Bluetooth", "Wireless keyboards, mice and headphones.", !!s.bluetooth, s.bluetooth !== null) +
        (s.brightness !== null ? `<div class="set-row"><span class="tool-icon">${icon("sun")}</span><div class="grow"><b>Brightness</b>
          <input type="range" min="5" max="100" value="${s.brightness}" id="p-bright" style="width:100%"></div><span class="mono small" id="p-bv">${s.brightness}%</span></div>`
          : `<div class="set-row"><span class="tool-icon">${icon("sun")}</span><div class="grow"><b>Brightness</b><div class="muted small">This screen has no software brightness control. Use the buttons on the screen itself.</div></div></div>`);
      fillIcons($("#p-switches"));
      $("#p-switches").querySelectorAll("[data-switch]").forEach((sw) => {
        sw.onclick = async () => {
          sw.disabled = true;
          try { await api("/api/power", { method: "POST", body: { action: sw.dataset.switch, on: !sw.classList.contains("on") } }); }
          catch (e) { toast(e.message); }
          draw();
        };
      });
      const br = $("#p-bright");
      if (br) {
        br.oninput = () => { $("#p-bv").textContent = br.value + "%"; };
        br.onchange = () => api("/api/power", { method: "POST", body: { action: "brightness", value: +br.value } }).catch((e) => toast(e.message));
      }
      const runs = p.sessions || [];
      const now = Date.parse(p.now) || Date.now();
      const past = runs.slice(1).map((r) => Date.parse(r.last) - Date.parse(r.start)).filter((d) => d > 5 * 60000);
      const avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;
      $("#p-runs").innerHTML = `<div class="card-head">${icon("clock")}<h3 class="grow">Battery runs</h3></div>
        <p class="muted small">How long the Pi stayed on each time it was powered up. Charge the bank fully, run until it dies, and this shows your real battery life.</p>
        <div class="row" style="margin:12px 0;gap:24px"><div><div class="muted small">This run so far</div><div class="big-num">${runs[0] ? dur(now - Date.parse(runs[0].start)) : "–"}</div></div>
        <div><div class="muted small">Average past run</div><div class="big-num">${avg ? dur(avg) : "–"}</div></div></div>
        <table class="table">${runs.slice(1, 9).map((r) => `<tr><td>${new Date(r.start).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
          <td>${dur(Date.parse(r.last) - Date.parse(r.start))}</td><td>${r.lowVoltage ? `<span class="badge badge-warn">low voltage</span>` : ""}</td></tr>`).join("") || `<tr><td class="muted">No earlier runs yet.</td></tr>`}</table>`;
      fillIcons($("#p-runs"));
    };
    draw();
    const t = setInterval(draw, 15000);
    return () => clearInterval(t);
  };
})();
