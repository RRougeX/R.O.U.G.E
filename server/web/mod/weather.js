// Barometer module: pressure, temperature, humidity and a storm warning.
"use strict";
(() => {
  toolRoutes.weather = true;
  const imp = () => (ROUGE.config.units || "imperial") === "imperial";
  const temp = (c) => imp() ? `${(c * 9 / 5 + 32).toFixed(0)}°F` : `${c.toFixed(1)}°C`;
  const press = (h) => imp() ? `${(h * 0.02953).toFixed(2)} inHg` : `${h.toFixed(1)} hPa`;
  toolStatus.weather = async () => {
    const w = await api("/api/weather");
    return w.now ? `${press(w.seaLevel || w.now.hPa)} · ${temp(w.now.tempC)}` : (w.error || "Waiting for sensor");
  };

  function chart(hist) {
    if (hist.length < 2) return `<p class="muted small">The pressure chart appears once a few readings are saved (every 10 minutes).</p>`;
    const W = 600, H = 120, P = 22;
    const xs = hist.map((r) => Date.parse(r.t)), ys = hist.map((r) => r.hPa);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
    const x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
    const X = (t) => P + (t - x0) / (x1 - x0 || 1) * (W - P * 2), Y = (v) => 8 + (hi - v) / (hi - lo) * (H - 26);
    const line = hist.map((r, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)} ${Y(r.hPa).toFixed(1)}`).join(" ");
    const area = `${line} L${X(x1).toFixed(1)} ${H - 18} L${X(x0).toFixed(1)} ${H - 18}Z`;
    const hours = Math.round((x1 - x0) / 3600000);
    return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="${P}" x2="${W - P}" y1="${H - 18}" y2="${H - 18}"/><path class="area" d="${area}"/><path class="line" d="${line}"/>
      <text x="${P}" y="${H - 4}">${hours} h ago</text><text x="${W - P}" y="${H - 4}" text-anchor="end">now</text>
      <text x="${W - P}" y="12" text-anchor="end">${hi.toFixed(0)} hPa</text><text x="${W - P}" y="${H - 22}" text-anchor="end">${lo.toFixed(0)}</text></svg>`;
  }

  routes.weather = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")}</a>
      <div class="grow"><h1>Barometer</h1><p class="muted" id="w-sub"></p></div></div><div id="w-body"></div></div>`;
    const draw = async () => {
      const w = await api("/api/weather").catch((e) => ({ error: e.message }));
      const body = $("#w-body");
      if (!body) return;
      $("#w-sub").textContent = w.sensor ? `${w.sensor} sensor` : "";
      if (!w.now) {
        body.innerHTML = `<div class="empty"><div class="empty-icon">${icon("gauge")}</div><h3>No sensor reading yet</h3>
          <p class="muted">${esc(w.error || "Starting…")}</p><p class="muted small">Connect a BME280 or BMP280 board to the Pi: VIN to 3.3 V (pin 1), GND to pin 6, SDA to pin 3, SCL to pin 5.</p></div>`;
        return;
      }
      const d = w.trend || 0;
      const kind = !w.trendReady ? "ok" : d <= -3 ? "bad" : d <= -1 ? "warn" : "ok";
      body.innerHTML = `<div class="alert alert-${kind}">${icon(kind === "ok" ? "gauge" : "alert")}<div class="grow"><b>${esc(w.outlook)}</b>
          ${w.trendReady ? `<span class="muted"> ${d > 0 ? "+" : ""}${d.toFixed(1)} hPa in 3 hours.</span>` : ""}</div></div>
        <div class="grid grid-3">
          <div class="card card-pad"><div class="muted small">Pressure${w.seaLevel !== w.now.hPa ? " (sea level)" : ""}</div><div class="big-num">${press(w.seaLevel || w.now.hPa)}</div>
            <div class="muted small">${w.seaLevel !== w.now.hPa ? `station ${w.now.hPa.toFixed(1)} hPa` : "set your altitude in Settings for sea-level pressure"}</div></div>
          <div class="card card-pad"><div class="muted small">Temperature</div><div class="big-num">${temp(w.now.tempC)}</div><div class="muted small">where the sensor is</div></div>
          <div class="card card-pad"><div class="muted small">Humidity</div><div class="big-num">${w.now.hum != null ? Math.round(w.now.hum) + "%" : "–"}</div><div class="muted small">${w.now.hum != null ? "relative humidity" : "BMP280 has no humidity sensor"}</div></div></div>
        <div class="card card-pad" style="margin-top:12px"><div class="card-head">${icon("gauge")}<h3>Pressure, last 48 hours</h3></div>${chart(w.history || [])}</div>
        <p class="muted small" style="margin-top:10px">A rule of thumb used by sailors and weather watchers: a fall of 3 hPa or more in 3 hours means worsening weather. Keep the sensor away from the Pi's heat for accurate temperature.</p>`;
      fillIcons(body);
    };
    draw();
    const t = setInterval(draw, 30000);
    return () => clearInterval(t);
  };

  homeHooks.push((view) => {
    api("/api/weather").then((w) => {
      if (!w.now || !w.trendReady || w.trend > -3) return;
      homeAlert(view, "storm", `${icon("alert")}<div class="grow"><b>${esc(w.outlook)}</b> <span class="muted">${w.trend.toFixed(1)} hPa in 3 hours.</span></div><a class="btn btn-sm btn-outline" href="#/weather">Barometer</a>`, "bad");
    }).catch(() => {});
    return null;
  });
})();
