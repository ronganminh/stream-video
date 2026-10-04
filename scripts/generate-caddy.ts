import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hostRegistry } from "../lib/hosts/registry";

const FRAME_SRC_PLACEHOLDER = "{{FRAME_SRC}}";

export function registryFrameSources(): string[] {
  return Array.from(
    new Set(
      Array.from(hostRegistry.values()).flatMap((provider) =>
        provider.embedDomains.map((domain) => domain.trim().toLowerCase()),
      ),
    ),
  )
    .filter(Boolean)
    .sort()
    .map((domain) => "https://" + domain);
}

export function renderCaddyfile(template: string): string {
  if (!template.includes(FRAME_SRC_PLACEHOLDER)) {
    throw new Error(
      "Caddyfile.template is missing the " + FRAME_SRC_PLACEHOLDER + " placeholder",
    );
  }

  return template.replaceAll(
    FRAME_SRC_PLACEHOLDER,
    registryFrameSources().join(" "),
  );
}

export async function generateCaddyfile(options?: {
  check?: boolean;
  templatePath?: string;
  outputPath?: string;
}): Promise<void> {
  const root = process.cwd();
  const templatePath =
    options?.templatePath ?? path.join(root, "Caddyfile.template");
  const outputPath = options?.outputPath ?? path.join(root, "Caddyfile");
  const template = await readFile(templatePath, "utf8");
  const expected = renderCaddyfile(template);

  if (options?.check) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current !== expected) {
      throw new Error(
        "Caddyfile is out of date with Caddyfile.template or lib/hosts/registry.ts. Run npm run caddy:generate.",
      );
    }
    return;
  }

  await writeFile(outputPath, expected, "utf8");
}

async function main() {
  const check = process.argv.includes("--check");
  await generateCaddyfile({ check });
  console.info(check ? "Caddyfile is up to date." : "Generated Caddyfile.");
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const current = fileURLToPath(import.meta.url);

if (entry === current) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
