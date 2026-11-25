-- Waits for Google Drive's download quota are counted apart from attempts.
-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN "quotaWaits" INTEGER NOT NULL DEFAULT 0;
