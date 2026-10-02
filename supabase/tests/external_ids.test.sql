-- Competition Corner ids. An import matches rows by the id the source gave
-- them, so one source id may name at most one row per competition — two
-- would make a re-sync pick one at random. Rows typed in by hand carry no
-- id, and any number of them may sit side by side.

INSERT INTO "Competition" (id, name, slug, "ccEventId") VALUES
  (920001, 'External A', 'ext-a', 19948),
  (920002, 'External B', 'ext-b', NULL);

SELECT test.ok(
  (SELECT "ccSyncedAt" IS NULL FROM "Competition" WHERE id = 920001),
  'ccSyncedAt starts empty'
);

INSERT INTO "Division" (id, name, "order", "competitionId", "externalId") VALUES
  (920001, 'RX', 1, 920001, '131045'),
  (920002, 'Hand A', 2, 920001, NULL),
  (920003, 'Hand B', 3, 920001, NULL),
  (920004, 'RX', 1, 920002, '131045');

SELECT test.ok(
  test.rejects($$INSERT INTO "Division" (name, "order", "competitionId", "externalId")
                 VALUES ('RX copy', 4, 920001, '131045')$$),
  'Division externalId is unique within a competition'
);

INSERT INTO "Workout" (id, number, name, "scoreType", lanes,
                       "heatIntervalSecs", "callTimeSecs", "walkoutTimeSecs",
                       "competitionId", "externalId", "externalPartBId") VALUES
  (920001, 1, 'WOD 1', 'time', 9, 600, 120, 60, 920001, '121778', NULL),
  (920002, 2, 'WOD 3', 'time', 9, 600, 120, 60, 920001, '119545', '119547'),
  (920003, 3, 'Hand', 'time', 9, 600, 120, 60, 920001, NULL, NULL),
  (920004, 1, 'WOD 1', 'time', 9, 600, 120, 60, 920002, '121778', NULL);

SELECT test.ok(
  test.rejects($$INSERT INTO "Workout" (number, name, "scoreType", lanes,
                   "heatIntervalSecs", "callTimeSecs", "walkoutTimeSecs",
                   "competitionId", "externalId")
                 VALUES (9, 'Dup', 'time', 9, 600, 120, 60, 920001, '121778')$$),
  'Workout externalId is unique within a competition'
);

INSERT INTO "Athlete" (id, name, "competitionId", "externalId") VALUES
  (920001, 'Maddie Clark', 920001, '1430644'),
  (920002, 'Walk-in', 920001, NULL),
  (920003, 'Walk-in 2', 920001, NULL),
  (920004, 'Maddie Clark', 920002, '1430644');

SELECT test.ok(
  test.rejects($$INSERT INTO "Athlete" (name, "competitionId", "externalId")
                 VALUES ('Dup', 920001, '1430644')$$),
  'Athlete externalId is unique within a competition'
);
