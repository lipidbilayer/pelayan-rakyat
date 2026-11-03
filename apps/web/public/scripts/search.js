/*
 * Pagefind UI initialisation.
 * Loaded only on /cari, after /pagefind/pagefind-ui.js.
 */
window.addEventListener("DOMContentLoaded", function () {
  var element = document.getElementById("cari");
  if (!element || typeof window.PagefindUI !== "function") {
    return;
  }

  var ui = new window.PagefindUI({
    element: "#cari",
    showSubResults: true,
    showImages: false,
    translations: {
      placeholder: "Cari nama, janji, atau pernyataan…",
      clear_search: "Bersihkan",
      load_more: "Muat hasil lain",
      search_label: "Cari di situs ini",
      filters_label: "Filter",
      zero_results: "Tidak ada hasil untuk [SEARCH_TERM]",
      many_results: "[COUNT] hasil untuk [SEARCH_TERM]",
      one_result: "[COUNT] hasil untuk [SEARCH_TERM]",
      alt_search:
        "Tidak ada hasil untuk [SEARCH_TERM]. Menampilkan hasil untuk [DIFFERENT_TERM].",
      search_suggestion:
        "Tidak ada hasil untuk [SEARCH_TERM]. Coba salah satu pencarian berikut:",
      searching: "Mencari [SEARCH_TERM]…",
    },
  });

  var params = new URLSearchParams(window.location.search);
  var q = params.get("q");
  if (q) {
    var input = document.querySelector("#cari input[type='search'], #cari input");
    if (input) {
      input.value = q;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
});
