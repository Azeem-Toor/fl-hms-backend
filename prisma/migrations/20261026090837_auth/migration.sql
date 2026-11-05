-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RefreshSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,
    "application" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "tokenFamilyId" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    "revokeReason" TEXT,
    CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RefreshSession_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RefreshSession" ("application", "createdAt", "expiresAt", "id", "lastUsedAt", "refreshTokenHash", "revokeReason", "revokedAt", "roleId", "tokenFamilyId", "tokenVersion", "updatedAt", "userId") SELECT "application", "createdAt", "expiresAt", "id", "lastUsedAt", "refreshTokenHash", "revokeReason", "revokedAt", "roleId", "tokenFamilyId", "tokenVersion", "updatedAt", "userId" FROM "RefreshSession";
DROP TABLE "RefreshSession";
ALTER TABLE "new_RefreshSession" RENAME TO "RefreshSession";
CREATE INDEX "RefreshSession_userId_revokedAt_idx" ON "RefreshSession"("userId", "revokedAt");
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");
CREATE INDEX "RefreshSession_tokenFamilyId_idx" ON "RefreshSession"("tokenFamilyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
