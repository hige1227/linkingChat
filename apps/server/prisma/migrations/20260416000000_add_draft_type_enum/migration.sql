-- CreateEnum
CREATE TYPE "DraftType" AS ENUM ('MESSAGE', 'COMMAND');

-- AlterTable
ALTER TABLE "ai_drafts" ALTER COLUMN "draft_type" TYPE "DraftType" USING "draft_type"::"DraftType";
