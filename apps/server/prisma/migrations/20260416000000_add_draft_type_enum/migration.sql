-- CreateEnum
CREATE TYPE "DraftType" AS ENUM ('MESSAGE', 'COMMAND');

-- AlterTable
ALTER TABLE "ai_drafts" ALTER COLUMN "draftType" TYPE "DraftType" USING "draftType"::"DraftType";
