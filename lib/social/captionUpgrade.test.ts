import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { GENERIC_CAPTION } from "./captionRules";
import { upgradeLegacyCaptions } from "./captionUpgrade";
import { CAPTION_TEMPLATE_SETTING, getXCaptionSettings } from "./settings";

const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "e2e-caption-upgrade-";

describe.skipIf(!databaseUrl)("upgradeLegacyCaptions (database)", () => {
  const prisma = new PrismaClient();
  let savedSetting: unknown = undefined;

  async function cleanUp() {
    await prisma.socialPost.deleteMany({ where: { video: { slug: { startsWith: PREFIX } } } });
    await prisma.video.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  }

  async function post(slug: string, title: string, caption: string, status: "waiting" | "queued" | "preparing" | "pushed") {
    const video = await prisma.video.create({
      data: { slug: `${PREFIX}${slug}`, title, status: "AVAILABLE", isPublished: true },
    });
    return prisma.socialPost.create({
      data: { videoId: video.id, network: "x", status, caption, clipMode: "clip", clipStart: 0, clipSeconds: 120 },
    });
  }

  const caption = async (id: string) => (await prisma.socialPost.findUniqueOrThrow({ where: { id } })).caption;

  beforeEach(async () => {
    if (savedSetting === undefined) {
      const row = await prisma.setting.findUnique({ where: { key: CAPTION_TEMPLATE_SETTING } });
      savedSetting = row ? row.value : null;
    }
    await cleanUp();
    await prisma.setting.deleteMany({ where: { key: CAPTION_TEMPLATE_SETTING } });
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.setting.deleteMany({ where: { key: CAPTION_TEMPLATE_SETTING } });
    if (savedSetting !== null && savedSetting !== undefined) {
      await prisma.setting.create({ data: { key: CAPTION_TEMPLATE_SETTING, value: savedSetting as string } });
    }
    await prisma.$disconnect();
  });

  it("moves the saved old template and unedited pending captions to the title alone", async () => {
    await prisma.setting.create({ data: { key: CAPTION_TEMPLATE_SETTING, value: "New video: {title} 🔥" } });
    const waiting = await post("waiting", "Bèo – Baker", "New video: Beo – Baker 🔥", "waiting");
    const preparing = await post("preparing", "Seachan x Theresome", "New video: Seachan x Theresome 🔥", "preparing");
    const edited = await post("edited", "Gym day", "New video: Gym day 🔥🔥 part 2", "queued");
    const pushed = await post("pushed", "In Buffer", "New video: In Buffer 🔥", "pushed");
    const banned = await post("banned", "Nude beach", GENERIC_CAPTION, "waiting");

    const dry = await upgradeLegacyCaptions({ apply: false, client: prisma });
    expect(dry).toMatchObject({ setting: "upgraded", posts: 2 });
    expect(await caption(waiting.id)).toBe("New video: Beo – Baker 🔥");

    const result = await upgradeLegacyCaptions({ client: prisma });
    expect(result).toMatchObject({ setting: "upgraded", posts: 2 });
    expect((await getXCaptionSettings(prisma)).template).toBe("{title}");
    expect(await caption(waiting.id)).toBe("Beo – Baker");
    expect(await caption(preparing.id)).toBe("Seachan x Theresome");
    expect(await caption(edited.id)).toBe("New video: Gym day 🔥🔥 part 2"); // typed by an admin
    expect(await caption(pushed.id)).toBe("New video: In Buffer 🔥"); // already in Buffer
    expect(await caption(banned.id)).toBe(GENERIC_CAPTION);

    // Idempotent: the next deploy changes nothing.
    expect(await upgradeLegacyCaptions({ client: prisma })).toMatchObject({ setting: "default", posts: 0 });
  });

  it("keeps a custom saved template; nothing saved means the code default", async () => {
    expect((await upgradeLegacyCaptions({ client: prisma })).setting).toBe("unset");
    expect((await getXCaptionSettings(prisma)).template).toBe("{title}");
    await prisma.setting.create({ data: { key: CAPTION_TEMPLATE_SETTING, value: "Watch: {title}" } });
    expect((await upgradeLegacyCaptions({ client: prisma })).setting).toBe("custom");
    expect((await getXCaptionSettings(prisma)).template).toBe("Watch: {title}");
  });
});
