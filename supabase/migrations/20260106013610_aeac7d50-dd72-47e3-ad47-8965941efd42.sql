-- Add is_restored flag to tasks table to distinguish restored tasks from new ones
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_restored boolean NOT NULL DEFAULT false;

-- Update the notify_task_assigned trigger function to skip notifications for restored tasks
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_record RECORD;
  group_record RECORD;
BEGIN
  -- Get task details
  SELECT t.*, g.name as group_name 
  INTO task_record
  FROM public.tasks t
  JOIN public.groups g ON t.group_id = g.id
  WHERE t.id = NEW.task_id;
  
  -- Skip notification if task is restored (not a new task)
  IF task_record.is_restored = true THEN
    RETURN NEW;
  END IF;
  
  -- Insert notification for assigned user
  INSERT INTO public.notifications (user_id, type, title, message, task_id, group_id)
  VALUES (
    NEW.user_id,
    'task_assigned',
    'Task mới được giao',
    'Bạn được giao task "' || task_record.title || '" trong project "' || task_record.group_name || '"',
    NEW.task_id,
    task_record.group_id
  );
  
  RETURN NEW;
END;
$$;