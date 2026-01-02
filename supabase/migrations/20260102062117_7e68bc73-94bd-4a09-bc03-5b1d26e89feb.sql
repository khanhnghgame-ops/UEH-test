-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task_assigned', 'task_deadline', 'task_updated')),
  title TEXT NOT NULL,
  message TEXT,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- System can insert notifications (using service role or triggers)
CREATE POLICY "Authenticated users can receive notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);

-- Function to create notification when task is assigned
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

-- Trigger for task assignment notifications
CREATE TRIGGER on_task_assigned
AFTER INSERT ON public.task_assignments
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_assigned();

-- Function to auto-delete old notifications (older than 1 month)
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < now() - INTERVAL '1 month';
END;
$$;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;