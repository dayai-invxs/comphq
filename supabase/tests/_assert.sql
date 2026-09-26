-- Assertion + impersonation helpers for the SQL test suite.
--
-- Loaded after the migrations, before any *.test.sql. Kept deliberately
-- small: a pass raises a NOTICE the runner counts, a failure raises an
-- exception that aborts the file.

CREATE SCHEMA IF NOT EXISTS test;

CREATE OR REPLACE FUNCTION test.ok(cond BOOLEAN, name TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN
    RAISE NOTICE 'ok - %', name;
  ELSE
    RAISE EXCEPTION 'not ok - %', name;
  END IF;
END;
$$;

-- ─── Impersonation ──────────────────────────────────────────────────────
-- RESET ROLE first: the API roles are NOINHERIT and cannot SET ROLE to
-- each other, so every switch goes back through the session role.

CREATE OR REPLACE FUNCTION test.as_anon() RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET ROLE anon;
END;
$$;

CREATE OR REPLACE FUNCTION test.as_user(uid UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  SET ROLE authenticated;
END;
$$;

-- The role server routes use. BYPASSRLS, so it stands in for "the API
-- did this with the service key".
CREATE OR REPLACE FUNCTION test.as_service() RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET ROLE service_role;
END;
$$;

-- ─── Statement outcome ──────────────────────────────────────────────────
-- Both "new row violates row-level security policy" and "permission denied
-- for table" are SQLSTATE 42501. v1's integration suite accepted either
-- (`/(row-level security|permission)/`), so these treat them alike.
--
-- The EXCEPTION block opens a subtransaction, so a denied statement rolls
-- back on its own and leaves the caller's transaction usable.

CREATE OR REPLACE FUNCTION test.denied(stmt TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN false;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION test.allowed(stmt TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN true;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN false;
END;
$$;

-- Any error at all, not just a privilege one. For constraint tests, where
-- the expected failure is a unique_violation rather than a policy denial.
CREATE OR REPLACE FUNCTION test.rejects(stmt TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN false;
EXCEPTION
  WHEN others THEN RETURN true;
END;
$$;

-- Row count visible to the *current* role, i.e. after RLS filtering.
CREATE OR REPLACE FUNCTION test.visible(stmt TEXT) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  n BIGINT;
BEGIN
  EXECUTE format('SELECT count(*) FROM (%s) s', stmt) INTO n;
  RETURN n;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN -1;
END;
$$;

GRANT USAGE ON SCHEMA test TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated, service_role;
