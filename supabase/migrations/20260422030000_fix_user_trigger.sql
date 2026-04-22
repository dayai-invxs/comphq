-- The handle_new_auth_user trigger still inserted (id, role) — but the
-- previous migration dropped the role column. Auth.users inserts have
-- been failing with "Database error creating new user" ever since.
--
-- This migration updates the trigger to insert (id) only; isSuper
-- defaults to false via the column DEFAULT.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."UserProfile" (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
