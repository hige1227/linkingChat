-- CreateEnum
CREATE TYPE "AiSuggestionType" AS ENUM ('WHISPER', 'PREDICTIVE');

-- CreateEnum
CREATE TYPE "AiSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" TEXT NOT NULL,
    "type" "AiSuggestionType" NOT NULL,
    "status" "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "converseId" TEXT NOT NULL,
    "messageId" TEXT,
    "suggestions" JSONB NOT NULL,
    "selectedIndex" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_drafts" (
    "id" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "converseId" TEXT NOT NULL,
    "botId" TEXT,
    "draftType" TEXT NOT NULL,
    "draftContent" JSONB NOT NULL,
    "editedContent" JSONB,
    "rejectReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_suggestions_userId_createdAt_idx" ON "ai_suggestions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_drafts_userId_status_idx" ON "ai_drafts"("userId", "status");

-- CreateIndex
CREATE INDEX "ai_drafts_expiresAt_idx" ON "ai_drafts"("expiresAt");

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_converseId_fkey" FOREIGN KEY ("converseId") REFERENCES "converses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_converseId_fkey" FOREIGN KEY ("converseId") REFERENCES "converses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
