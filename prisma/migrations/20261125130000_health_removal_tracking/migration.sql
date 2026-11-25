-- Who removed a video (the health check restores only its own removals), and
-- how many health checks in a row found a mirror missing.
ALTER TABLE "Video" ADD COLUMN "removedBy" TEXT;
ALTER TABLE "Video" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "Mirror" ADD COLUMN "missingStreak" INTEGER NOT NULL DEFAULT 0;
