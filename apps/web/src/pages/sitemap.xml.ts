import type { APIRoute } from "astro";
import { loadSnapshot } from "../data/api";

export const GET: APIRoute = async ({ site }) => {
  const snapshot = await loadSnapshot();
  const base = (site?.toString() || "http://localhost").replace(/\/$/, "");
  const urls = [
    "",
    "/tentang",
    "/metode",
    "/koreksi",
    "/cari",
    "/pemprov",
    "/dprd",
    "/pusat",
    "/polisi",
  ];
  for (const person of snapshot.people) urls.push(`/orang/${person.slug}`);
  for (const dapil of snapshot.dapils.filter((d: any) => d.level === "dprd_dki")) urls.push(`/dprd/dapil/${dapil.code.replace("dprd-dki-", "")}`);
  for (const party of snapshot.parties) urls.push(`/partai/${party.code}`);

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${base}${url}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
};
