-- Add is_hidden column to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Add is_hidden column to stages table
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_tasks_is_hidden ON public.tasks(is_hidden);
CREATE INDEX IF NOT EXISTS idx_stages_is_hidden ON public.stages(is_hidden);