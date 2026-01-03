-- Drop the old constraint that only allows 'link' or 'file'
ALTER TABLE public.submission_history 
DROP CONSTRAINT IF EXISTS submission_history_submission_type_check;

-- Add new constraint that also allows 'mixed' for link + file submissions
ALTER TABLE public.submission_history 
ADD CONSTRAINT submission_history_submission_type_check 
CHECK (submission_type = ANY (ARRAY['link'::text, 'file'::text, 'mixed'::text]));