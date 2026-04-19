-- CreateTable
CREATE TABLE "Division" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Athlete" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "bibNumber" TEXT,
    "divisionId" INTEGER,

    CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scoreType" TEXT NOT NULL,
    "lanes" INTEGER NOT NULL,
    "heatIntervalSecs" INTEGER NOT NULL,
    "timeBetweenHeatsSecs" INTEGER NOT NULL DEFAULT 120,
    "callTimeSecs" INTEGER NOT NULL,
    "walkoutTimeSecs" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "mixedHeats" BOOLEAN NOT NULL DEFAULT true,
    "tiebreakEnabled" BOOLEAN NOT NULL DEFAULT false,
    "heatStartOverrides" TEXT NOT NULL DEFAULT '{}',
    "completedHeats" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeatAssignment" (
    "id" SERIAL NOT NULL,
    "workoutId" INTEGER NOT NULL,
    "athleteId" INTEGER NOT NULL,
    "heatNumber" INTEGER NOT NULL,
    "lane" INTEGER NOT NULL,

    CONSTRAINT "HeatAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" SERIAL NOT NULL,
    "athleteId" INTEGER NOT NULL,
    "workoutId" INTEGER NOT NULL,
    "rawScore" DOUBLE PRECISION NOT NULL,
    "tiebreakRawScore" DOUBLE PRECISION,
    "points" INTEGER,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Division_name_key" ON "Division"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Workout_number_key" ON "Workout"("number");

-- CreateIndex
CREATE UNIQUE INDEX "HeatAssignment_workoutId_athleteId_key" ON "HeatAssignment"("workoutId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Score_athleteId_workoutId_key" ON "Score"("athleteId", "workoutId");

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatAssignment" ADD CONSTRAINT "HeatAssignment_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatAssignment" ADD CONSTRAINT "HeatAssignment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
