import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

import { categories } from "../lib/fixtures/categories";
import { tags } from "../lib/fixtures/tags";
import { videos } from "../lib/fixtures/videos";

const prisma = new PrismaClient();

const FIXED_NOW = new Date("2026-10-01T12:00:00.000Z");
const MINUTE = 60_000;

const hosts = [
  { id: "dood", label: "DoodStream", enabled: true, isPrimary: true, sortOrder: 10 },
  { id: "voe", label: "VOE", enabled: true, isPrimary: false, sortOrder: 20 },
  { id: "earnvids", label: "EarnVids", enabled: true, isPrimary: false, sortOrder: 30 },
] as const;

function categoryId(index: number): string {
  return `category-${String(index + 1).padStart(3, "0")}`;
}

function tagId(index: number): string {
  return `tag-${String(index + 1).padStart(3, "0")}`;
}

function seededPublishedAt(index: number): Date {
  return new Date(FIXED_NOW.getTime() - index * 18 * MINUTE);
}

function dayAtOffset(daysAgo: number): Date {
  const date = new Date(FIXED_NOW);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

async function reset() {
  await prisma.adminAction.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.removalRequest.deleteMany();
  await prisma.report.deleteMany();
  await prisma.videoDailyStat.deleteMany();
  await prisma.videoTag.deleteMany();
  await prisma.hostFile.deleteMany();
  await prisma.mirror.deleteMany();
  await prisma.video.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.host.deleteMany();
}

async function seedAdmin() {
  await prisma.adminUser.create({
    data: {
      id: "admin-e2e",
      email: "admin@gayvideo.test",
      passwordHash: await bcrypt.hash("e2e-admin-password", 10),
    },
  });
}

async function seedHosts() {
  for (const host of hosts) {
    await prisma.host.create({ data: host });
  }
}

async function seedTaxonomy() {
  for (const [index, category] of categories.entries()) {
    await prisma.category.create({
      data: {
        id: categoryId(index),
        slug: category.slug,
        name: category.name,
        description: category.description ?? null,
        group: category.group,
        thumbnailPath: category.thumbnailUrl,
        trending: Boolean(category.trending),
        sortOrder: index,
      },
    });
  }

  for (const [index, tag] of tags.entries()) {
    await prisma.tag.create({
      data: {
        id: tagId(index),
        slug: tag.slug,
        name: tag.name,
      },
    });
  }
}

async function seedVideos() {
  for (const [index, fixture] of videos.entries()) {
    const publishedAt = seededPublishedAt(index);
    const categoryIndex = index % categories.length;

    await prisma.video.create({
      data: {
        id: fixture.id,
        slug: fixture.slug,
        title: fixture.title,
        description: `Seed description for ${fixture.title}.`,
        durationSeconds: fixture.durationSeconds,
        quality: fixture.quality ?? null,
        thumbnailPath: fixture.thumbnailUrl,
        status: fixture.availability ?? "AVAILABLE",
        isPublished: true,
        isHidden: false,
        hotOverride: Boolean(fixture.hot),
        ageRestricted: fixture.availability === "AGE_RESTRICTED",
        categoryId: categoryId(categoryIndex),
        views: fixture.views,
        likes: Math.max(0, Math.round(fixture.views * 0.012)),
        publishedAt,
        createdAt: publishedAt,
      },
    });

    const tagIndexes = [
      index % tags.length,
      (index + 6) % tags.length,
      (index + 15) % tags.length,
    ];

    for (const indexOfTag of new Set(tagIndexes)) {
      await prisma.videoTag.create({
        data: {
          videoId: fixture.id,
          tagId: tagId(indexOfTag),
        },
      });
    }

    for (const [hostIndex, host] of hosts.entries()) {
      const fileCode = `${host.id}-${fixture.id}`;
      await prisma.mirror.create({
        data: {
          id: `mirror-${host.id}-${fixture.id}`,
          videoId: fixture.id,
          hostId: host.id,
          fileCode,
          rawTitle: fixture.title,
          normalizedName: fixture.title.toLowerCase(),
          embedUrl: `https://example.invalid/embed/${host.id}/${fixture.id}`,
          hostThumbnailUrl: fixture.thumbnailUrl,
          lengthSeconds: fixture.durationSeconds,
          status: hostIndex === 2 && index % 7 === 0 ? "MISSING" : "OK",
          matchedBy: hostIndex === 0 ? "PRIMARY" : "AUTO",
          lastCheckedAt: FIXED_NOW,
        },
      });
    }

    const dailyBase = Math.max(1, Math.round(fixture.views / 100));
    for (let daysAgo = 0; daysAgo < 30; daysAgo += 1) {
      await prisma.videoDailyStat.create({
        data: {
          videoId: fixture.id,
          date: dayAtOffset(daysAgo),
          views: dailyBase + ((index * 31 + daysAgo * 17) % 400),
        },
      });
    }
  }

  await prisma.video.create({
    data: {
      id: "video-draft-seed",
      slug: "draft-seed-video",
      title: "Draft Seed Video",
      description: "Seed-only draft visibility check.",
      durationSeconds: 600,
      quality: "HD",
      status: "AVAILABLE",
      isPublished: false,
      isHidden: false,
      categoryId: categoryId(0),
      views: 0,
      likes: 0,
      createdAt: FIXED_NOW,
    },
  });

  await prisma.video.create({
    data: {
      id: "video-draft-status-seed",
      slug: "draft-status-seed-video",
      title: "Draft Status Seed Video",
      description: "Seed-only draft HTTP status check.",
      durationSeconds: 600,
      quality: "HD",
      status: "AVAILABLE",
      isPublished: false,
      isHidden: false,
      categoryId: categoryId(0),
      views: 0,
      likes: 0,
      createdAt: FIXED_NOW,
    },
  });

  await prisma.video.create({
    data: {
      id: "video-hidden-seed",
      slug: "hidden-seed-video",
      title: "Hidden Seed Video",
      description: "Seed-only hidden visibility check.",
      durationSeconds: 600,
      quality: "HD",
      status: "AVAILABLE",
      isPublished: true,
      isHidden: true,
      categoryId: categoryId(0),
      views: 0,
      likes: 0,
      publishedAt: FIXED_NOW,
      createdAt: FIXED_NOW,
    },
  });

  await prisma.hostFile.create({
    data: {
      id: "host-file-e2e-manual",
      hostId: "voe",
      fileCode: "e2e-draft-seed-voe",
      rawTitle: "Draft Seed Video.mp4",
      normalizedName: "draft seed video",
      firstSeenAt: FIXED_NOW,
      ignored: false,
    },
  });
}

async function main() {
  await reset();
  await seedAdmin();
  await seedHosts();
  await seedTaxonomy();
  await seedVideos();

  console.info(
    `Seeded admin, ${hosts.length} hosts, ${categories.length} categories, ${tags.length} tags, and ${videos.length + 3} videos.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
