-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "converse_members" ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "role" "GroupRole";

-- AlterTable
ALTER TABLE "converses" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "creatorId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "maxMembers" INTEGER NOT NULL DEFAULT 200;
