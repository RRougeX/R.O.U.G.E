// SOS Light module: flashlight, red night light, SOS strobe, Morse flasher, whistle.
"use strict";
(() => {
  toolRoutes.sos = true;
  toolStatus.sos = async () => "Flashlight, strobe, Morse, whistle";
  const MORSE = { A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
    M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----." };
  const UNIT = 250; // ms: dot = 1, dash = 3, gap in letter = 1, between letters = 3, between words = 7

  // returns a list of [on?, units]
  function morseTimeline(text) {
    const out = [];
    const words = text.toUpperCase().split(/\s+/).filter(Boolean);
    words.forEach((w, wi) => {
      [...w].forEach((ch, ci) => {
        const code = MORSE[ch];
        if (!code) return;
        [...code].forEach((sym, si) => {
          out.push([true, sym === "." ? 1 : 3]);
          if (si < code.length - 1) out.push([false, 1]);
        });
        if (ci < w.length - 1) out.push([false, 3]);
      });
      out.push([false, wi < words.length - 1 ? 7 : 14]);
    });
    return out;
  }

  let audio = null;
  function tone(on) {
    try {
      if (!audio) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        audio.osc = audio.createOscillator(); audio.gain = audio.createGain();
        audio.osc.frequency.value = 3000; audio.gain.gain.value = 0;
        audio.osc.connect(audio.gain).connect(audio.destination); audio.osc.start();
      }
      audio.gain.gain.setTargetAtTime(on ? 0.6 : 0, audio.currentTime, 0.005);
    } catch (e) {}
  }

  function fullscreen(mode, opts = {}) {
    const el = document.createElement("div");
    el.className = "sos-screen " + (mode === "red" ? "red" : mode === "white" ? "white" : "");
    el.innerHTML = `<span class="sos-hint">${esc(opts.hint || "Tap anywhere or press Esc to close")}</span>`;
    document.body.appendChild(el);
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
    let timer = null, stopped = false, wake = null;
    try { navigator.wakeLock && navigator.wakeLock.request("screen").then((w) => { wake = w; }).catch(() => {}); } catch (e) {}
    const close = () => {
      stopped = true; clearTimeout(timer); el.remove(); tone(false);
      document.removeEventListener("keydown", onKey);
      try { wake && wake.release(); } catch (e) {}
      try { document.fullscreenElement && document.exitFullscreen(); } catch (e) {}
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    el.onclick = close;
    if (opts.timeline) {
      let i = 0;
      const step = () => {
        if (stopped) return;
        const [on, units] = opts.timeline[i];
        el.style.background = on ? "#fff" : "#000";
        if (opts.sound) tone(on);
        i = (i + 1) % opts.timeline.length;
        timer = setTimeout(step, units * UNIT);
      };
      step();
    }
    return close;
  }

  routes.sos = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")}</a>
      <div class="grow"><h1>SOS Light</h1><p class="muted">Turn the screen into a light or a signal. Turn the screen brightness all the way up.</p></div></div>
      <div class="sos-big">
        <button data-m="white">${icon("sun")}Flashlight</button>
        <button data-m="red">${icon("eye")}Red night light<span class="muted small" style="font-weight:400">keeps your night vision</span></button>
        <button data-m="sos" class="danger">${icon("siren")}SOS strobe</button>
        <button data-m="sos-sound" class="danger">${icon("alert")}SOS with sound</button>
        <button data-m="whistle">${icon("radio")}Signal whistle<span class="muted small" style="font-weight:400">3 blasts, repeats</span></button>
        <button data-m="morse">${icon("message")}Flash a message</button>
      </div>
      <div class="card card-pad" style="margin-top:12px"><div class="card-head">${icon("message")}<h3>Morse message</h3></div>
        <div class="row"><input class="input grow" id="mo-text" placeholder="e.g. HELP 2 HURT" maxlength="60" value="SOS">
        <label class="row small muted"><input type="checkbox" id="mo-sound"> Sound</label></div>
        <p class="mono" id="mo-code" style="margin-top:10px;word-break:break-all"></p>
        <p class="muted small" style="margin-top:6px">Letters A–Z and numbers. ${UNIT} ms per dot. Three of anything means distress: 3 flashes, 3 blasts.</p></div></div>`;
    const code = () => {
      const t = $("#mo-text").value.toUpperCase();
      $("#mo-code").textContent = t.split(/\s+/).map((w) => [...w].map((c) => MORSE[c] || "").join(" ")).join("  /  ").replace(/\./g, "·").replace(/-/g, "–");
    };
    $("#mo-text").addEventListener("input", code);
    code();
    view.querySelectorAll("[data-m]").forEach((b) => {
      b.onclick = () => {
        const m = b.dataset.m;
        if (m === "white" || m === "red") return fullscreen(m);
        if (m === "sos" || m === "sos-sound") return fullscreen("black", { timeline: morseTimeline("SOS"), sound: m === "sos-sound", hint: "SOS · tap to stop" });
        if (m === "morse") return fullscreen("black", { timeline: morseTimeline($("#mo-text").value || "SOS"), sound: $("#mo-sound").checked, hint: "Flashing your message · tap to stop" });
        if (m === "whistle") {
          // three 1-second blasts, a pause, repeat
          const tl = [[true, 4], [false, 2], [true, 4], [false, 2], [true, 4], [false, 12]];
          return fullscreen("black", { timeline: tl, sound: true, hint: "Whistle · tap to stop" });
        }
      };
    });
    return () => tone(false);
  };
})();
