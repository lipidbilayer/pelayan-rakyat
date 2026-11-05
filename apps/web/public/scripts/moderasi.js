/*
 * Moderator tools for /moderasi.
 * Talks to PocketBase through the same-origin /api proxy.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "pr_moderator_auth";
  const root = document.getElementById("moderasi-root");
  if (!root) return;

  const page = root.getAttribute("data-page");

  function getAuth() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function setAuth(auth) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  }

  function clearAuth() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function pb(path, options) {
    const auth = getAuth();
    const headers = Object.assign({ "Content-Type": "application/json" }, (options && options.headers) || {});
    if (auth && auth.token) {
      headers.Authorization = "Bearer " + auth.token;
    }
    const response = await fetch("/api" + path, Object.assign({}, options, { headers: headers }));
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = { raw: text };
    }
    if (!response.ok) {
      const message = (data && (data.message || data.raw)) || response.statusText;
      throw new Error(message);
    }
    return data;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else if (key === "html") node.innerHTML = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (typeof child === "string") node.appendChild(document.createTextNode(child));
      else if (child) node.appendChild(child);
    });
    return node;
  }

  function showMessage(message, isError) {
    const node = el("p", { class: isError ? "note" : "lede" }, [message]);
    root.appendChild(node);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function renderLogin(onSuccess) {
    root.innerHTML = "";
    const form = el("form", { class: "search-panel" });
    form.appendChild(el("h2", {}, ["Masuk moderator"]));
    const email = el("input", { type: "email", name: "email", placeholder: "Email", required: "true" });
    const password = el("input", { type: "password", name: "password", placeholder: "Kata sandi", required: "true" });
    form.appendChild(el("label", {}, ["Email", email]));
    form.appendChild(el("label", {}, ["Kata sandi", password]));
    const button = el("button", { type: "submit", class: "button" }, ["Masuk"]);
    form.appendChild(button);
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      button.disabled = true;
      try {
        const data = await pb("/collections/users/auth-with-password", {
          method: "POST",
          body: JSON.stringify({ identity: email.value, password: password.value }),
        });
        if (!data.record || (data.record.role !== "moderator" && data.record.role !== "admin")) {
          clearAuth();
          throw new Error("Tidak punya akses.");
        }
        setAuth({ token: data.token, record: data.record });
        root.innerHTML = "";
        onSuccess();
      } catch (error) {
        showMessage(error.message || "Gagal masuk.", true);
      } finally {
        button.disabled = false;
      }
    });
    root.appendChild(form);
  }

  function requireAuth(callback) {
    const auth = getAuth();
    if (!auth || !auth.token) {
      renderLogin(callback);
      return false;
    }
    if (!auth.record || (auth.record.role !== "moderator" && auth.record.role !== "admin")) {
      clearAuth();
      renderLogin(callback);
      return false;
    }
    return true;
  }

  function sourceBadge(source) {
    const weak = !source.is_specific || source.kind === "reference" || source.kind === "social";
    return weak ? "lemah" : "kuat";
  }

  async function loadQueue() {
    if (!requireAuth(loadQueue)) return;
    root.innerHTML = "";

    const toolbar = el("div", { class: "search-panel" });
    const bodySelect = el("select", { name: "body" });
    const jurisdictionSelect = el("select", { name: "jurisdiction" });
    const dapilSelect = el("select", { name: "dapil" });
    const partySelect = el("select", { name: "party" });

    jurisdictionSelect.appendChild(el("option", { value: "" }, ["Semua yurisdiksi"]));
    dapilSelect.appendChild(el("option", { value: "" }, ["Semua dapil"]));
    partySelect.appendChild(el("option", { value: "" }, ["Semua partai"]));
    const weakOnly = el("input", { type: "checkbox", name: "weak" });
    const applyButton = el("button", { type: "button", class: "button" }, ["Terapkan filter"]);

    [["", "Semua badan"], ["governor_office", "Gubernur"], ["city_government", "Pemkot"], ["dprd_dki", "DPRD"], ["dpr_ri", "DPR"], ["dpd_ri", "DPD"], ["polda_metro", "Polda"], ["polres", "Polres"]].forEach(function (pair) {
      bodySelect.appendChild(el("option", { value: pair[0] }, [pair[1]]));
    });

    toolbar.appendChild(el("label", {}, ["Badan", bodySelect]));
    toolbar.appendChild(el("label", {}, ["Yurisdiksi", jurisdictionSelect]));
    toolbar.appendChild(el("label", {}, ["Dapil", dapilSelect]));
    toolbar.appendChild(el("label", {}, ["Partai", partySelect]));
    toolbar.appendChild(el("label", {}, ["Sumber lemah saja", weakOnly]));
    toolbar.appendChild(applyButton);
    root.appendChild(toolbar);

    const listContainer = el("div", {});
    root.appendChild(listContainer);

    let page = 1;

    async function fetchOptions() {
      try {
        const institutions = await pb("/collections/institutions/records?perPage=200&sort=code");
        const jurisdictions = Array.from(new Set(institutions.items.map(function (x) { return x.jurisdiction; }))).sort();
        jurisdictions.forEach(function (value) {
          jurisdictionSelect.appendChild(el("option", { value: value }, [value]));
        });
      } catch (e) {}
      try {
        const dapils = await pb("/collections/dapil/records?perPage=200&sort=code");
        dapils.items.forEach(function (item) {
          dapilSelect.appendChild(el("option", { value: item.code }, [item.name]));
        });
      } catch (e) {}
      try {
        const parties = await pb("/collections/parties/records?perPage=200&sort=code");
        parties.items.forEach(function (item) {
          partySelect.appendChild(el("option", { value: item.code }, [item.name]));
        });
      } catch (e) {}
    }

    async function loadPage() {
      listContainer.innerHTML = "Memuat...";
      const filters = ["verification_status='needs_verification'"];
      if (bodySelect.value) filters.push("institution.kind='" + bodySelect.value + "'");
      if (jurisdictionSelect.value) filters.push("institution.jurisdiction='" + jurisdictionSelect.value + "'");
      if (dapilSelect.value) filters.push("dapil.code='" + dapilSelect.value + "'");
      if (partySelect.value) filters.push("party.code='" + partySelect.value + "'");
      const filter = encodeURIComponent(filters.join(" && "));
      const url = "/collections/positions/records?filter=" + filter + "&sort=-id&perPage=20&page=" + page + "&expand=person,institution,party,dapil,sources";
      try {
        const data = await pb(url);
        let items = data.items || [];
        if (weakOnly.checked) {
          items = items.filter(function (item) {
            const sources = item.expand && item.expand.sources ? item.expand.sources : [];
            return sources.some(function (source) { return !source.is_specific || source.kind === "reference" || source.kind === "social"; });
          });
        }
        listContainer.innerHTML = "";
        if (items.length === 0) {
          listContainer.appendChild(el("p", { class: "note" }, ["Tidak ada item."]));
          return;
        }
        const list = el("ul", { class: "principles" });
        items.forEach(function (item) {
          const person = (item.expand && item.expand.person) || {};
          const institution = (item.expand && item.expand.institution) || {};
          const party = (item.expand && item.expand.party) || {};
          const dapil = (item.expand && item.expand.dapil) || {};
          const sources = (item.expand && item.expand.sources) || [];
          const li = el("li", {});
          li.appendChild(el("strong", {}, [person.full_name || item.person]));
          li.appendChild(document.createTextNode(" — " + item.title + " — " + (institution.name || item.institution)));
          if (dapil.name) li.appendChild(document.createTextNode(" — " + dapil.name));
          if (party.short_name || party.name) li.appendChild(document.createTextNode(" — " + (party.short_name || party.name)));
          li.appendChild(document.createTextNode(" — " + item.status));
          if (item.is_acting) li.appendChild(el("span", { class: "note" }, [" acting"]));
          if (sources.some(function (s) { return !s.is_specific || s.kind === "reference" || s.kind === "social"; })) {
            li.appendChild(el("span", { class: "note" }, [" sumber lemah"]));
          }
          const link = el("a", { href: "/moderasi/posisi?id=" + encodeURIComponent(item.id), class: "button button--quiet" }, ["Detail"]);
          li.appendChild(document.createTextNode(" "));
          li.appendChild(link);
          list.appendChild(li);
        });
        listContainer.appendChild(list);

        const pager = el("div", { class: "actions" });
        const prev = el("button", { type: "button", class: "button button--quiet" }, ["Sebelumnya"]);
        const next = el("button", { type: "button", class: "button button--quiet" }, ["Berikutnya"]);
        prev.disabled = page <= 1;
        next.disabled = page >= (data.totalPages || 1);
        prev.addEventListener("click", function () { page -= 1; loadPage(); });
        next.addEventListener("click", function () { page += 1; loadPage(); });
        pager.appendChild(prev);
        pager.appendChild(next);
        listContainer.appendChild(pager);
      } catch (error) {
        listContainer.innerHTML = "";
        showMessage(error.message || "Gagal memuat antrian.", true);
      }
    }

    applyButton.addEventListener("click", function () { page = 1; loadPage(); });
    fetchOptions().then(loadPage);
  }

  function renderDetail() {
    if (!requireAuth(renderDetail)) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      showMessage("Parameter id tidak ada.", true);
      return;
    }

    root.innerHTML = "Memuat...";

    async function load() {
      try {
        const pos = await pb("/collections/positions/records/" + encodeURIComponent(id) + "?expand=person,institution,party,dapil,sources,replaces");
        root.innerHTML = "";

        const person = pos.expand && pos.expand.person ? pos.expand.person : {};
        const institution = pos.expand && pos.expand.institution ? pos.expand.institution : {};
        const party = pos.expand && pos.expand.party ? pos.expand.party : {};
        const dapil = pos.expand && pos.expand.dapil ? pos.expand.dapil : {};
        const sources = pos.expand && pos.expand.sources ? pos.expand.sources : [];

        root.appendChild(el("h2", {}, [person.full_name || pos.person]));
        const meta = el("ul", { class: "principles" });
        [
          ["Jabatan", pos.title],
          ["Badan", institution.name],
          ["Yurisdiksi", institution.jurisdiction],
          ["Dapil", dapil.name],
          ["Partai", party.name],
          ["Faksi", pos.faction],
          ["Komisi", pos.komisi],
          ["Pengangkatan", pos.appointment_type],
          ["Penjabat sementara", pos.is_acting ? "ya" : "tidak"],
          ["Pangkat", pos.rank],
          ["Mulai", pos.start_date + " (" + pos.start_date_precision + ")"],
          ["Selesai", pos.end_date ? pos.end_date + " (" + pos.end_date_precision + ")" : "-"],
          ["Status", pos.status],
          ["Jabatan sebelumnya", pos.previous_post],
          ["Status verifikasi", pos.verification_status],
          ["Catatan internal", pos.notes],
        ].forEach(function (pair) {
          meta.appendChild(el("li", {}, [pair[0] + ": " + (pair[1] || "-")]));
        });
        root.appendChild(meta);

        root.appendChild(el("h3", {}, ["Sumber"]));
        const sourceList = el("ul", { class: "principles" });
        sources.forEach(function (source) {
          const link = el("a", { href: source.url, target: "_blank", rel: "noopener" }, [source.url]);
          sourceList.appendChild(el("li", {}, [link, document.createTextNode(" — " + source.kind + " — " + (source.is_specific ? "spesifik" : "beranda") + " — " + sourceBadge(source))]));
        });
        root.appendChild(sourceList);

        // Person's other positions
        try {
          const others = await pb("/collections/positions/records?filter=person='" + pos.person + "'&expand=institution,party,dapil&perPage=50");
          if (others.items && others.items.length > 1) {
            root.appendChild(el("h3", {}, ["Posisi lain orang ini"]));
            const otherList = el("ul", { class: "principles" });
            others.items.forEach(function (item) {
              if (item.id === pos.id) return;
              const inst = (item.expand && item.expand.institution) || {};
              otherList.appendChild(el("li", {}, [(inst.name || item.institution) + " — " + item.title + " — " + item.status + " — " + item.verification_status]));
            });
            root.appendChild(otherList);
          }
        } catch (e) {}

        // Revision history
        try {
          const revisions = await pb("/collections/revisions/records?filter=target_collection='positions' && target_id='" + pos.id + "'&sort=-created&perPage=50");
          root.appendChild(el("h3", {}, ["Riwayat revisi"]));
          if (!revisions.items || revisions.items.length === 0) {
            root.appendChild(el("p", { class: "note" }, ["Belum ada revisi."]));
          } else {
            const revList = el("ul", { class: "principles" });
            revisions.items.forEach(function (rev) {
              revList.appendChild(el("li", {}, [rev.created + " — " + rev.action + (rev.reason ? " — " + rev.reason : "")]));
            });
            root.appendChild(revList);
          }
        } catch (e) {}

        const officialSpecific = sources.some(function (source) {
          return (source.kind === "official" || source.kind === "media") && source.is_specific;
        });

        const actions = el("div", { class: "actions" });

        const verifyButton = el("button", { type: "button", class: "button" }, ["Verifikasi"]);
        verifyButton.disabled = !officialSpecific;
        if (!officialSpecific) {
          verifyButton.title = "Butuh minimal satu sumber resmi/media yang spesifik.";
        }
        verifyButton.addEventListener("click", async function () {
          verifyButton.disabled = true;
          try {
            await pb("/collections/positions/records/" + encodeURIComponent(pos.id), {
              method: "PATCH",
              body: JSON.stringify({
                verification_status: "verified",
                verified_at: nowIso(),
                verified_by: getAuth().record.id,
              }),
            });
            if (person.verification_status !== "verified") {
              await pb("/collections/people/records/" + encodeURIComponent(person.id), {
                method: "PATCH",
                body: JSON.stringify({
                  verification_status: "verified",
                  verified_at: nowIso(),
                  verified_by: getAuth().record.id,
                }),
              });
            }
            await load();
          } catch (error) {
            showMessage(error.message || "Gagal verifikasi.", true);
          } finally {
            verifyButton.disabled = false;
          }
        });
        actions.appendChild(verifyButton);

        const rejectButton = el("button", { type: "button", class: "button button--quiet" }, ["Tolak"]);
        rejectButton.addEventListener("click", async function () {
          const reason = window.prompt("Alasan penolakan:");
          if (!reason) return;
          rejectButton.disabled = true;
          try {
            await pb("/collections/positions/records/" + encodeURIComponent(pos.id), {
              method: "PATCH",
              body: JSON.stringify({
                verification_status: "rejected",
                rejection_reason: reason,
              }),
            });
            await load();
          } catch (error) {
            showMessage(error.message || "Gagal menolak.", true);
          } finally {
            rejectButton.disabled = false;
          }
        });
        actions.appendChild(rejectButton);

        const editToggle = el("button", { type: "button", class: "button button--quiet" }, ["Ubah"]);
        actions.appendChild(editToggle);

        root.appendChild(actions);

        const editForm = el("form", { class: "search-panel" });
        editForm.style.display = "none";
        const fields = [
          ["title", "Jabatan", pos.title],
          ["faction", "Faksi", pos.faction],
          ["komisi", "Komisi", pos.komisi],
          ["rank", "Pangkat", pos.rank],
          ["start_date", "Mulai", pos.start_date],
          ["end_date", "Selesai", pos.end_date],
          ["status", "Status", pos.status],
          ["previous_post", "Jabatan sebelumnya", pos.previous_post],
          ["notes", "Catatan internal", pos.notes],
        ];
        const inputs = {};
        fields.forEach(function (field) {
          const input = el("input", { type: "text", value: field[2] || "" });
          inputs[field[0]] = input;
          editForm.appendChild(el("label", {}, [field[1], input]));
        });
        const saveButton = el("button", { type: "submit", class: "button" }, ["Simpan"]);
        editForm.appendChild(saveButton);
        editForm.addEventListener("submit", async function (event) {
          event.preventDefault();
          saveButton.disabled = true;
          try {
            const payload = {};
            fields.forEach(function (field) {
              payload[field[0]] = inputs[field[0]].value;
            });
            await pb("/collections/positions/records/" + encodeURIComponent(pos.id), {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
            await load();
          } catch (error) {
            showMessage(error.message || "Gagal menyimpan.", true);
          } finally {
            saveButton.disabled = false;
          }
        });
        editToggle.addEventListener("click", function () {
          editForm.style.display = editForm.style.display === "none" ? "block" : "none";
        });
        root.appendChild(editForm);

        // Add status event
        root.appendChild(el("h3", {}, ["Tambah status event"]));
        const eventForm = el("form", { class: "search-panel" });
        const eventStatus = el("select", {});
        ["active", "inactive", "ended"].forEach(function (value) {
          eventStatus.appendChild(el("option", { value: value }, [value]));
        });
        const eventDate = el("input", { type: "date", required: "true" });
        const eventNote = el("input", { type: "text", placeholder: "Catatan" });
        eventForm.appendChild(el("label", {}, ["Status", eventStatus]));
        eventForm.appendChild(el("label", {}, ["Tanggal efektif", eventDate]));
        eventForm.appendChild(el("label", {}, ["Catatan", eventNote]));
        const eventButton = el("button", { type: "submit", class: "button" }, ["Tambah"]);
        eventForm.appendChild(eventButton);
        eventForm.addEventListener("submit", async function (event) {
          event.preventDefault();
          eventButton.disabled = true;
          try {
            await pb("/collections/status_events/records", {
              method: "POST",
              body: JSON.stringify({
                position: pos.id,
                status: eventStatus.value,
                effective_date: eventDate.value,
                note: eventNote.value,
                sources: sources.map(function (s) { return s.id; }),
                verification_status: "needs_verification",
              }),
            });
            await load();
          } catch (error) {
            showMessage(error.message || "Gagal menambah status event.", true);
          } finally {
            eventButton.disabled = false;
          }
        });
        root.appendChild(eventForm);

        const logout = el("button", { type: "button", class: "button button--quiet" }, ["Keluar"]);
        logout.addEventListener("click", function () {
          clearAuth();
          window.location.href = "/moderasi";
        });
        root.appendChild(logout);
      } catch (error) {
        root.innerHTML = "";
        showMessage(error.message || "Gagal memuat detail.", true);
      }
    }

    load();
  }

  if (page === "queue") {
    loadQueue();
  } else if (page === "detail") {
    renderDetail();
  }
})();
