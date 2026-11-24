-- X posts approved from /admin/review: the worker makes the clip on the VPS.
-- AlterEnum
ALTER TYPE "SocialPostStatus" ADD VALUE 'preparing' BEFORE 'waiting';

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN "clipMode" TEXT,
ADD COLUMN "clipStart" INTEGER,
ADD COLUMN "clipSource" TEXT;
