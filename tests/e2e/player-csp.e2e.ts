import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { addAgeCookie, AVAILABLE_SLUG, loginAdmin } from "./helpers";

// The player iframe under the production CSP (Caddyfile; Caddy adds it in
// front of the app, so this test adds the same headers to the watch page).
// Hosts move their players to new domains: the embed page redirects to a
// rotating domain once the video starts. That redirect was blocked ("This
// content is blocked. Contact the site owner") because frame-src was a fixed
// list. The seed's embed URLs point at example.invalid; here that "host"
// redirects to a domain nobody has listed.

const prisma = new PrismaClient();
const ROTATED = "https://rotated-player.example/e/abc123";

function caddyHeaders(): Record<string, string> {
  const caddyfile = readFileSync(path.join(process.cwd(), "Caddyfile"), "utf8");
  const value = (name: string) => {
    const line = caddyfile.split("\n").find((row) => row.trim().startsWith(`${name} `));
    if (!line) throw new Error(`${name} missing from Caddyfile`);
    return line.trim().slice(name.length + 1).replace(/^["`]|["`]$/g, "").replaceAll("https://{$SITE_DOMAIN}", "http://localhost:3000");
  };
  return {
    "content-security-policy": value("Content-Security-Policy"),
    "content-security-policy-report-only": value("Content-Security-Policy-Report-Only"),
  };
}

/** Old policy (before this fix): the fixed list enforced. */
function oldHeaders(): Record<string, string> {
  const headers = caddyHeaders();
  const list = headers["content-security-policy-report-only"].match(/frame-src ([^;]+);/)![1];
  return { "content-security-policy": headers["content-security-policy"].replace("frame-src 'self' https:", `frame-src ${list}`) };
}

async function openPlayer(page: Page, headers: Record<string, string>) {
  const violations: { directive: string; blocked: string; disposition: string }[] = [];
  await page.exposeFunction("__cspViolation", (v: { directive: string; blocked: string; disposition: string }) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __cspViolation: (v: unknown) => void }).__cspViolation({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        disposition: event.disposition,
      });
    });
  });
  // Caddy's headers on the watch page.
  await page.route(`**/watch/${AVAILABLE_SLUG}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });
  // The host's embed page sends the player to a new domain, as Dood/VOE do.
  await page.route("https://example.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>embed</title><script>location.href = ${JSON.stringify(ROTATED)};</script>`,
    }),
  );
  await page.route("https://rotated-player.example/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>player</title><p id=ok>PLAYER OK</p>" }),
  );

  await addAgeCookie(page.context());
  await page.goto(`/watch/${AVAILABLE_SLUG}`);
  await page.getByRole("button", { name: /^Play / }).first().click();
  return violations;
}

test.afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: "security.cspBlocked" } });
  await prisma.$disconnect();
});

test("the player iframe may move to a new HTTPS domain (production CSP)", async ({ page }) => {
  const violations = await openPlayer(page, caddyHeaders());
  const player = page.frameLocator("iframe").first();
  await expect(player.locator("#ok")).toHaveText("PLAYER OK");
  await expect.poll(() => page.frames().some((frame) => frame.url().startsWith(ROTATED))).toBe(true);

  // Not blocked; the report-only policy still reports the unknown domain.
  expect(violations.filter((v) => v.disposition === "enforce")).toEqual([]);
  await expect
    .poll(() => violations.filter((v) => v.disposition === "report" && v.directive === "frame-src").map((v) => new URL(v.blocked).hostname))
    .toContain("rotated-player.example");
});

test("control: the old fixed frame-src list blocks that same player", async ({ page }) => {
  const violations = await openPlayer(page, oldHeaders());
  await expect
    .poll(() => violations.filter((v) => v.disposition === "enforce" && v.directive === "frame-src").length)
    .toBeGreaterThan(0);
  expect(page.frames().some((frame) => frame.url().startsWith(ROTATED))).toBe(false);
});

test("browsers' CSP reports are stored as hostnames and listed in /admin/hosts", async ({ page, request }) => {
  const response = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify({
      "csp-report": {
        "document-uri": `http://localhost:3000/watch/${AVAILABLE_SLUG}?x=1`,
        "effective-directive": "frame-src",
        "blocked-uri": "https://rotated-player.example/e/secret-file-code?token=t",
        disposition: "report",
      },
    }),
  });
  expect(response.status()).toBe(204);
  const reportTo = await request.post("/api/csp-report", {
    headers: { "content-type": "application/reports+json" },
    data: JSON.stringify([
      { type: "csp-violation", body: { documentURL: "http://localhost:3000/", effectiveDirective: "frame-src", blockedURL: "https://d000d.example/e/x", disposition: "enforce" } },
    ]),
  });
  expect(reportTo.status()).toBe(204);
  expect((await request.post("/api/csp-report", { data: "not json", headers: { "content-type": "text/plain" } })).status()).toBe(400);

  await loginAdmin(page);
  await page.goto("/admin/hosts");
  const table = page.getByRole("region", { name: "Player domains reported by browsers" });
  await expect(table.getByRole("row", { name: /rotated-player\.example Report/ })).toBeVisible();
  await expect(table.getByRole("row", { name: /d000d\.example Blocked/ })).toBeVisible();
  await expect(table).not.toContainText("secret-file-code");
  await expect(table).toContainText(`/watch/${AVAILABLE_SLUG}`);
});
