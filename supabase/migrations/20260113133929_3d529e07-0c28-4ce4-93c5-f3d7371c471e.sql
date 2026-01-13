-- Add short_id columns for URL-friendly short identifiers
-- Groups: 8-character alphanumeric ID
-- Tasks: 8-character alphanumeric ID
-- Update share_token generation to 12 characters (shorter but still secure)

-- Function to generate short alphanumeric ID (8 chars, URL-safe)
CREATE OR REPLACE FUNCTION public.generate_short_id(length integer DEFAULT 8)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Add short_id column to groups table
ALTER TABLE public.groups 
ADD COLUMN IF NOT EXISTS short_id text UNIQUE;

-- Add short_id column to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS short_id text UNIQUE;

-- Generate short_ids for existing groups
UPDATE public.groups 
SET short_id = public.generate_short_id(8) 
WHERE short_id IS NULL;

-- Generate short_ids for existing tasks
UPDATE public.tasks 
SET short_id = public.generate_short_id(8) 
WHERE short_id IS NULL;

-- Make short_id NOT NULL after populating existing records
ALTER TABLE public.groups 
ALTER COLUMN short_id SET NOT NULL,
ALTER COLUMN short_id SET DEFAULT public.generate_short_id(8);

ALTER TABLE public.tasks 
ALTER COLUMN short_id SET NOT NULL,
ALTER COLUMN short_id SET DEFAULT public.generate_short_id(8);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_groups_short_id ON public.groups(short_id);
CREATE INDEX IF NOT EXISTS idx_tasks_short_id ON public.tasks(short_id);

-- Update share token generation to produce shorter tokens (12 chars instead of 32)
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Generate 12-character alphanumeric token (URL-friendly)
  RETURN public.generate_short_id(12);
END;
$$;

-- Shorten existing share_tokens to 12 characters for consistency
UPDATE public.groups
SET share_token = public.generate_short_id(12)
WHERE share_token IS NOT NULL AND length(share_token) > 12;