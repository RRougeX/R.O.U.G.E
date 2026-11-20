// Documents module: encrypted copies of important papers.
"use strict";
(() => {
  routes.vault = (view) => {
    view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><h1>Documents</h1>
      <p class="muted">IDs, insurance, prescriptions, deeds and records, encrypted on this device.</p></div><div class="row" id="v-actions"></div></div>
      <div id="v-body"></div></div>`;
    let idle = null;
    const state = async () => {
      const s = await api("/api/vault").catch((e) => ({ error: e.message }));
      if (!$("#v-body")) return;
      $("#v-actions").innerHTML = "";
      if (s.error) { $("#v-body").innerHTML = `<p class="muted">${esc(s.error)}</p>`; return; }
      if (!s.set) return setup();
      if (!s.unlocked) return unlock();
      return files();
    };
    const pwForm = (title, text, button, confirm) => `<div class="card card-pad" style="max-width:440px;margin:30px auto">
      <div class="empty-icon" style="margin-bottom:10px">${icon("lock")}</div><h2>${title}</h2><p class="muted small" style="margin:6px 0 14px">${text}</p>
      <form id="v-form" class="stack"><input class="input" type="password" id="v-pw" placeholder="Password" autocomplete="${confirm ? "new-password" : "current-password"}">
      ${confirm ? `<input class="input" type="password" id="v-pw2" placeholder="Type it again" autocomplete="new-password">` : ""}
      <button class="btn" type="submit" id="v-go">${button}</button></form></div>`;
    const setup = () => {
      $("#v-body").innerHTML = pwForm("Create a vault password",
        "Your documents are encrypted with this password. There is no way to recover them if you forget it, so write it down somewhere safe.", "Create vault", true);
      $("#v-pw").focus();
      $("#v-form").onsubmit = async (e) => {
        e.preventDefault();
        if ($("#v-pw").value !== $("#v-pw2").value) return toast("The passwords don't match");
        $("#v-go").disabled = true; $("#v-go").textContent = "Creating…";
        try { await api("/api/vault", { method: "POST", body: { action: "setup", password: $("#v-pw").value } }); state(); }
        catch (err) { toast(err.message); $("#v-go").disabled = false; $("#v-go").textContent = "Create vault"; }
      };
    };
    const unlock = () => {
      $("#v-body").innerHTML = pwForm("Documents are locked", "Enter your vault password. It locks itself again after 15 minutes of not being used.", "Unlock", false);
      $("#v-pw").focus();
      $("#v-form").onsubmit = async (e) => {
        e.preventDefault();
        $("#v-go").disabled = true; $("#v-go").textContent = "Unlocking…";
        try { await api("/api/vault", { method: "POST", body: { action: "unlock", password: $("#v-pw").value } }); state(); }
        catch (err) { toast(err.message); $("#v-go").disabled = false; $("#v-go").textContent = "Unlock"; $("#v-pw").select(); }
      };
    };
    const files = async () => {
      $("#v-actions").innerHTML = `<button class="btn btn-outline btn-sm" id="v-pwc">${icon("edit")} Change password</button>
        <button class="btn btn-outline btn-sm" id="v-lock">${icon("lock")} Lock</button>
        <label class="btn btn-sm" style="cursor:pointer">${icon("upload")} Add files<input type="file" id="v-file" multiple hidden accept="image/*,application/pdf,.txt,.doc,.docx"></label>`;
      $("#v-lock").onclick = async () => { await api("/api/vault", { method: "POST", body: { action: "lock" } }); state(); };
      $("#v-pwc").onclick = changePassword;
      $("#v-file").onchange = async (e) => {
        const list = [...e.target.files];
        for (const f of list) {
          const fd = new FormData();
          fd.append("file", f);
          toast(`Encrypting ${f.name}…`);
          const res = await fetch("/api/vault/files", { method: "POST", body: fd });
          if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || "Upload failed"); }
        }
        if (list.length) toast("Saved");
        files();
      };
      const docs = await api("/api/vault/files").catch((e) => { toast(e.message); return null; });
      if (!docs) return state();
      if (!$("#v-body")) return;
      $("#v-body").innerHTML = docs.length ? `<div class="card"><table class="table"><tr><th>Document</th><th>Size</th><th>Added</th><th></th></tr>
        ${docs.map((d) => `<tr><td><a class="row" href="/api/vault/files/${d.id}" target="_blank" rel="noopener">${icon(d.type.startsWith("image/") ? "eye" : "file")}<b class="truncate">${esc(d.name)}</b></a></td>
          <td class="muted">${fmtBytes(d.size)}</td><td class="muted">${new Date(d.added).toLocaleDateString()}</td>
          <td><div class="row" style="justify-content:flex-end"><a class="btn btn-ghost btn-sm" href="/api/vault/files/${d.id}?download=1">${icon("download")}</a>
          <button class="btn btn-ghost btn-sm" data-del="${d.id}" data-name="${esc(d.name)}">${icon("trash")}</button></div></td></tr>`).join("")}</table></div>
        <p class="muted small" style="margin-top:10px">Tip: photograph both sides of IDs and insurance cards, and add a list of medicines and doctors' phone numbers.</p>`
        : `<div class="empty"><div class="empty-icon">${icon("file")}</div><h3>No documents yet</h3>
          <p class="muted">Add photos or PDFs of driver's licenses, passports, insurance cards, prescriptions, medical records, deeds and bank details.</p></div>`;
      $("#v-body").querySelectorAll("[data-del]").forEach((b) => {
        b.onclick = async () => {
          if (!(await confirmDialog("Delete this document?", b.dataset.name))) return;
          await api(`/api/vault/files/${b.dataset.del}`, { method: "DELETE" });
          files();
        };
      });
    };
    const changePassword = () => openModal(`<div class="dialog-pad"><h2>Change vault password</h2>
      <input class="input" type="password" id="c-old" placeholder="Current password"><input class="input" type="password" id="c-new" placeholder="New password">
      <input class="input" type="password" id="c-new2" placeholder="New password again">
      <div class="dialog-actions"><button class="btn btn-outline" data-x>Cancel</button><button class="btn" data-ok>Change</button></div></div>`, (b, close) => {
      b.querySelector("[data-x]").onclick = close;
      b.querySelector("[data-ok]").onclick = async () => {
        if (b.querySelector("#c-new").value !== b.querySelector("#c-new2").value) return toast("The new passwords don't match");
        try { await api("/api/vault", { method: "POST", body: { action: "change", password: b.querySelector("#c-old").value, new: b.querySelector("#c-new").value } }); toast("Password changed"); close(); }
        catch (e) { toast(e.message); }
      };
    });
    state();
    idle = setInterval(() => api("/api/vault").then((s) => { if (s.set && !s.unlocked && $("#v-lock")) state(); }).catch(() => {}), 60000);
    return () => clearInterval(idle);
  };
})();
