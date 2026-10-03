-- EnableExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'PROCESSING', 'REMOVED', 'BLOCKED', 'AGE_RESTRICTED', 'REGION_RESTRICTED', 'FAILED');

-- CreateEnum
CREATE TYPE "MirrorStatus" AS ENUM ('OK', 'MISSING', 'ERROR');

-- CreateEnum
CREATE TYPE "MirrorMatchedBy" AS ENUM ('PRIMARY', 'AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('NEW', 'HEALTH');

-- CreateEnum
CREATE TYPE "RemovalRequestType" AS ENUM ('DMCA', 'REMOVAL');

-- CreateTable
CREATE TABLE "Host" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "isPrimary" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "group" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "trending" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "created" INTEGER NOT NULL,
    "matched" INTEGER NOT NULL,
    "missing" INTEGER NOT NULL,
    "errors" JSONB NOT NULL,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRequest" (
    "id" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "SyncRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemovalRequest" (
    "id" TEXT NOT NULL,
    "type" "RemovalRequestType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSlot" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "html" TEXT NOT NULL,

    CONSTRAINT "AdSlot_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationSeconds" INTEGER,
    "quality" TEXT,
    "thumbnailPath" TEXT,
    "status" "Availability" NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hotOverride" BOOLEAN NOT NULL DEFAULT false,
    "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mirror" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "fileCode" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "embedUrl" TEXT NOT NULL,
    "hostThumbnailUrl" TEXT,
    "lengthSeconds" INTEGER,
    "status" "MirrorStatus" NOT NULL,
    "matchedBy" "MirrorMatchedBy" NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Mirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostFile" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "fileCode" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedVideoId" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HostFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTag" (
    "videoId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "VideoTag_pkey" PRIMARY KEY ("videoId","tagId")
);

-- CreateTable
CREATE TABLE "VideoDailyStat" (
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL,

    CONSTRAINT "VideoDailyStat_pkey" PRIMARY KEY ("videoId","date")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL,
    "details" TEXT,
    "contactEmail" TEXT,
    "pageUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Video_slug_key" ON "Video"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Mirror_hostId_fileCode_key" ON "Mirror"("hostId", "fileCode");

-- CreateIndex
CREATE UNIQUE INDEX "Mirror_videoId_hostId_key" ON "Mirror"("videoId", "hostId");

-- CreateIndex
CREATE INDEX "Mirror_normalizedName_idx" ON "Mirror"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "HostFile_hostId_fileCode_key" ON "HostFile"("hostId", "fileCode");

-- CreateIndex
CREATE INDEX "HostFile_normalizedName_idx" ON "HostFile"("normalizedName");

-- TrigramIndex
CREATE INDEX "Video_title_trgm_idx" ON "Video" USING GIN ("title" gin_trgm_ops);

-- OnePrimaryHost
CREATE UNIQUE INDEX "Host_one_primary_idx" ON "Host" ("isPrimary") WHERE "isPrimary" = true;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mirror" ADD CONSTRAINT "Mirror_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mirror" ADD CONSTRAINT "Mirror_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostFile" ADD CONSTRAINT "HostFile_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostFile" ADD CONSTRAINT "HostFile_linkedVideoId_fkey" FOREIGN KEY ("linkedVideoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoDailyStat" ADD CONSTRAINT "VideoDailyStat_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
