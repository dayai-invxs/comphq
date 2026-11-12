-- A workout's printable judge's score card, as data: the parts, movements and
-- box layout the print page draws every card from (see
-- supabase/functions/_shared/scoreCard.ts). Written by hand in the score card
-- editor for now, by an AI later. Null prints a plain card with the score
-- boxes the workout's score type needs.
ALTER TABLE "Workout" ADD COLUMN "scoreCard" jsonb;
