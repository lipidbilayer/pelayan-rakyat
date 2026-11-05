import { test, expect } from "@playwright/test";

test("moderator logs in, verifies and rejects", async ({ page }) => {
  await page.goto("/moderasi");
  await page.fill('input[type="email"]', "verify-moderator@example.com");
  await page.fill('input[type="password"]', "verify-password");
  await page.click('button[type="submit"]');
  await expect(page.locator("h1")).toContainText("Antrian verifikasi");

  const firstDetail = page.locator('a:has-text("Detail")').first();
  await firstDetail.click();
  await expect(page.locator("h1")).toContainText("Detail posisi");
  const verifyButton = page.locator('button:has-text("Verifikasi")');
  if (await verifyButton.isEnabled()) {
    await verifyButton.click();
    await page.waitForTimeout(500);
  }

  await page.goto("/moderasi");
  const secondDetail = page.locator('a:has-text("Detail")').first();
  if (await secondDetail.count()) {
    await secondDetail.click();
    page.on("dialog", (dialog) => dialog.accept("Test rejection"));
    await page.click('button:has-text("Tolak")');
    await page.waitForTimeout(500);
  }
});
