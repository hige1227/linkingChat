-- AlterTable: Add mutedUntil to converse_members
ALTER TABLE "converse_members" ADD COLUMN "mutedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "converse_members_mutedUntil_idx" ON "converse_members"("mutedUntil");

-- CreateTable
CREATE TABLE "group_bans" (
    "id" TEXT NOT NULL,
    "converseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bannedBy" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_bans_converseId_userId_key" ON "group_bans"("converseId", "userId");

-- CreateIndex
CREATE INDEX "group_bans_converseId_idx" ON "group_bans"("converseId");

-- AddForeignKey
ALTER TABLE "group_bans" ADD CONSTRAINT "group_bans_converseId_fkey" FOREIGN KEY ("converseId") REFERENCES "converses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_bans" ADD CONSTRAINT "group_bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_bans" ADD CONSTRAINT "group_bans_bannedBy_fkey" FOREIGN KEY ("bannedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
