-- Old slugs of published videos; /watch/<old slug> answers 301 to the current one.
-- CreateTable
CREATE TABLE "SlugRedirect" (
    "slug" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugRedirect_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "SlugRedirect_videoId_idx" ON "SlugRedirect"("videoId");

-- AddForeignKey
ALTER TABLE "SlugRedirect" ADD CONSTRAINT "SlugRedirect_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

