-- Teams. A team is an Athlete row with TeamMember rows under it; the members
-- go when the team goes. Division shape and gender are constrained only to
-- sane values — a mismatch between the two is warned about in the app, never
-- refused here.

INSERT INTO "Competition" (id, name, slug) VALUES (930001, 'Teams', 'teams');

INSERT INTO "Division" (id, name, "order", "competitionId") VALUES
  (930001, 'Individual', 1, 930001);

SELECT test.ok(
  (SELECT "teamSize" = 1 AND "menCount" IS NULL AND "womenCount" IS NULL
     FROM "Division" WHERE id = 930001),
  'a division defaults to individual with no gender requirement'
);

SELECT test.ok(
  test.rejects($$INSERT INTO "Division" (name, "order", "competitionId", "teamSize")
                 VALUES ('Zero', 2, 930001, 0)$$),
  'teamSize is at least 1'
);

SELECT test.ok(
  test.rejects($$INSERT INTO "Division" (name, "order", "competitionId", "teamSize", "menCount")
                 VALUES ('Negative', 2, 930001, 4, -1)$$),
  'menCount cannot be negative'
);

INSERT INTO "Division" (id, name, "order", "competitionId", "teamSize", "menCount", "womenCount") VALUES
  (930002, 'Team 2M/2F', 2, 930001, 4, 2, 2);

INSERT INTO "Athlete" (id, name, "competitionId", "divisionId", gender) VALUES
  (930001, 'Solo', 930001, 930001, 'female'),
  (930002, 'The Team', 930001, 930002, NULL),
  (930003, 'Empty Team', 930001, 930002, NULL);

SELECT test.ok(
  test.rejects($$INSERT INTO "Athlete" (name, "competitionId", gender)
                 VALUES ('Bad', 930001, 'other')$$),
  'Athlete gender is male, female or blank'
);

INSERT INTO "TeamMember" ("athleteId", name, gender, "order") VALUES
  (930002, 'A', 'male', 0),
  (930002, 'B', 'female', 1),
  (930002, 'C', NULL, 2);

SELECT test.ok(
  test.rejects($$INSERT INTO "TeamMember" ("athleteId", name, gender)
                 VALUES (930002, 'D', 'x')$$),
  'TeamMember gender is male, female or blank'
);

SELECT test.ok(
  (SELECT count(*) = 0 FROM "TeamMember" WHERE "athleteId" = 930003),
  'a team with no members is a valid row'
);

DELETE FROM "Athlete" WHERE id = 930002;

SELECT test.ok(
  (SELECT count(*) = 0 FROM "TeamMember" WHERE "athleteId" = 930002),
  'deleting a team deletes its members'
);
