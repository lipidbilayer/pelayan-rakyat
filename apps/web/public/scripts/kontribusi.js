/*
 * Contributor tools for /masuk, /akun, /kirim and /lapor.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "pr_contributor_auth";
  const TERMS_VERSION = "2026-11-06";
  const root = document.getElementById("kontribusi-root");
  if (!root) return;
  const page = root.getAttribute("data-page");

  function getAuth() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function setAuth(auth) { localStorage.setItem(STORAGE_KEY, JSON.stringify(auth)); }
  function clearAuth() { localStorage.removeItem(STORAGE_KEY); }

  async function pb(path, options) {
    const auth = getAuth();
    const headers = Object.assign({ "Content-Type": "application/json" }, (options && options.headers) || {});
    if (auth && auth.token) headers.Authorization = "Bearer " + auth.token;
    const response = await fetch("/api" + path, Object.assign({}, options || {}, { headers: headers }));
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
    if (!response.ok) throw new Error((data && (data.message || data.raw)) || ("HTTP " + response.status));
    return data;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const key in attrs) {
      if (key === "class") node.className = attrs[key];
      else if (key === "text") node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    }
    (children || []).forEach(function (child) {
      if (typeof child === "string") node.appendChild(document.createTextNode(child));
      else if (child) node.appendChild(child);
    });
    return node;
  }

  function showMessage(message, isError) {
    root.innerHTML = "";
    root.appendChild(el("p", { class: isError ? "note" : "lede" }, [message]));
  }

  async function solveAltcha() {
    const ch = await fetch("/api/pr/altcha/challenge").then(function (r) { return r.json(); });
    const { algorithm, challenge, salt, signature, maxnumber } = ch;
    const limit = maxnumber || 100000;
    let number = 0;
    for (; number <= limit; number++) {
      const data = new TextEncoder().encode(salt + String(number));
      const hash = await crypto.subtle.digest("SHA-256", data);
      const hex = Array.from(new Uint8Array(hash)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      if (hex === challenge) break;
    }
    const payload = { algorithm: algorithm, challenge: challenge, number: number, salt: salt, signature: signature };
    return btoa(JSON.stringify(payload));
  }

  // ---- login / register ----
  function renderAuth(onSuccess) {
    root.innerHTML = "";
    const container = el("div", { class: "search-panel" });
    container.appendChild(el("h2", {}, ["Masuk"]));
    const email = el("input", { type: "email", placeholder: "Email", required: "true" });
    const password = el("input", { type: "password", placeholder: "Kata sandi", required: "true" });
    const loginBtn = el("button", { type: "button", class: "button" }, ["Masuk"]);
    container.appendChild(el("label", {}, ["Email", email]));
    container.appendChild(el("label", {}, ["Kata sandi", password]));
    container.appendChild(loginBtn);
    loginBtn.addEventListener("click", async function () {
      loginBtn.disabled = true;
      try {
        const data = await pb("/collections/users/auth-with-password", { method: "POST", body: JSON.stringify({ identity: email.value, password: password.value }) });
        setAuth({ token: data.token, record: data.record });
        await checkTermsAndContinue(onSuccess);
      } catch (err) {
        showMessage(err.message || "Gagal masuk.", true);
      } finally {
        loginBtn.disabled = false;
      }
    });

    container.appendChild(el("hr", { class: "rule" }));
    container.appendChild(el("h2", {}, ["Daftar"]));
    const rEmail = el("input", { type: "email", placeholder: "Email", required: "true" });
    const rPassword = el("input", { type: "password", placeholder: "Kata sandi (min 8)", required: "true" });
    const rName = el("input", { type: "text", placeholder: "Nama tampilan (opsional)", maxlength: "40" });
    const registerBtn = el("button", { type: "button", class: "button" }, ["Daftar"]);
    container.appendChild(el("label", {}, ["Email", rEmail]));
    container.appendChild(el("label", {}, ["Kata sandi", rPassword]));
    container.appendChild(el("label", {}, ["Nama tampilan", rName]));
    container.appendChild(registerBtn);
    registerBtn.addEventListener("click", async function () {
      registerBtn.disabled = true;
      try {
        await pb("/pr/register", { method: "POST", body: JSON.stringify({ email: rEmail.value, password: rPassword.value, passwordConfirm: rPassword.value, display_name: rName.value }) });
        const data = await pb("/collections/users/auth-with-password", { method: "POST", body: JSON.stringify({ identity: rEmail.value, password: rPassword.value }) });
        setAuth({ token: data.token, record: data.record });
        await checkTermsAndContinue(onSuccess);
      } catch (err) {
        showMessage(err.message || "Gagal daftar.", true);
      } finally {
        registerBtn.disabled = false;
      }
    });
    root.appendChild(container);
  }

  async function checkTermsAndContinue(onSuccess) {
    try {
      const account = await pb("/pr/account", { method: "GET" });
      if (account.terms_required) {
        renderTerms(account, onSuccess);
        return;
      }
    } catch (e) {}
    if (onSuccess) onSuccess();
  }

  function renderTerms(account, onSuccess) {
    root.innerHTML = "";
    const box = el("div", { class: "search-panel" });
    box.appendChild(el("h2", {}, ["Persetujuan kontributor"]));
    box.appendChild(el("p", {}, ["Sebelum mulai, baca dan setujui ketentuan. Kami menyimpan email Anda, laporan yang Anda kirim, dan waktu login. Moderator saja yang dapat melihatnya."]));
    box.appendChild(el("p", {}, [el("a", { href: "/privasi" }, ["Privasi"]), document.createTextNode(" · "), el("a", { href: "/ketentuan" }, ["Ketentuan"])]));
    const btn = el("button", { type: "button", class: "button" }, ["Saya setuju"]);
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      try {
        await pb("/pr/accept-terms", { method: "POST", body: JSON.stringify({ version: TERMS_VERSION }) });
        if (onSuccess) onSuccess();
      } catch (err) {
        showMessage(err.message || "Gagal menyimpan persetujuan.", true);
      } finally {
        btn.disabled = false;
      }
    });
    box.appendChild(btn);
    root.appendChild(box);
  }

  function requireAuth(callback) {
    const auth = getAuth();
    if (!auth || !auth.token) {
      renderAuth(callback);
      return false;
    }
    return true;
  }

  // ---- account page ----
  async function renderAccount() {
    if (!requireAuth(renderAccount)) return;
    let account;
    try { account = await pb("/pr/account"); } catch (err) { clearAuth(); renderAuth(renderAccount); return; }
    root.innerHTML = "";
    const box = el("div", { class: "search-panel" });
    box.appendChild(el("h2", {}, ["Akun"]));
    box.appendChild(el("p", {}, ["Email: " + account.email]));
    box.appendChild(el("p", {}, ["Nama tampilan: " + (account.display_name || "-")]));
    box.appendChild(el("p", {}, ["Trust level: " + account.trust_level]));
    if (account.suspended) box.appendChild(el("p", { class: "note" }, ["Akun ditangguhkan sampai " + account.suspended_until]));

    const nameInput = el("input", { type: "text", value: account.display_name || "", maxlength: "40" });
    const saveBtn = el("button", { type: "button", class: "button button--quiet" }, ["Simpan nama"]);
    box.appendChild(el("label", {}, ["Ubah nama tampilan", nameInput]));
    box.appendChild(saveBtn);
    saveBtn.addEventListener("click", async function () {
      saveBtn.disabled = true;
      try {
        await pb("/pr/account", { method: "PATCH", body: JSON.stringify({ display_name: nameInput.value }) });
        showMessage("Nama disimpan.", false);
        setTimeout(renderAccount, 800);
      } catch (err) { showMessage(err.message || "Gagal.", true); }
      finally { saveBtn.disabled = false; }
    });

    // submissions
    box.appendChild(el("h3", {}, ["Laporan saya"]));
    let subs = [];
    try { const d = await pb("/collections/submissions/records?perPage=100&sort=-created"); subs = d.items || []; } catch (e) {}
    const statusLabel = { new: "Diterima", in_review: "Sedang ditinjau", converted: "Dijadikan catatan", duplicate: "Sudah pernah dilaporkan", rejected: "Ditolak" };
    const rejLabel = { no_public_source: "tidak ada sumber publik", not_public_conduct: "bukan perilaku publik", duplicate: "duplikat", unverifiable: "tidak dapat diverifikasi", out_of_scope: "di luar cakupan", abusive: "penyalahgunaan" };
    const ul = el("ul", { class: "principles" });
    subs.forEach(function (s) {
      const li = el("li", {});
      li.appendChild(document.createTextNode(statusLabel[s.status] || s.status));
      if (s.status === "rejected" && s.rejection_code) li.appendChild(document.createTextNode(": " + (rejLabel[s.rejection_code] || s.rejection_code)));
      if (s.status === "converted" && s.converted_record) {
        li.appendChild(document.createTextNode(" "));
        const a = el("a", { href: "#" }, ["lihat catatan"]);
        a.addEventListener("click", async function (ev) {
          ev.preventDefault();
          try {
            const r = await fetch("/api/collections/records/records/" + s.converted_record).then(function (x) { return x.json(); });
            if (r.slug) window.location.href = "/catatan/" + r.slug;
          } catch (e) {}
        });
        li.appendChild(a);
      }
      ul.appendChild(li);
    });
    if (subs.length === 0) ul.appendChild(el("li", {}, ["Belum ada laporan."]));
    box.appendChild(ul);

    // flags
    box.appendChild(el("h3", {}, ["Laporan masalah saya"]));
    let flags = [];
    try { const d = await pb("/collections/flags/records?perPage=100&sort=-created"); flags = d.items || []; } catch (e) {}
    const ful = el("ul", { class: "principles" });
    flags.forEach(function (f) { ful.appendChild(el("li", {}, [(f.status === "open" ? "Terbuka" : f.status) + " · " + f.reason])); });
    if (flags.length === 0) ful.appendChild(el("li", {}, ["Belum ada."]));
    box.appendChild(ful);

    // delete account
    box.appendChild(el("h3", {}, ["Hapus akun"]));
    const confirmInput = el("input", { type: "text", placeholder: "Ketik HAPUS AKUN SAYA" });
    const delBtn = el("button", { type: "button", class: "button button--quiet" }, ["Hapus akun"]);
    delBtn.disabled = true;
    confirmInput.addEventListener("input", function () { delBtn.disabled = confirmInput.value !== "HAPUS AKUN SAYA"; });
    box.appendChild(el("label", {}, ["Konfirmasi", confirmInput]));
    box.appendChild(delBtn);
    delBtn.addEventListener("click", async function () {
      if (!confirm("Hapus akun secara permanen?")) return;
      delBtn.disabled = true;
      try {
        await pb("/pr/delete-account", { method: "POST" });
        clearAuth();
        window.location.href = "/";
      } catch (err) {
        showMessage(err.message || "Gagal.", true);
        setTimeout(renderAccount, 800);
      } finally {
        delBtn.disabled = false;
      }
    });

    const logout = el("button", { type: "button", class: "button button--quiet" }, ["Keluar"]);
    logout.addEventListener("click", function () { clearAuth(); window.location.href = "/"; });
    box.appendChild(logout);

    root.appendChild(box);
  }

  // ---- kirim form ----
  let selectedPerson = "";
  async function renderKirim() {
    if (!requireAuth(renderKirim)) return;
    await checkTermsAndContinue(function () { doRenderKirim(); });
  }
  async function doRenderKirim() {
    root.innerHTML = "";
    const params = new URLSearchParams(window.location.search);
    const prePersonSlug = params.get("orang");
    const preRecordSlug = params.get("catatan");
    const preKind = params.get("kind") === "correction" ? "correction" : "tip";

    // resolve prefill ids
    let prePersonId = "";
    let preRecordId = "";
    let prePersonName = "";
    if (prePersonSlug) {
      try {
        const d = await pb("/collections/people/records?filter=" + encodeURIComponent("slug='" + prePersonSlug + "'") + "&perPage=1");
        if (d.items && d.items[0]) { prePersonId = d.items[0].id; prePersonName = d.items[0].full_name; selectedPerson = prePersonId; }
      } catch (e) {}
    }
    if (preRecordSlug) {
      try {
        const d = await pb("/collections/records/records?filter=" + encodeURIComponent("slug='" + preRecordSlug + "'") + "&perPage=1");
        if (d.items && d.items[0]) { preRecordId = d.items[0].id; if (!prePersonId && d.items[0].person) { prePersonId = d.items[0].person; selectedPerson = prePersonId; } }
      } catch (e) {}
    }

    const form = el("form", { class: "search-panel" });
    form.appendChild(el("h2", {}, [preKind === "correction" ? "Usulkan koreksi" : "Kirim info"]));

    const urlInput = el("input", { type: "url", required: "true", placeholder: "https://..." });
    form.appendChild(el("label", {}, ["Tautan sumber (wajib)", urlInput]));

    // person picker
    const personSearch = el("input", { type: "text", placeholder: "Cari nama pejabat…" });
    const personResults = el("div", {});
    const personChosen = el("p", { class: "note" }, [prePersonName ? ("Dipilih: " + prePersonName) : "Belum memilih orang (boleh \"Tidak tahu\")."]);
    form.appendChild(el("label", {}, ["Siapa yang bersangkutan", personSearch]));
    form.appendChild(personResults);
    form.appendChild(personChosen);
    const noneBtn = el("button", { type: "button", class: "button button--quiet" }, ["Tidak tahu"]);
    noneBtn.addEventListener("click", function () { selectedPerson = ""; personChosen.textContent = "Tidak memilih orang."; });
    form.appendChild(noneBtn);

    let debounceTimer = null;
    personSearch.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async function () {
        personResults.innerHTML = "";
        const q = personSearch.value.trim();
        if (q.length < 2) return;
        try {
          const d = await pb("/collections/people/records?filter=" + encodeURIComponent("full_name ~ '" + q.replace(/'/g, "") + "'") + "&perPage=8");
          (d.items || []).forEach(function (p) {
            const b = el("button", { type: "button", class: "button button--quiet" }, [p.full_name]);
            b.addEventListener("click", function () {
              selectedPerson = p.id;
              personChosen.textContent = "Dipilih: " + p.full_name;
              personResults.innerHTML = "";
            });
            personResults.appendChild(b);
          });
        } catch (e) {}
      }, 300);
    });

    const typeSelect = el("select", {});
    ["statement", "promise", "action", "vote", "unsure"].forEach(function (t) {
      const labels = { statement: "Pernyataan", promise: "Janji", action: "Tindakan", vote: "Suara", unsure: "Tidak yakin" };
      const o = el("option", { value: t }, [labels[t]]);
      if (t === "unsure") o.selected = true;
      typeSelect.appendChild(o);
    });
    form.appendChild(el("label", {}, ["Jenis catatan", typeSelect]));

    const noteInput = el("textarea", { required: "true", rows: "4", placeholder: "Apa yang terjadi dan mengapa penting (min 20 karakter)" });
    form.appendChild(el("label", {}, ["Keterangan (wajib)", noteInput]));

    const quoteInput = el("textarea", { rows: "3", placeholder: "Kutipan, jika ada" });
    form.appendChild(el("label", {}, ["Kutipan (opsional)", quoteInput]));

    const dateInput = el("input", { type: "date" });
    form.appendChild(el("label", {}, ["Tanggal kejadian (opsional)", dateInput]));

    const secondInput = el("input", { type: "url", placeholder: "https://..." });
    form.appendChild(el("label", {}, ["Tautan kedua (opsional)", secondInput]));

    const submitBtn = el("button", { type: "submit", class: "button" }, ["Kirim"]);
    form.appendChild(submitBtn);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      submitBtn.disabled = true;
      try {
        const payload = await solveAltcha();
        const body = {
          kind: preKind,
          url: urlInput.value.trim(),
          note: noteInput.value.trim(),
          suggested_type: typeSelect.value,
          altcha: payload,
        };
        if (selectedPerson) body.person = selectedPerson;
        if (quoteInput.value.trim()) body.quote = quoteInput.value.trim();
        if (dateInput.value) body.occurred_at = dateInput.value;
        if (secondInput.value.trim()) body.second_url = secondInput.value.trim();
        if (preRecordId) body.target_record = preRecordId;
        if (prePersonId && preKind === "correction") body.target_person = prePersonId;
        const res = await pb("/pr/submissions", { method: "POST", body: JSON.stringify(body) });
        showMessage(res.message || "Terima kasih.", false);
      } catch (err) {
        showMessage(err.message || "Gagal mengirim.", true);
      } finally {
        submitBtn.disabled = false;
      }
    });

    root.appendChild(form);
  }

  // ---- lapor form ----
  async function renderLapor() {
    if (!requireAuth(renderLapor)) return;
    await checkTermsAndContinue(function () { doRenderLapor(); });
  }
  async function doRenderLapor() {
    root.innerHTML = "";
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("catatan");
    let recordId = "";
    let recordTitle = "";
    if (slug) {
      try {
        const d = await pb("/collections/records/records?filter=" + encodeURIComponent("slug='" + slug + "'") + "&perPage=1");
        if (d.items && d.items[0]) { recordId = d.items[0].id; recordTitle = d.items[0].title; }
      } catch (e) {}
    }
    const form = el("form", { class: "search-panel" });
    form.appendChild(el("h2", {}, ["Laporkan masalah"]));
    if (recordTitle) form.appendChild(el("p", {}, ["Catatan: " + recordTitle]));
    const recordInput = el("input", { type: "text", value: slug || "", placeholder: "slug catatan" });
    if (!slug) form.appendChild(el("label", {}, ["Slug catatan", recordInput]));

    const reasonSelect = el("select", { required: "true" });
    const reasons = { wrong_person: "Salah orang", inaccurate: "Tidak akurat", missing_context: "Kurang konteks / menyesatkan", dead_source: "Sumber tidak bisa dibuka", other: "Lainnya" };
    for (const key in reasons) {
      const o = el("option", { value: key }, [reasons[key]]);
      reasonSelect.appendChild(o);
    }
    form.appendChild(el("label", {}, ["Alasan", reasonSelect]));

    const noteInput = el("textarea", { rows: "3", placeholder: "Keterangan (wajib untuk Lainnya)" });
    form.appendChild(el("label", {}, ["Keterangan (opsional)", noteInput]));

    const submitBtn = el("button", { type: "submit", class: "button" }, ["Kirim"]);
    form.appendChild(submitBtn);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      submitBtn.disabled = true;
      try {
        if (!recordId && recordInput.value.trim()) {
          const d = await pb("/collections/records/records?filter=" + encodeURIComponent("slug='" + recordInput.value.trim() + "'") + "&perPage=1");
          if (d.items && d.items[0]) recordId = d.items[0].id;
        }
        if (!recordId) throw new Error("Catatan tidak ditemukan.");
        const payload = await solveAltcha();
        const body = { record: recordId, reason: reasonSelect.value, note: noteInput.value.trim(), altcha: payload };
        const res = await pb("/pr/flags", { method: "POST", body: JSON.stringify(body) });
        showMessage(res.message || "Terima kasih.", false);
      } catch (err) {
        showMessage(err.message || "Gagal.", true);
      } finally {
        submitBtn.disabled = false;
      }
    });

    root.appendChild(form);
  }

  // ---- boot ----
  if (page === "masuk") {
    const auth = getAuth();
    if (auth && auth.token) {
      checkTermsAndContinue(function () { window.location.href = "/akun"; });
    } else {
      renderAuth(function () { window.location.href = "/akun"; });
    }
  } else if (page === "akun") {
    renderAccount();
  } else if (page === "kirim") {
    renderKirim();
  } else if (page === "lapor") {
    renderLapor();
  }
})();
