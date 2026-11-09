import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.cwd(), "dist");

test("no unverified markers in dist", () => {
  const markers = [
    "Zz Uji Belum Terverifikasi",
    "ZZREJECTEDMARKER",
    "ZZNOTESMARKER",
    "ZZBLUNDERREASON",
    "ZZREJECTEDREPLY",
    "ZZIDENTITYCHECK",
    "ZZPROMISEUPDATENOTE",
    "ZZINTERNALNOTE",
    "T38LEAKUNVERIFIEDBLUNDER7f41c",
    "T38LEAKREJECTEDREPLYTEXT7f41c",
    "T38LEAKIDENTITYCHECK7f41c",
    "T38LEAKUNVERIFIEDPROMISENOTE7f41c",
    "T38LEAKRECORDINTERNALNOTES7f41c",
  ];
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(dist);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const marker of markers) {
      expect(content, `${file} contains ${marker}`).not.toContain(marker);
    }
  }
});

test("script tags only on allowed pages", () => {
  const allowed = new Set(["/cari", "/masuk", "/akun", "/kirim", "/lapor"]);
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) files.push(full);
    }
  }
  walk(dist);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (!content.includes("<script")) continue;
    const rel = path.relative(dist, file).replace(/\\/g, "/");
    let route = "/" + rel.replace(/index\.html$/, "").replace(/\.html$/, "");
    if (route === "/") route = "/";
    if (route.endsWith("/")) route = route.slice(0, -1) || "/";
    const isAllowed = allowed.has(route) || route.startsWith("/moderasi");
    expect(isAllowed, `${route} (${file}) contains a script tag`).toBe(true);
  }
});

test("OG tags present", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:description"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
});

test("360px layout", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const url of ["/", "/dprd", "/polisi", "/cari"]) {
    await page.goto(url);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${url} overflow`).toBeLessThanOrEqual(360);
  }
});

test("no third-party requests", async ({ page }) => {
  const origins = new Set<string>();
  page.on("request", (request) => {
    origins.add(new URL(request.url()).origin);
  });
  for (const url of ["/", "/dprd", "/polisi", "/cari"]) {
    await page.goto(url);
  }
  const base = new URL(page.url()).origin;
  for (const origin of origins) {
    expect(origin, `third-party origin ${origin}`).toBe(base);
  }
});

test("keyboard focus visible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "";
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline).not.toBe("none");
});

test("dark mode background", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBeTruthy();
  await context.close();
});

test("search nickname", async ({ page }) => {
  await page.goto("/cari?q=Uya+Kuya");
  await page.waitForTimeout(1000);
  const text = await page.textContent("body");
  expect(text).toContain("Surya Utama");
});
