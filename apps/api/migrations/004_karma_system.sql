-- Phase 4.2: Karma system
-- increment_karma RPC for atomic karma updates
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION increment_karma(user_id_input uuid, delta integer)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET karma = GREATEST(karma + delta, 0)  -- karma cannot go below 0
  WHERE id = user_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
