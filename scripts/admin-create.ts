import bcrypt from "bcrypt";

import { db } from "../lib/db";

async function main() {
  const [emailArg, password] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();

  if (!email || !email.includes("@") || !password || password.length < 12) {
    throw new Error(
      "Usage: tsx scripts/admin-create.ts <email> <password-at-least-12-chars>",
    );
  }

  const existing = await db.adminUser.findFirst({
    where: { email },
    select: { id: true },
  });

  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    await db.adminUser.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
    console.info(`Updated admin account: ${email}`);
    return;
  }

  await db.adminUser.create({
    data: {
      email,
      passwordHash,
    },
  });
  console.info(`Created admin account: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
