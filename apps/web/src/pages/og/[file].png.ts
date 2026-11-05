import type { APIRoute } from "astro";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadSnapshot } from "../../data/api";

export async function getStaticPaths() {
  const snapshot = await loadSnapshot();
  const paths: any[] = [];
  for (const person of snapshot.people) {
    const positions = snapshot.positionsByPerson.get(person.id) || [];
    const current = positions.find((p: any) => p.status === "active") || positions[0];
    const institution = current ? snapshot.institutionById.get(current.institution) : null;
    const post = current ? `${current.title} · ${institution?.name || ""}` : "Pelayan Rakyat";
    const hash = createHash("sha256").update(`${person.full_name}|${post}`).digest("hex").slice(0, 12);
    paths.push({ params: { file: `${person.slug}.${hash}` }, props: { person, post } });
  }
  // Group images.
  const groups = [
    { slug: "dprd", title: "DPRD DKI Jakarta", post: "Komposisi dan anggota" },
    { slug: "polisi", title: "Polda dan Polres", post: "Riwayat jabatan" },
    { slug: "pemprov", title: "Pemprov DKI Jakarta", post: "Gubernur dan wali kota" },
    { slug: "pusat", title: "DPR dan DPD dari Jakarta", post: "Anggota DPR RI dan DPD" },
  ];
  for (const group of groups) {
    const hash = createHash("sha256").update(`${group.title}|${group.post}`).digest("hex").slice(0, 12);
    paths.push({ params: { file: `${group.slug}.${hash}` }, props: { group } });
  }
  return paths;
}

export const GET: APIRoute = async ({ props }) => {
  const fontCandidates = [
    process.env.OG_FONT_PATH,
    "fonts/OpenSans-Regular.ttf",
    "../fonts/OpenSans-Regular.ttf",
    "/usr/share/fonts/open-sans/OpenSans-Regular.ttf",
  ].filter(Boolean) as string[];
  let font: Buffer | null = null;
  for (const candidate of fontCandidates) {
    try {
      font = readFileSync(candidate);
      break;
    } catch (e) {
      // Try the next font location.
    }
  }
  if (!font) throw new Error("No OG font found");
  const { person, post, group } = props as any;
  const title = person ? person.full_name : group.title;
  const subtitle = person ? post : group.post;

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background: "#f7f5f0",
          color: "#1a1a1a",
          fontFamily: "Liberation Sans",
        },
        children: [
          { type: "div", props: { style: { fontSize: 34, opacity: 0.7 }, children: "Pelayan Rakyat" } },
          { type: "div", props: { style: { fontSize: 64, fontWeight: 700, lineHeight: 1.1 }, children: title } },
          { type: "div", props: { style: { fontSize: 30, opacity: 0.85 }, children: subtitle } },
          { type: "div", props: { style: { fontSize: 24, opacity: 0.7 }, children: "Independen — bukan situs pemerintah." } },
        ],
      },
    },
    { width: 1200, height: 630, fonts: [{ name: "Liberation Sans", data: font, weight: 400, style: "normal" }] },
  );

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  const png = resvg.render().asPng();
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
