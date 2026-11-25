import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  registryFrameSources,
  renderCaddyfile,
} from "./generate-caddy";

describe("generated Caddy CSP", () => {
  it("keeps the committed Caddyfile in sync with the host registry", async () => {
    const root = process.cwd();
    const [template, committed] = await Promise.all([
      readFile(path.join(root, "Caddyfile.template"), "utf8"),
      readFile(path.join(root, "Caddyfile"), "utf8"),
    ]);

    expect(committed).toBe(renderCaddyfile(template));
  });

  it("does not duplicate provider domains in the template", async () => {
    const template = await readFile(
      path.join(process.cwd(), "Caddyfile.template"),
      "utf8",
    );

    for (const source of registryFrameSources()) {
      expect(template).not.toContain(source);
    }
  });

  it("renders every registry embed domain into frame-src", async () => {
    const template = await readFile(
      path.join(process.cwd(), "Caddyfile.template"),
      "utf8",
    );
    const rendered = renderCaddyfile(template);
    const sources = registryFrameSources();

    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(rendered).toContain(source);
    }

    expect(rendered).not.toContain("{{FRAME_SRC}}");
  });

  it("allows the Material Symbols stylesheet and font origins", async () => {
    const template = await readFile(
      path.join(process.cwd(), "Caddyfile.template"),
      "utf8",
    );

    expect(template).toContain(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
    );
    expect(template).toContain(
      "font-src 'self' https://fonts.gstatic.com;",
    );
  });

  it("allows any HTTPS player frame, reports frames outside the known list", async () => {
    const template = await readFile(path.join(process.cwd(), "Caddyfile.template"), "utf8");
    const rendered = renderCaddyfile(template);
    const enforced = rendered.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? "";
    const reportOnly = rendered.match(/Content-Security-Policy-Report-Only "([^"]+)"/)?.[1] ?? "";
    // Enforced: hosts rotate player domains, a fixed list blocked playback.
    expect(enforced).toMatch(/frame-src 'self' https:;/);
    expect(enforced).toContain("frame-ancestors 'none'");
    expect(enforced).toContain("report-to csp");
    // Report-only: the known list, so new domains are reported, not blocked.
    expect(reportOnly).toContain(`frame-src 'self' ${registryFrameSources().join(" ")};`);
    expect(reportOnly).toContain("report-uri /api/csp-report");
    expect(rendered).toContain('Reporting-Endpoints `csp="https://{$SITE_DOMAIN}/api/csp-report"`');
  });
});
