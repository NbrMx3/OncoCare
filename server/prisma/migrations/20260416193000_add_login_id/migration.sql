-- AlterTable
ALTER TABLE "User" ADD COLUMN "loginId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");
