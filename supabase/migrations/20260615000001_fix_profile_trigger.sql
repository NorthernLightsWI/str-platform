-- Recreate handle_new_user with SET search_path (required for SECURITY DEFINER
-- functions in Supabase) and first-user-is-admin logic.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  assigned_role TEXT;
BEGIN
  SELECT CASE WHEN COUNT(*) = 0 THEN 'admin' ELSE 'cleaner' END
  INTO assigned_role
  FROM public.profiles;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    assigned_role
  );

  RETURN NEW;
END;
$$;
