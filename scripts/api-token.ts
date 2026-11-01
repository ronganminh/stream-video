import { generateApiToken, hashApiToken } from "../lib/api/tokens";
import { db } from "../lib/db";

// Manage publish-API tokens (docs/API.md). On the VPS:
//   docker compose run --rm worker npm run api-token -- create <admin email> <name>
//   docker compose run --rm worker npm run api-token -- list
//   docker compose run --rm worker npm run api-token -- revoke <name or id>
// The token is printed once, by create; only its hash is stored.

async function create(emailArg: string | undefined, name: string | undefined) {
  const email = emailArg?.trim().toLowerCase();
  if (!email || !name?.trim() || !/^[A-Za-z0-9._-]{1,40}$/.test(name.trim())) {
    throw new Error("Usage: api-token create <admin email> <name: letters, digits, . _ ->");
  }
  const admin = await db.adminUser.findFirst({ where: { email }, select: { id: true } });
  if (!admin) throw new Error(`No admin account ${email} (create it with npm run admin:create).`);
  const clash = await db.apiToken.findFirst({
    where: { name: name.trim(), revokedAt: null },
    select: { id: true },
  });
  if (clash) throw new Error(`An active token is already named "${name.trim()}"; revoke it first.`);

  const token = generateApiToken();
  await db.apiToken.create({
    data: { name: name.trim(), tokenHash: hashApiToken(token), adminId: admin.id },
  });
  console.info(`Created token "${name.trim()}" for ${email}. Copy it now; it is not shown again:`);
  console.info(token);
}

async function list() {
  const tokens = await db.apiToken.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      admin: { select: { email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!tokens.length) console.info("No tokens.");
  for (const token of tokens) {
    console.info(
      [
        token.name,
        token.id,
        token.admin.email,
        `created ${token.createdAt.toISOString()}`,
        `last used ${token.lastUsedAt?.toISOString() ?? "never"}`,
        token.revokedAt ? `REVOKED ${token.revokedAt.toISOString()}` : "active",
      ].join("  "),
    );
  }
}

async function revoke(nameOrId: string | undefined) {
  if (!nameOrId) throw new Error("Usage: api-token revoke <name or id>");
  const result = await db.apiToken.updateMany({
    where: { OR: [{ id: nameOrId }, { name: nameOrId }], revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!result.count) throw new Error(`No active token named or with id "${nameOrId}".`);
  console.info(`Revoked ${result.count} token(s).`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "create") return create(args[0], args[1]);
  if (command === "list") return list();
  if (command === "revoke") return revoke(args[0]);
  throw new Error("Usage: api-token <create <admin email> <name>|list|revoke <name or id>>");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
