-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workout" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scoreType" TEXT NOT NULL,
    "lanes" INTEGER NOT NULL,
    "heatIntervalSecs" INTEGER NOT NULL,
    "timeBetweenHeatsSecs" INTEGER NOT NULL DEFAULT 120,
    "callTimeSecs" INTEGER NOT NULL,
    "walkoutTimeSecs" INTEGER NOT NULL,
    "startTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "mixedHeats" BOOLEAN NOT NULL DEFAULT true,
    "tiebreakEnabled" BOOLEAN NOT NULL DEFAULT false,
    "heatStartOverrides" TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO "new_Workout" ("callTimeSecs", "heatIntervalSecs", "heatStartOverrides", "id", "lanes", "mixedHeats", "name", "number", "scoreType", "startTime", "status", "tiebreakEnabled", "walkoutTimeSecs") SELECT "callTimeSecs", "heatIntervalSecs", "heatStartOverrides", "id", "lanes", "mixedHeats", "name", "number", "scoreType", "startTime", "status", "tiebreakEnabled", "walkoutTimeSecs" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE UNIQUE INDEX "Workout_number_key" ON "Workout"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
