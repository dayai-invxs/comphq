// One source for the server and the web app: the rules live in
// supabase/functions/_shared/knockout.ts, and this re-exports them. They used to
// be two copies kept equal by a test.
export * from '../../../../supabase/functions/_shared/knockout'
