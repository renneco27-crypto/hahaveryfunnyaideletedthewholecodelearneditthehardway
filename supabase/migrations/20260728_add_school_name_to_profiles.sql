-- Add school_name column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_name TEXT;

-- After running this, manually set each user's school_name via Supabase dashboard:
-- UPDATE profiles SET school_name = 'OCCS' WHERE email = 'renneco27@gmail.com';
-- UPDATE profiles SET school_name = 'Ipil CS' WHERE email = 'maemcortes@gmail.com';
