-- CreateTable
CREATE TABLE "Division" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Athlete" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "bibNumber" TEXT,
    "divisionId" INTEGER,
    CONSTRAINT "Athlete_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Athlete" ("bibNumber", "id", "name") SELECT "bibNumber", "id", "name" FROM "Athlete";
DROP TABLE "Athlete";
ALTER TABLE "new_Athlete" RENAME TO "Athlete";
CREATE TABLE "new_Workout" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scoreType" TEXT NOT NULL,
    "lanes" INTEGER NOT NULL,
    "heatIntervalSecs" INTEGER NOT NULL,
    "callTimeSecs" INTEGER NOT NULL,
    "walkoutTimeSecs" INTEGER NOT NULL,
    "startTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "mixedHeats" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Workout" ("callTimeSecs", "heatIntervalSecs", "id", "lanes", "name", "number", "scoreType", "startTime", "status", "walkoutTimeSecs") SELECT "callTimeSecs", "heatIntervalSecs", "id", "lanes", "name", "number", "scoreType", "startTime", "status", "walkoutTimeSecs" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE UNIQUE INDEX "Workout_number_key" ON "Workout"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Division_name_key" ON "Division"("name");
