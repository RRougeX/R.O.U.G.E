// Share & Board module: Wi-Fi hotspot for nearby phones and a local message board.
"use strict";
(() => {
  toolRoutes.share = true;
  toolStatus.share = async () => {
    if (ROUGE.guest) return "Message board";
    const s = await api("/api/share");
    return s.active ? `Hotspot on: ${s.ssid}` : "Hotspot off";
  };

  routes.share = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")}</a>
      <div class="grow"><h1>Share & Board</h1><p class="muted">${ROUGE.guest ? "Messages for everyone connected to this R.O.U.G.E." : "Let nearby phones use R.O.U.G.E with no internet, and leave messages for each other."}</p></div></div>
      <div class="grid ${ROUGE.guest ? "" : "grid-2"}">
        ${ROUGE.guest ? "" : `<div class="card card-pad" id="sh-card"></div>`}
        <div class="card card-pad"><div class="card-head">${icon("message")}<h3 class="grow">Message board</h3><span class="muted small" id="b-count"></span></div>
          <div class="chat" id="b-list"></div>
          <form class="chat-input" id="b-form"><input class="input" id="b-name" placeholder="Name" style="width:110px" maxlength="40">
            <input class="input grow" id="b-text" placeholder="Write a message…" maxlength="500" autocomplete="off"><button class="btn" type="submit">${icon("send")}</button></form>
        </div></div></div>`;
    const drawShare = async () => {
      const box = $("#sh-card");
      if (!box) return;
      const s = await api("/api/share").catch((e) => ({ error: e.message }));
      if (s.error) { box.innerHTML = `<p class="muted">${esc(s.error)}</p>`; return; }
      box.innerHTML = `<div class="card-head">${icon("wifi")}<h3 class="grow">Wi-Fi hotspot</h3>${switchHTML("hotspot", s.active, !s.ready)}</div>
        ${!s.ready ? `<div class="alert alert-warn">${icon("alert")}<div class="grow">Needs NetworkManager and the R.O.U.G.E helper. Run <span class="code">rouge-setup</span>.</div></div>` : ""}
        <p class="muted small">${s.active ? "Phones can join now. Turning the hotspot on disconnects this Pi from other Wi-Fi." : "The Pi makes its own Wi-Fi network. It disconnects from any other Wi-Fi while it's on."}</p>
        <div class="share-big"><div><span class="muted small">Network</span><b>${esc(s.ssid)}</b></div>
          <div><span class="muted small">Password</span><b class="mono">${esc(s.password)}</b></div>
          <div><span class="muted small">Then open</span><b class="mono">${esc(s.url || "http://10.42.0.1:" + location.port)}</b></div></div>
        <p class="muted small">Phones get the guide, library, maps and this board. Notes, documents, supplies and settings stay private to this device.</p>
        <button class="btn btn-outline btn-sm" id="sh-edit" style="margin-top:10px">${icon("edit")} Change name or password</button>
        ${s.lanURLs && s.lanURLs.length ? `<p class="muted small" style="margin-top:10px">Also open on your home network: <span class="mono">${s.lanURLs.map(esc).join(", ")}</span></p>` : ""}`;
      fillIcons(box);
      const sw = box.querySelector("[data-switch]");
      sw.onclick = async () => {
        sw.disabled = true;
        toast(sw.classList.contains("on") ? "Turning the hotspot off…" : "Starting the hotspot…");
        try { await api("/api/share", { method: "POST", body: { on: !sw.classList.contains("on") } }); } catch (e) { toast(e.message); }
        drawShare();
      };
      $("#sh-edit").onclick = () => openModal(`<div class="dialog-pad"><h2>Hotspot name and password</h2>
        <label class="field">Network name<input class="input" id="h-ssid" value="${esc(s.ssid)}" maxlength="32"></label>
        <label class="field">Password (8 or more characters)<input class="input" id="h-pass" value="${esc(s.password)}" maxlength="63"></label>
        <p class="muted small">Takes effect the next time the hotspot starts.</p>
        <div class="dialog-actions"><button class="btn btn-outline" data-x>Cancel</button><button class="btn" data-ok>Save</button></div></div>`, (b, close) => {
        b.querySelector("[data-x]").onclick = close;
        b.querySelector("[data-ok]").onclick = async () => {
          try { await api("/api/config", { method: "PUT", body: { hotspotSSID: b.querySelector("#h-ssid").value.trim(), hotspotPass: b.querySelector("#h-pass").value } }); close(); drawShare(); toast("Saved"); }
          catch (e) { toast(e.message); }
        };
      });
    };
    let lastCount = -1;
    const drawBoard = async () => {
      const msgs = await api("/api/board").catch(() => null);
      const list = $("#b-list");
      if (!msgs || !list) return;
      if (msgs.length === lastCount) return;
      lastCount = msgs.length;
      const me = store("board-name") || "";
      list.innerHTML = msgs.length ? msgs.slice().reverse().map((m) => `<div class="msg${m.name === me && me ? " mine" : ""}">
        <div class="who">${esc(m.name)}${m.fromDevice ? " · R.O.U.G.E" : ""} · ${fmtAgo(m.created)}</div><div class="text">${esc(m.text)}</div>
        ${ROUGE.guest ? "" : `<button class="btn btn-ghost btn-sm" data-del="${m.id}" style="height:22px;padding:0 6px;font-size:11px">delete</button>`}</div>`).join("")
        : `<p class="muted small">No messages yet. Post who you are, what you need, or what you can offer.</p>`;
      $("#b-count").textContent = msgs.length ? `${msgs.length} message${msgs.length > 1 ? "s" : ""}` : "";
      list.scrollTop = list.scrollHeight;
      list.querySelectorAll("[data-del]").forEach((b) => { b.onclick = async () => { await api(`/api/board/${b.dataset.del}`, { method: "DELETE" }); lastCount = -1; drawBoard(); }; });
    };
    $("#b-name").value = store("board-name") || "";
    $("#b-form").onsubmit = async (e) => {
      e.preventDefault();
      const name = $("#b-name").value.trim(), text = $("#b-text").value.trim();
      if (!text) return;
      store("board-name", name);
      try { await api("/api/board", { method: "POST", body: { name, text } }); $("#b-text").value = ""; lastCount = -1; drawBoard(); }
      catch (err) { toast(err.message); }
    };
    drawShare();
    drawBoard();
    const t = setInterval(drawBoard, 5000);
    return () => clearInterval(t);
  };
})();
