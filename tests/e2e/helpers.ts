import { expect, type BrowserContext, type Page } from "@playwright/test";

export const AVAILABLE_SLUG = "morning-gym-session-with-marco";

export async function acceptAgeGate(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) {
    await expect(dialog).toContainText("Adults Only");
    await page.getByRole("button", { name: "I'm 18 or older" }).click();
    await expect(dialog).toBeHidden();
  }
}

export async function addAgeCookie(context: BrowserContext) {
  await context.addCookies([
    {
      name: "gv_age_ack",
      value: "1",
      url: "http://localhost:3000",
      sameSite: "Lax",
    },
  ]);
}

export async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@gayvideo.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}
