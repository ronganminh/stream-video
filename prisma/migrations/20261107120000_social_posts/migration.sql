-- Social posts (X via Buffer) queued per video; see lib/social.
-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('waiting', 'queued', 'pushing', 'pushed', 'sent', 'failed', 'cancelled');


-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "status" "SocialPostStatus" NOT NULL,
    "caption" TEXT NOT NULL,
    "clipFile" TEXT,
    "clipSeconds" INTEGER,
    "bufferPostId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "externalLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_bufferPostId_key" ON "SocialPost"("bufferPostId");

-- CreateIndex
CREATE INDEX "SocialPost_status_idx" ON "SocialPost"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_videoId_network_key" ON "SocialPost"("videoId", "network");

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

