-- CreateTable
CREATE TABLE "Athlete" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "bibNumber" TEXT
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scoreType" TEXT NOT NULL,
    "lanes" INTEGER NOT NULL,
    "heatIntervalSecs" INTEGER NOT NULL,
    "callTimeSecs" INTEGER NOT NULL,
    "walkoutTimeSecs" INTEGER NOT NULL,
    "startTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft'
);

-- CreateTable
CREATE TABLE "HeatAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workoutId" INTEGER NOT NULL,
    "athleteId" INTEGER NOT NULL,
    "heatNumber" INTEGER NOT NULL,
    "lane" INTEGER NOT NULL,
    CONSTRAINT "HeatAssignment_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HeatAssignment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "athleteId" INTEGER NOT NULL,
    "workoutId" INTEGER NOT NULL,
    "rawScore" REAL NOT NULL,
    "points" INTEGER,
    CONSTRAINT "Score_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Score_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Workout_number_key" ON "Workout"("number");

-- CreateIndex
CREATE UNIQUE INDEX "HeatAssignment_workoutId_athleteId_key" ON "HeatAssignment"("workoutId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_athleteId_workoutId_key" ON "Score"("athleteId", "workoutId");
