import { expect, test, type Page, type Request } from "@playwright/test";

import { addAgeCookie, AVAILABLE_SLUG } from "./helpers";

function requestUrlHasPii(request: Request, pii: readonly string[]) {
  const url = request.url();
  return pii.some(
    (value) =>
      url.includes(value) ||
      url.includes(encodeURIComponent(value)) ||
      decodeURIComponent(url).includes(value),
  );
}

async function captureRequestSubmission(
  page: Page,
  submit: () => Promise<void>,
) {
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/requests";
  });

  await submit();
  return requestPromise;
}

test("DMCA form posts deterministic data without PII in the URL", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);
  await page.goto("/content-removal/dmca");

  const name = "T37 Example Owner";
  const email = "t37-dmca@example.test";
  const work = "T37 deterministic original work";
  const signature = "T37 Example Owner";
  const reportedUrl = "http://localhost:3000/watch/" + AVAILABLE_SLUG;

  await page.locator('input[name="fullName"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("radio", { name: "Copyright owner" }).check();
  await page.locator('textarea[name="work"]').fill(work);
  await page.locator('input[name="urls"]').fill(reportedUrl);
  await page.locator('input[name="goodFaith"]').check();
  await page.locator('input[name="authority"]').check();
  await page.locator('input[name="signature"]').fill(signature);

  const request = await captureRequestSubmission(page, async () => {
    await page.getByRole("button", { name: "Submit notice" }).click();
  });

  expect(request.method()).toBe("POST");
  expect(new URL(request.url()).search).toBe("");
  expect(request.postData()).toContain(email);
  expect(request.postData()).toContain(name);
  expect(requestUrlHasPii(request, [email, name, work, signature])).toBe(false);

  await expect(
    page.getByRole("heading", { name: "Notice received" }),
  ).toBeVisible();
  await expect(page.getByText(/Reference · DMCA-/)).toBeVisible();

  const currentUrl = page.url();
  for (const value of [email, name, work, signature]) {
    expect(currentUrl).not.toContain(value);
    expect(currentUrl).not.toContain(encodeURIComponent(value));
  }
});

test("removal request posts deterministic data without PII in the URL", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);
  await page.goto("/content-removal/request");

  const email = "t37-removal@example.test";
  const details = "T37 deterministic removal details";
  const reportedUrl = "http://localhost:3000/watch/" + AVAILABLE_SLUG;

  await page.getByRole("radio", { name: /Other · Removal request/ }).check();
  await page.locator('input[name="urls"]').fill(reportedUrl);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('textarea[name="details"]').fill(details);
  await page.locator('input[name="confirmed"]').check();

  const request = await captureRequestSubmission(page, async () => {
    await page.getByRole("button", { name: "Submit request" }).click();
  });

  expect(request.method()).toBe("POST");
  expect(new URL(request.url()).search).toBe("");
  expect(request.postData()).toContain(email);
  expect(request.postData()).toContain(details);
  expect(requestUrlHasPii(request, [email, details])).toBe(false);

  await expect(
    page.getByRole("heading", { name: "Request received" }),
  ).toBeVisible();
  await expect(page.getByText(/Reference · CR-/)).toBeVisible();

  const currentUrl = page.url();
  for (const value of [email, details]) {
    expect(currentUrl).not.toContain(value);
    expect(currentUrl).not.toContain(encodeURIComponent(value));
  }
});

test("Next metadata icon routes expose the approved app icon set", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);
  await page.goto("/");

  const dimensions = await page.evaluate(async () => {
    async function load(path: string) {
      return await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("Could not load " + path));
        image.src = path + "?t37=1";
      });
    }

    return {
      icon32: await load("/icon1.png"),
      icon192: await load("/icon2.png"),
      apple180: await load("/apple-icon.png"),
    };
  });

  expect(dimensions).toEqual({
    icon32: { width: 32, height: 32 },
    icon192: { width: 192, height: 192 },
    apple180: { width: 180, height: 180 },
  });
});
