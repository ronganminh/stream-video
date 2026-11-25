-- When Buffer will post each X post: the queue room is counted from these
-- between Buffer reads (fewer API requests).
ALTER TABLE "SocialPost" ADD COLUMN "bufferDueAt" TIMESTAMP(3);
