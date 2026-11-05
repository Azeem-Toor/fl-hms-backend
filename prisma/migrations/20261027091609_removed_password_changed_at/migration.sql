/*
  Warnings:

  - You are about to drop the column `passwordChangedAt` on the `UserCredential` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserCredential" ("createdAt", "failedAttempts", "id", "lockedUntil", "passwordHash", "updatedAt", "userId") SELECT "createdAt", "failedAttempts", "id", "lockedUntil", "passwordHash", "updatedAt", "userId" FROM "UserCredential";
DROP TABLE "UserCredential";
ALTER TABLE "new_UserCredential" RENAME TO "UserCredential";
CREATE UNIQUE INDEX "UserCredential_userId_key" ON "UserCredential"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
