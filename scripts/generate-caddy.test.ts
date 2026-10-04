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
});
