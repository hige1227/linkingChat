-- CreateEnum
CREATE TYPE "RelationshipTier" AS ENUM ('CORE', 'IMPORTANT', 'EXTENDED');

-- CreateEnum
CREATE TYPE "SentimentTrend" AS ENUM ('WARMING', 'STABLE', 'COOLING');

-- CreateTable
CREATE TABLE "RelationshipProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tier" "RelationshipTier" NOT NULL DEFAULT 'IMPORTANT',
    "label" TEXT,
    "notes" TEXT,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "customSilenceDays" INTEGER,
    "isUrgentReply" BOOLEAN NOT NULL DEFAULT false,
    "lastInteractionAt" TIMESTAMP(3),
    "weeklyMessageCount" INTEGER NOT NULL DEFAULT 0,
    "prevWeeklyMessageCount" INTEGER,
    "avgResponseMinutes" DOUBLE PRECISION,
    "initiationScore" DOUBLE PRECISION,
    "groupInteractionCount" INTEGER NOT NULL DEFAULT 0,
    "lastKeyEventSummary" TEXT,
    "sentimentTrend" "SentimentTrend",
    "silenceReminderSentAt" TIMESTAMP(3),
    "coolingReminderSentAt" TIMESTAMP(3),
    "pendingReplyReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RelationshipEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "metadata" JSONB,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JarvisState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelationshipProfile_userId_isMuted_idx" ON "RelationshipProfile"("userId", "isMuted");

-- CreateIndex
CREATE INDEX "RelationshipProfile_userId_lastInteractionAt_idx" ON "RelationshipProfile"("userId", "lastInteractionAt");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipProfile_userId_contactId_key" ON "RelationshipProfile"("userId", "contactId");

-- CreateIndex
CREATE INDEX "RelationshipEvent_profileId_isActive_idx" ON "RelationshipEvent"("profileId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "JarvisState_userId_key" ON "JarvisState"("userId");

-- CreateIndex
CREATE INDEX "JarvisState_userId_idx" ON "JarvisState"("userId");

-- AddForeignKey
ALTER TABLE "RelationshipProfile" ADD CONSTRAINT "RelationshipProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipProfile" ADD CONSTRAINT "RelationshipProfile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipEvent" ADD CONSTRAINT "RelationshipEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RelationshipProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarvisState" ADD CONSTRAINT "JarvisState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
