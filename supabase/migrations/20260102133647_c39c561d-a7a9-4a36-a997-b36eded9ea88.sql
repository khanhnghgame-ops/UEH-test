-- Add sharing fields to groups table
ALTER TABLE public.groups 
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
ADD COLUMN IF NOT EXISTS show_members_public boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS show_activity_public boolean NOT NULL DEFAULT true;

-- Create function to generate share token
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(gen_random_bytes(16), 'hex');
END;
$$;

-- Create RLS policy for public access to groups
CREATE POLICY "Public can view shared groups"
ON public.groups
FOR SELECT
USING (is_public = true AND share_token IS NOT NULL);

-- Create RLS policy for public access to stages of shared groups
CREATE POLICY "Public can view stages of shared groups"
ON public.stages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.groups g 
    WHERE g.id = stages.group_id 
    AND g.is_public = true 
    AND g.share_token IS NOT NULL
  )
);

-- Create RLS policy for public access to tasks of shared groups
CREATE POLICY "Public can view tasks of shared groups"
ON public.tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.groups g 
    WHERE g.id = tasks.group_id 
    AND g.is_public = true 
    AND g.share_token IS NOT NULL
  )
);

-- Create RLS policy for public access to task assignments of shared groups
CREATE POLICY "Public can view assignments of shared groups"
ON public.task_assignments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN groups g ON t.group_id = g.id
    WHERE t.id = task_assignments.task_id 
    AND g.is_public = true 
    AND g.share_token IS NOT NULL
  )
);

-- Create RLS policy for public access to profiles (for assignee names) - only approved profiles
CREATE POLICY "Public can view approved profiles for shared groups"
ON public.profiles
FOR SELECT
USING (is_approved = true);

-- Create RLS policy for public access to group members of shared groups
CREATE POLICY "Public can view members of shared groups"
ON public.group_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.groups g 
    WHERE g.id = group_members.group_id 
    AND g.is_public = true 
    AND g.share_token IS NOT NULL
    AND g.show_members_public = true
  )
);

-- Create RLS policy for public access to activity logs of shared groups
CREATE POLICY "Public can view activity of shared groups"
ON public.activity_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.groups g 
    WHERE g.id = activity_logs.group_id 
    AND g.is_public = true 
    AND g.share_token IS NOT NULL
    AND g.show_activity_public = true
  )
);