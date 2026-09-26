-- Supabase platform objects that the migrations assume already exist.
--
-- On a hosted Supabase project these are provisioned before any user
-- migration runs: the `auth` schema, the three API roles, the realtime
-- publication, and the default privileges that let PostgREST reach tables
-- in `public`. A vanilla Postgres cluster has none of them, so `pnpm
-- test:sql` installs this shim first and the 34 migrations then replay
-- unmodified.
--
-- This file is test scaffolding, not a migration. It is deliberately the
-- minimum surface the migrations touch — `auth.users`, `auth.uid()`,
-- anon/authenticated/service_role, and `supabase_realtime`.

-- ─── API roles ──────────────────────────────────────────────────────────
-- NOINHERIT matches the hosted roles: privileges apply only while SET ROLE
-- is active. service_role carries BYPASSRLS, which is why server code
-- holding the service key sees every row regardless of policy.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Hosted Supabase pre-grants these so that RLS — not a missing GRANT — is
-- what decides access. Without them anon would be refused with a bare
-- "permission denied for table", and the policy under test would never run.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ─── auth schema ────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Only the columns the migrations reference. The hosted table is far
-- wider; widening this one would not make the tests more truthful.
CREATE TABLE IF NOT EXISTS auth.users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT
);

-- Verbatim from the hosted definition: read `sub` out of the request JWT
-- claims GUC. Tests impersonate a user by setting that GUC, which is the
-- same mechanism PostgREST uses.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ─── Realtime publication ───────────────────────────────────────────────
-- 20260421170000_rls_public_read.sql does ALTER PUBLICATION ... ADD TABLE,
-- which needs the publication to exist and to be empty.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
