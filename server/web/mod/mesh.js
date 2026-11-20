// Mesh Radio module: Meshtastic text messages and nodes.
"use strict";
(() => {
  toolRoutes.mesh = true;
  toolStatus.mesh = async () => {
    const s = await api("/api/mesh/status");
    if (s.bridge === false) return "Mesh service not running";
    return s.connected ? `${s.nodes.length} other radio${s.nodes.length === 1 ? "" : "s"} heard` : "No radio connected";
  };
  const ago = (t) => t ? fmtAgo(new Date(t * 1000).toISOString()) : "never";

  routes.mesh = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><a class="btn btn-ghost btn-sm" href="#/tools">${icon("back")}</a>
      <div class="grow"><h1>Mesh Radio</h1><p class="muted" id="ms-sub">Text messages over Meshtastic LoRa radios. No towers, no internet.</p></div></div>
      <div id="ms-alert"></div>
      <div class="grid grid-2" style="grid-template-columns:3fr 2fr">
        <div class="card card-pad"><div class="card-head">${icon("message")}<h3 class="grow">Messages</h3>
          <select class="select" id="ms-to" style="height:30px"><option value="">Everyone (primary channel)</option></select></div>
          <div class="chat" id="ms-chat"></div>
          <form class="chat-input" id="ms-form"><input class="input grow" id="ms-text" placeholder="Message (short: radios carry about 200 characters)" maxlength="200" autocomplete="off">
            <button class="btn" type="submit">${icon("send")}</button></form></div>
        <div class="card card-pad" id="ms-nodes"></div></div></div>`;
    let since = 0, msgs = [], nodes = [];
    const drawChat = () => {
      const box = $("#ms-chat");
      if (!box) return;
      box.innerHTML = msgs.length ? msgs.map((m) => `<div class="msg${m.mine ? " mine" : ""}"><div class="who">${esc(m.mine ? "You" : m.name || m.from)}${m.to ? " → direct" : ""} · ${ago(m.t)}${m.snr != null ? ` · SNR ${m.snr}` : ""}</div>
        <div class="text">${esc(m.text)}</div></div>`).join("") : `<p class="muted small">No messages yet. Messages sent on the mesh while R.O.U.G.E is running are saved here.</p>`;
      box.scrollTop = box.scrollHeight;
    };
    const poll = async () => {
      const s = await api("/api/mesh/status").catch(() => ({ bridge: false }));
      if (!$("#ms-nodes")) return;
      $("#ms-alert").innerHTML = s.bridge === false ? `<div class="alert alert-warn">${icon("alert")}<div class="grow">${esc(s.error || "The mesh service isn't running.")}</div></div>`
        : !s.connected ? `<div class="alert alert-warn">${icon("alert")}<div class="grow">${esc(s.error || "No Meshtastic radio connected. Plug it in with a data USB cable.")}</div></div>` : "";
      fillIcons($("#ms-alert"));
      nodes = s.nodes || [];
      if (s.me) $("#ms-sub").textContent = `This radio: ${s.me.name || s.me.id}${s.me.battery != null ? ` · battery ${s.me.battery}%` : ""}`;
      const sel = $("#ms-to"), cur = sel.value;
      sel.innerHTML = `<option value="">Everyone (primary channel)</option>` + nodes.map((n) => `<option value="${esc(n.id)}">${esc(n.name)} (direct)</option>`).join("");
      sel.value = cur;
      $("#ms-nodes").innerHTML = `<div class="card-head">${icon("radio-tower")}<h3 class="grow">Radios heard</h3><span class="muted small">${nodes.length}</span></div>` +
        (nodes.length ? nodes.map((n) => `<div class="list-item" style="cursor:default">${icon("users")}<div class="grow"><div class="truncate"><b>${esc(n.name)}</b> <span class="muted small">${esc(n.short || "")}</span></div>
          <div class="meta">${ago(n.lastHeard)}${n.hops != null ? ` · ${n.hops} hop${n.hops === 1 ? "" : "s"}` : ""}${n.snr != null ? ` · SNR ${n.snr}` : ""}${n.battery != null ? ` · ${n.battery}%` : ""}</div></div>
          ${n.lat != null ? `<a class="btn btn-ghost btn-sm" href="#/maps?lat=${n.lat}&lon=${n.lon}&z=13&label=${encodeURIComponent(n.name)}">${icon("map")}</a>` : ""}</div>`).join("")
          : `<p class="muted small">None yet. Other Meshtastic radios on the same channel show up here when they're in range.</p>`);
      fillIcons($("#ms-nodes"));
      const fresh = await api("/api/mesh/messages?since=" + since).catch(() => []);
      if (Array.isArray(fresh) && fresh.length) { msgs = msgs.concat(fresh).slice(-300); since = fresh[fresh.length - 1].t; drawChat(); }
    };
    $("#ms-form").onsubmit = async (e) => {
      e.preventDefault();
      const text = $("#ms-text").value.trim();
      if (!text) return;
      try { await api("/api/mesh/send", { method: "POST", body: { text, to: $("#ms-to").value || undefined } }); $("#ms-text").value = ""; poll(); }
      catch (err) { toast(err.message); }
    };
    drawChat(); poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  };
})();
