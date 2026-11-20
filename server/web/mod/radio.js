// Weather Radio module: RTL-SDR receiver for NOAA weather radio and more.
"use strict";
(() => {
  toolRoutes.radio = true;
  const NOAA = [162.400, 162.425, 162.450, 162.475, 162.500, 162.525, 162.550];
  const PRESETS = [
    ["GMRS/FRS 20", 462.675, "nfm"], ["GMRS/FRS 1", 462.5625, "nfm"], ["CB 9 (emergency)", 27.065, "am"], ["CB 19 (road)", 27.185, "am"],
    ["Marine 16", 156.800, "nfm"], ["Ham 2 m calling", 146.520, "nfm"], ["Ham 70 cm calling", 446.000, "nfm"]
  ];
  const label = (s) => s.playing ? `Playing ${s.freq.toFixed(3)} MHz` : !s.installed ? "Radio software not installed" : s.dongle ? "Ready" : "No RTL-SDR dongle plugged in";
  toolStatus.radio = async () => label(await api("/api/radio"));

  routes.radio = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")}</a>
      <div class="grow"><h1>Weather Radio</h1><p class="muted" id="r-sub"></p></div>
      <button class="btn btn-destructive" id="r-stop" hidden>${icon("stop")} Stop</button></div>
      <div id="r-alert"></div>
      <div class="card card-pad"><div class="card-head">${icon("radio")}<h3 class="grow">NOAA Weather Radio</h3>
        <button class="btn btn-outline btn-sm" id="r-scan">${icon("search")} Scan</button></div>
        <p class="muted small">Forecasts and emergency alerts around the clock. Try each channel; one or two will be clear where you are. Scan plays each for 6 seconds.</p>
        <div class="chips" style="margin-top:10px" id="r-noaa">${NOAA.map((f, i) => `<button class="chip" data-f="${f}" data-m="nfm">WX${i + 1} · ${f.toFixed(3)}</button>`).join("")}</div></div>
      <div class="grid grid-2" style="margin-top:12px">
        <div class="card card-pad"><div class="card-head">${icon("radio-tower")}<h3>Other channels</h3></div>
          <div class="chips">${PRESETS.map(([n, f, m]) => `<button class="chip" data-f="${f}" data-m="${m}">${esc(n)}</button>`).join("")}</div>
          <p class="muted small" style="margin-top:10px">Listening only. See the Field Guide's radio card for what each is used for.</p></div>
        <div class="card card-pad"><div class="card-head">${icon("settings")}<h3>Tune by hand</h3></div>
          <div class="row" style="flex-wrap:wrap"><input class="input" id="r-freq" type="number" step="0.0025" placeholder="MHz, e.g. 98.1" style="width:150px">
          <select class="select" id="r-mode"><option value="wbfm">FM radio station</option><option value="nfm">Narrow FM (two-way radio)</option><option value="am">AM (CB, aircraft)</option></select>
          <button class="btn" id="r-play">${icon("play")} Play</button></div>
          <p class="muted small" style="margin-top:10px">Local FM news stations (88–108 MHz) carry emergency broadcasts too. Sound comes out of the Pi's speaker or headphones.</p></div></div></div>`;
    let scanTimer = null;
    const play = async (freq, mode) => {
      try { const s = await api("/api/radio", { method: "POST", body: { action: "play", freq, mode } }); draw(s); }
      catch (e) { toast(e.message); }
    };
    const stop = async () => { clearTimeout(scanTimer); scanTimer = null; draw(await api("/api/radio", { method: "POST", body: { action: "stop" } }).catch(() => null)); };
    const draw = async (s) => {
      s = s || await api("/api/radio").catch(() => null);
      if (!s || !$("#r-sub")) return;
      $("#r-sub").textContent = label(s) + (scanTimer ? " · scanning" : "");
      $("#r-stop").hidden = !s.playing;
      $("#r-alert").innerHTML = !s.installed ? `<div class="alert alert-warn">${icon("alert")}<div class="grow">The radio software (rtl-sdr) isn't installed. Run <span class="code">rouge-setup</span> and select Weather Radio.</div></div>`
        : !s.dongle ? `<div class="alert alert-warn">${icon("alert")}<div class="grow">Plug in an RTL-SDR USB dongle with its antenna. Antenna length matters: about 18 inches (46 cm) for weather radio.</div></div>`
        : s.error && !s.playing ? `<div class="alert alert-bad">${icon("alert")}<div class="grow mono small">${esc(s.error.slice(-300))}</div></div>` : "";
      fillIcons($("#r-alert"));
      view.querySelectorAll("[data-f]").forEach((b) => b.classList.toggle("active", s.playing && Math.abs(+b.dataset.f - s.freq) < 0.001));
    };
    view.querySelectorAll("[data-f]").forEach((b) => { b.onclick = () => { clearTimeout(scanTimer); scanTimer = null; play(+b.dataset.f, b.dataset.m); }; });
    $("#r-play").onclick = () => { const f = parseFloat($("#r-freq").value); if (!f) return toast("Enter a frequency in MHz"); play(f, $("#r-mode").value); };
    $("#r-stop").onclick = stop;
    $("#r-scan").onclick = () => {
      let i = 0;
      const next = () => { play(NOAA[i], "nfm"); i = (i + 1) % NOAA.length; scanTimer = setTimeout(next, 6000); };
      clearTimeout(scanTimer); next();
      toast("Scanning. Tap a channel to stay on it.");
    };
    draw();
    const t = setInterval(() => draw(), 5000);
    return () => { clearInterval(t); clearTimeout(scanTimer); }; // keeps playing when you leave the page
  };
})();
