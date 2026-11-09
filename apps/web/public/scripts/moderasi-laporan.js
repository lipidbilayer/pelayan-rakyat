/*
 * Moderator view for flags.
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
        if (!data.record || (data.record.role !== "moderator" && data.record.role !== "admin")) { clearAuth(); throw new Error("Tidak punya akses."); }
        setAuth({ token: data.token, record: data.record });
        root.innerHTML = "";
        onSuccess();
      } catch (err) {
        root.appendChild(el("p", { class: "note" }, [err.message || "Gagal masuk."]));
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

  async function load() {
    if (!requireAuth(load)) return;
    root.innerHTML = "Memuat...";
    let data;
    try { data = await pb("/pr/moderator/flags"); } catch (e) { root.innerHTML = ""; root.appendChild(el("p", { class: "note" }, [e.message])); return; }
    root.innerHTML = "";
    (data.items || []).forEach(function (group) {
      const box = el("div", { class: "search-panel" });
      box.appendChild(el("h3", {}, [text(group.title) + (group.wrong_person ? " ⚠" : "")]));
      const ul = el("ul", { class: "principles" });
      (group.flags || []).forEach(function (flag) {
        const li = el("li", {});
        li.appendChild(document.createTextNode(text(flag.reason) + " — " + text(flag.note)));
        const resBtn = el("button", { type: "button", class: "button button--quiet" }, ["Selesai"]);
        resBtn.addEventListener("click", async function () {
          resBtn.disabled = true;
          try { await pb("/pr/moderator/flag/" + encodeURIComponent(flag.id), { method: "POST", body: JSON.stringify({ status: "resolved", moderator_note: "" }) }); load(); }
          catch (e) { root.appendChild(el("p", { class: "note" }, [e.message])); }
          finally { resBtn.disabled = false; }
        });
        const disBtn = el("button", { type: "button", class: "button button--quiet" }, ["Abaikan"]);
        disBtn.addEventListener("click", async function () {
          disBtn.disabled = true;
          try { await pb("/pr/moderator/flag/" + encodeURIComponent(flag.id), { method: "POST", body: JSON.stringify({ status: "dismissed", moderator_note: "" }) }); load(); }
          catch (e) { root.appendChild(el("p", { class: "note" }, [e.message])); }
          finally { disBtn.disabled = false; }
        });
        li.appendChild(document.createTextNode(" "));
        li.appendChild(resBtn);
        li.appendChild(document.createTextNode(" "));
        li.appendChild(disBtn);
        ul.appendChild(li);
      });
      box.appendChild(ul);
      root.appendChild(box);
    });
    if (!(data.items || []).length) root.appendChild(el("p", { class: "note" }, ["Tidak ada laporan terbuka."]));
  }

  load();
})();
