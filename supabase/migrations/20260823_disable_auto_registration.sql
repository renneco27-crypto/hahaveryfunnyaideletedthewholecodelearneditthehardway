-- Disable automatic creation of profiles for unknown Google accounts
-- Only pre-registered profiles in the 'profiles' table will be granted access

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
