import type { APIRoute } from "astro";
import { loadSnapshot } from "../../data/api";

export const GET: APIRoute = async () => {
  const snapshot = await loadSnapshot();
  const manifest = {
    builtAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || "local",
    counts: snapshot.counts,
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
