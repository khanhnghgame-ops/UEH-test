-- Add extended_deadline column to tasks table for deadline extension feature
ALTER TABLE public.tasks 
ADD COLUMN extended_deadline TIMESTAMP WITH TIME ZONE NULL;

-- Add extended_at and extended_by columns to track who extended the deadline
ALTER TABLE public.tasks 
ADD COLUMN extended_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN extended_by UUID NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tasks.extended_deadline IS 'Extended deadline - not replacing original, but giving extra time';
COMMENT ON COLUMN public.tasks.extended_at IS 'When the deadline was extended';
COMMENT ON COLUMN public.tasks.extended_by IS 'User who extended the deadline';