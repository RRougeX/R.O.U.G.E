// Sun & Moon module: sunrise, sunset, daylight and moon phase, computed offline.
// Sun position formulas follow the widely used approach in SunCalc (Vladimir
// Agafonkin, BSD licence), based on https://aa.quae.nl/en/reken/zonpositie.html
"use strict";
(() => {
  toolRoutes.sky = true;
  const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toJulian = (d) => d.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (d) => toJulian(d) - J2000;
  const meanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  const eclipticLon = (M) => {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return M + C + rad * 102.9372 + Math.PI;
  };
  const declination = (l) => Math.asin(Math.sin(e) * Math.sin(l));
  const J0 = 0.0009;

  function sunTimes(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date);
    const n = Math.round(d - J0 - lw / (2 * Math.PI));
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = meanAnomaly(ds), L = eclipticLon(M), dec = declination(L);
    const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const at = (h) => {
      const cosw = (Math.sin(h * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
      if (cosw < -1) return { always: "up" };
      if (cosw > 1) return { always: "down" };
      const w = Math.acos(cosw);
      const Jset = J2000 + (J0 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
      return { rise: fromJulian(Jnoon - (Jset - Jnoon)), set: fromJulian(Jset) };
    };
    return { noon: fromJulian(Jnoon), sun: at(-0.833), civil: at(-6) };
  }

  // Moon phase from the mean synodic month, good to within about half a day.
  function moon(date) {
    const synodic = 29.530588853;
    const ref = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
    const age = ((((date - ref) / dayMs) % synodic) + synodic) % synodic;
    const phase = age / synodic;
    const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
    const name = names[Math.floor((phase * 8 + 0.5) % 8)];
    const nextFull = ((0.5 - phase + 1) % 1) * synodic, nextNew = ((1 - phase) % 1) * synodic;
    return { phase, illum, name, age, nextFull, nextNew };
  }

  function moonSVG(phase, size = 64) {
    // lit part: right side while waxing, left while waning (Northern Hemisphere view)
    const r = size / 2 - 2, c = size / 2;
    const k = Math.cos(2 * Math.PI * phase); // 1 new, -1 full
    const waxing = phase < 0.5;
    const rx = Math.abs(k) * r;
    const sweepOuter = waxing ? 1 : 0;
    const sweepInner = (k > 0) === waxing ? 0 : 1;
    const lit = `M${c} ${c - r} A${r} ${r} 0 0 ${sweepOuter} ${c} ${c + r} A${rx} ${r} 0 0 ${sweepInner} ${c} ${c - r}Z`;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="#27272a"/>
      <path d="${lit}" fill="#f4f1de"/><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="hsl(var(--border))"/></svg>`;
  }

  async function where() {
    if (isOn("gps")) {
      const f = await api("/api/gps").catch(() => null);
      if (f && f.mode >= 2) return { lat: f.lat, lon: f.lon, from: "GPS" };
    }
    const h = ROUGE.config.home;
    if (h) return { lat: h.lat, lon: h.lon, from: "home location" };
    return null;
  }
  const tfmt = (d) => d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "–";
  const hm = (ms) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)} h ${m % 60} min`; };

  function todayHTML(loc) {
    const now = new Date();
    const t = sunTimes(now, loc.lat, loc.lon);
    const m = moon(now);
    let daylight = "–", left = "";
    if (t.sun.rise) {
      daylight = hm(t.sun.set - t.sun.rise);
      left = now < t.sun.rise ? `Sunrise in ${hm(t.sun.rise - now)}` : now < t.sun.set ? `${hm(t.sun.set - now)} of daylight left` : "The sun has set";
    } else left = t.sun.always === "up" ? "The sun doesn't set today" : "The sun doesn't rise today";
    return { t, m, daylight, left };
  }

  toolStatus.sky = async () => {
    const loc = await where();
    if (!loc) return "Set your home location";
    return todayHTML(loc).left;
  };

  routes.sky = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")}</a>
      <div class="grow"><h1>Sun & Moon</h1><p class="muted" id="sk-sub"></p></div></div><div id="sk-body"></div></div>`;
    const draw = async () => {
      const loc = await where();
      const body = $("#sk-body");
      if (!body) return;
      if (!loc) {
        body.innerHTML = `<div class="empty"><div class="empty-icon">${icon("sunrise")}</div><h3>Where are you?</h3>
          <p class="muted">Sunrise and sunset depend on your location. Set your home location in Settings, open a pin on the map and choose "Set as home", or connect a GPS.</p>
          <a class="btn" href="#/settings">Open Settings</a></div>`;
        return;
      }
      $("#sk-sub").textContent = `${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)} · from your ${loc.from} · ${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}`;
      const { t, m, daylight, left } = todayHTML(loc);
      const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return [d, sunTimes(d, loc.lat, loc.lon)]; });
      body.innerHTML = `<div class="alert alert-ok">${icon("sun")}<div class="grow"><b>${esc(left)}</b></div></div>
        <div class="grid grid-4">
          <div class="card card-pad"><div class="muted small">First light</div><div class="big-num">${tfmt(t.civil.rise)}</div><div class="muted small">enough light to work outside</div></div>
          <div class="card card-pad"><div class="muted small">Sunrise</div><div class="big-num">${tfmt(t.sun.rise)}</div><div class="muted small">solar noon ${tfmt(t.noon)}</div></div>
          <div class="card card-pad"><div class="muted small">Sunset</div><div class="big-num">${tfmt(t.sun.set)}</div><div class="muted small">${daylight} of daylight</div></div>
          <div class="card card-pad"><div class="muted small">Last light</div><div class="big-num">${tfmt(t.civil.set)}</div><div class="muted small">dark after this</div></div>
        </div>
        <div class="grid grid-2" style="margin-top:12px">
          <div class="card card-pad"><div class="card-head">${icon("moon")}<h3>Moon</h3></div><div class="row" style="gap:16px">${moonSVG(m.phase, 72)}
            <div><div class="big-num" style="font-size:22px">${m.name}</div><div class="muted small">${Math.round(m.illum * 100)}% lit · ${m.age.toFixed(1)} days old</div>
            <div class="muted small">Full moon in ${m.nextFull.toFixed(0)} days · new moon in ${m.nextNew.toFixed(0)} days</div></div></div>
            <p class="muted small" style="margin-top:10px">A bright moon helps with night travel and signaling; a new moon means very dark nights.</p></div>
          <div class="card"><table class="table"><tr><th>Day</th><th>Sunrise</th><th>Sunset</th><th>Daylight</th></tr>
            ${days.map(([d, s]) => `<tr><td>${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</td><td>${tfmt(s.sun.rise)}</td><td>${tfmt(s.sun.set)}</td>
              <td class="muted">${s.sun.rise ? hm(s.sun.set - s.sun.rise) : "–"}</td></tr>`).join("")}</table></div></div>
        <p class="muted small" style="margin-top:10px">Times are worked out on this device and depend on the clock being right. They're usually within a minute or two.</p>`;
      fillIcons(body);
    };
    draw();
    const t = setInterval(draw, 60000);
    return () => clearInterval(t);
  };

  homeHooks.push((view) => {
    where().then((loc) => {
      if (!loc || !view.querySelector("#home-extra")) return;
      const { t, m, left } = todayHTML(loc);
      const dl = t.sun.rise ? hm(t.sun.set - t.sun.rise) : "–";
      homeCard(view, `<div class="card-head">${icon("sunrise")}<h3 class="grow">Today</h3><a class="muted small" href="#/sky">Sun & Moon →</a></div>
        <div class="today">${moonSVG(m.phase, 44)}
          <div><span class="muted">Sunrise</span><b>${tfmt(t.sun.rise)}</b></div>
          <div><span class="muted">Sunset</span><b>${tfmt(t.sun.set)}</b></div>
          <div><span class="muted">Daylight</span><b>${dl}</b></div>
          <div><span class="muted">Moon</span><b>${Math.round(m.illum * 100)}% lit</b></div></div>
        <p class="small muted" style="margin-top:8px">${esc(left)} · ${m.name}</p>`);
    });
    return null;
  });

  window.rougeSky = { sunTimes, moon };
})();
