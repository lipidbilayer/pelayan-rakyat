const REFERENCE_HOSTS = ["wikipedia.org", "pejabat.id"];
const SOCIAL_HOSTS = ["instagram.com", "x.com", "twitter.com", "facebook.com", "tiktok.com", "youtube.com"];

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (e) {
    return trimmed;
  }
  url.hostname = url.hostname.toLowerCase();
  const tracking = new Set([
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "ref",
  ]);
  const params = new URLSearchParams(url.search);
  const kept: string[] = [];
  params.forEach(function (value, key) {
    if (!tracking.has(key.toLowerCase()) && !key.toLowerCase().startsWith("utm_")) {
      kept.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    }
  });
  url.search = kept.length ? "?" + kept.join("&") : "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

export function sourceKind(url: string): "official" | "media" | "reference" | "social" {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (e) {
    return "media";
  }
  if (host.endsWith(".go.id") || host === "kpu.go.id" || host === "dpr.go.id" ||
      host === "dpd.go.id" || host === "polri.go.id" || host.startsWith("tribratanews.")) {
    return "official";
  }
  if (SOCIAL_HOSTS.some(function (item) { return host === item || host.endsWith("." + item); })) {
    return "social";
  }
  if (REFERENCE_HOSTS.some(function (item) { return host === item || host.endsWith("." + item); })) {
    return "reference";
  }
  return "media";
}

export function isSpecificUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname !== "" && parsed.pathname !== "/";
  } catch (e) {
    return true;
  }
}
