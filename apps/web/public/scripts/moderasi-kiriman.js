/*
 * Moderator view for contributor submissions.
 */
(function () {
  "use strict";
  const STORAGE_KEY = "pr_moderator_auth";
  const root = document.getElementById("moderasi-root");
  if (!root) return;

  function getAuth() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; } }
  function setAuth(a) { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); }
  function clearAuth() { localStorage.removeItem(STORAGE_KEY); }

  async function pb(path, options) {
    const auth = getAuth();
    const headers = Object.assign({ "Content-Type": "application/json" }, (options && options.headers) || {});
    if (auth && auth.token) headers.Authorization = "Bearer " + auth.token;
    const res = await fetch("/api" + path, Object.assign({}, options || {}, { headers: headers }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
    if (!res.ok) throw new Error((data && (data.message || data.raw)) || ("HTTP " + res.status));
    return data;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    });
    return node;
  }

  function text(value) { return value === null || value === undefined ? "-" : String(value); }

  function renderLogin(onSuccess) {
    root.innerHTML = "";
    const form = el("form", { class: "search-panel" });
    form.appendChild(el("h2", {}, ["Masuk moderator"]));
    const email = el("input", { type: "email", placeholder: "Email", required: "true" });
    const password = el("input", { type: "password", placeholder: "Kata sandi", required: "true" });
    form.appendChild(el("label", {}, ["Email", email]));
    form.appendChild(el("label", {}, ["Kata sandi", password]));
    const btn = el("button", { type: "submit", class: "button" }, ["Masuk"]);
    form.appendChild(btn);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      btn.disabled = true;
      try {
        const data = await pb("/collections/users/auth-with-password", { method: "POST", body: JSON.stringify({ identity: email.value, password: password.value }) });
        if (!data.record || (data.record.role !== "moderator" && data.record.role !== "admin")) {
          clearAuth();
          throw new Error("Tidak punya akses.");
        }
        setAuth({ token: data.token, record: data.record });
        root.innerHTML = "";
        onSuccess();
      } catch (err) {
        const p = el("p", { class: "note" }, [err.message || "Gagal masuk."]);
        root.appendChild(p);
      } finally {
        btn.disabled = false;
      }
    });
    root.appendChild(form);
  }

  function requireAuth(cb) {
    const auth = getAuth();
    if (!auth || !auth.token) { renderLogin(cb); return false; }
    if (!auth.record || (auth.record.role !== "moderator" && auth.record.role !== "admin")) { clearAuth(); renderLogin(cb); return false; }
    return true;
  }

  async function loadList() {
    if (!requireAuth(loadList)) return;
    root.innerHTML = "Memuat...";
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) { await renderDetail(id); return; }

    const status = params.get("status") || "";
    const url = "/pr/moderator/submissions" + (status ? "?status=" + encodeURIComponent(status) : "");
    let data;
    try { data = await pb(url); } catch (e) { root.innerHTML = ""; root.appendChild(el("p", { class: "note" }, [e.message])); return; }
    root.innerHTML = "";
    const toolbar = el("div", { class: "actions" });
    ["", "new", "in_review", "converted", "duplicate", "rejected"].forEach(function (s) {
      const a = el("a", { class: "button button--quiet", href: "/moderasi/kiriman" + (s ? "?status=" + s : "") }, [s || "semua"]);
      toolbar.appendChild(a);
    });
    root.appendChild(toolbar);

    const list = el("ul", { class: "principles" });
    (data.items || []).forEach(function (item) {
      const li = el("li", {});
      li.appendChild(el("strong", {}, [text(item.kind)]));
      li.appendChild(document.createTextNode(" — " + text(item.url)));
      li.appendChild(el("span", { class: "note" }, [" — " + text(item.status) + " — bobot " + text(item.also_reported_by_count)]));
      if (item.submitter_info) {
        li.appendChild(el("span", { class: "note" }, [" — " + text(item.submitter_info.display_name || item.submitter_info.email) + " (trust " + text(item.submitter_info.trust_level) + ")"]));
      }
      const link = el("a", { class: "button button--quiet", href: "/moderasi/kiriman?id=" + encodeURIComponent(item.id) }, ["Detail"]);
      li.appendChild(document.createTextNode(" "));
      li.appendChild(link);
      list.appendChild(li);
    });
    if (!(data.items || []).length) list.appendChild(el("li", {}, ["Tidak ada item."]));
    root.appendChild(list);
  }

  async function renderDetail(id) {
    if (!requireAuth(function () { renderDetail(id); })) return;
    root.innerHTML = "Memuat...";
    let item;
    try { item = await pb("/pr/moderator/submission/" + encodeURIComponent(id)); } catch (e) { root.innerHTML = ""; root.appendChild(el("p", { class: "note" }, [e.message])); return; }
    root.innerHTML = "";

    root.appendChild(el("h2", {}, [text(item.kind) + " — " + text(item.status)]));
    const meta = el("ul", { class: "principles" });
    const rows = [
      ["URL", item.url],
      ["URL kedua", item.second_url],
      ["Kutipan", item.quote],
      ["Keterangan", item.note],
      ["Tanggal", item.occurred_at],
      ["Jenis", item.suggested_type],
      ["Orang", item.person_name],
      ["Catatan target", item.target_record_title],
      ["Bobot", item.also_reported_by_count],
      ["Moderator", item.moderator_note],
    ];
    rows.forEach(function (pair) {
      const li = el("li", {});
      li.appendChild(el("strong", {}, [pair[0] + ": "]));
      li.appendChild(document.createTextNode(text(pair[1])));
      meta.appendChild(li);
    });
    // contributor info (PII, moderator only)
    if (item.submitter_info) {
      const si = item.submitter_info;
      const li = el("li", {});
      li.appendChild(el("strong", {}, ["Kontributor: "]));
      li.appendChild(document.createTextNode(text(si.display_name) + " <" + text(si.email) + "> (trust " + text(si.trust_level) + ")"));
      meta.appendChild(li);
    }
    root.appendChild(meta);

    const actions = el("div", { class: "actions" });

    const inReview = el("button", { type: "button", class: "button button--quiet" }, ["Tandai ditinjau"]);
    inReview.addEventListener("click", async function () {
      inReview.disabled = true;
      try { await pb("/pr/moderator/submission/" + encodeURIComponent(id) + "/action", { method: "POST", body: JSON.stringify({ action: "in_review", moderator_note: "" }) }); await renderDetail(id); }
      catch (e) { root.appendChild(el("p", { class: "note" }, [e.message])); }
      finally { inReview.disabled = false; }
    });
    actions.appendChild(inReview);

    const convert = el("button", { type: "button", class: "button" }, ["Jadikan catatan"]);
    convert.addEventListener("click", async function () {
      convert.disabled = true;
      try {
        const res = await pb("/pr/moderator/submission/" + encodeURIComponent(id) + "/action", { method: "POST", body: JSON.stringify({ action: "convert" }) });
        if (res.record) alert("Draf dibuat: " + (res.record.slug || res.record.id));
        await renderDetail(id);
      } catch (e) { root.appendChild(el("p", { class: "note" }, [e.message])); }
      finally { convert.disabled = false; }
    });
    actions.appendChild(convert);

    const reject = el("button", { type: "button", class: "button button--quiet" }, ["Tolak"]);
    reject.addEventListener("click", async function () {
      const code = window.prompt("Kode penolakan (no_public_source, not_public_conduct, duplicate, unverifiable, out_of_scope, abusive):");
      if (!code) return;
      reject.disabled = true;
      try { await pb("/pr/moderator/submission/" + encodeURIComponent(id) + "/action", { method: "POST", body: JSON.stringify({ action: "reject", rejection_code: code }) }); await renderDetail(id); }
      catch (e) { root.appendChild(el("p", { class: "note" }, [e.message])); }
      finally { reject.disabled = false; }
    });
    actions.appendChild(reject);

    const suspend = el("button", { type: "button", class: "button button--quiet" }, ["Tangguhkan kontributor"]);
    suspend.addEventListener("click", async function () {
      const reason = window.prompt("Alasan penangguhan:");
      if (!reason) return;
      suspend.disabled = true;
      try { await pb("/pr/moderator/submission/" + encodeURIComponent(id) + "/action", { method: "POST", body: JSON.stringify({ action: "suspend", reason: reason, days: 7 }) }); alert("Ditangguhkan."); }
      catch (e) { root.appendChild(el("p", { class: "note" }, [e.message])); }
      finally { suspend.disabled = false; }
    });
    actions.appendChild(suspend);

    const back = el("a", { class: "button button--quiet", href: "/moderasi/kiriman" }, ["Kembali"]);
    actions.appendChild(back);

    root.appendChild(actions);
  }

  loadList();
})();
