-- Create project_messages table for project chat
CREATE TABLE public.project_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'direct' CHECK (source_type IN ('direct', 'from_task')),
  source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  source_comment_id UUID,
  is_read_by JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create task_comments table for in-task discussion
CREATE TABLE public.task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create message_mentions table for tracking @mentions and #task references
CREATE TABLE public.message_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.project_messages(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.task_comments(id) ON DELETE CASCADE,
  mention_type TEXT NOT NULL CHECK (mention_type IN ('user', 'assignee', 'task')),
  mentioned_user_id UUID,
  mentioned_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT mention_source_check CHECK (
    (message_id IS NOT NULL AND comment_id IS NULL) OR 
    (message_id IS NULL AND comment_id IS NOT NULL)
  )
);

-- Add foreign key for source_comment_id
ALTER TABLE public.project_messages 
ADD CONSTRAINT project_messages_source_comment_id_fkey 
FOREIGN KEY (source_comment_id) REFERENCES public.task_comments(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_project_messages_group_id ON public.project_messages(group_id);
CREATE INDEX idx_project_messages_user_id ON public.project_messages(user_id);
CREATE INDEX idx_project_messages_created_at ON public.project_messages(created_at DESC);
CREATE INDEX idx_task_comments_task_id ON public.task_comments(task_id);
CREATE INDEX idx_task_comments_user_id ON public.task_comments(user_id);
CREATE INDEX idx_message_mentions_message_id ON public.message_mentions(message_id);
CREATE INDEX idx_message_mentions_comment_id ON public.message_mentions(comment_id);
CREATE INDEX idx_message_mentions_mentioned_user_id ON public.message_mentions(mentioned_user_id);
CREATE INDEX idx_message_mentions_is_read ON public.message_mentions(is_read);

-- Enable RLS
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_mentions ENABLE ROW LEVEL SECURITY;

-- RLS policies for project_messages
CREATE POLICY "Group members can view project messages" 
ON public.project_messages 
FOR SELECT 
USING (public.is_group_member(auth.uid(), group_id) OR public.is_admin(auth.uid()));

CREATE POLICY "Group members can insert project messages" 
ON public.project_messages 
FOR INSERT 
WITH CHECK (public.is_group_member(auth.uid(), group_id) AND auth.uid() = user_id);

CREATE POLICY "Message authors can update their messages" 
ON public.project_messages 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Message authors can delete their messages" 
ON public.project_messages 
FOR DELETE 
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- RLS policies for task_comments
CREATE POLICY "Group members can view task comments" 
ON public.task_comments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id 
    AND (public.is_group_member(auth.uid(), t.group_id) OR public.is_admin(auth.uid()))
  )
);

CREATE POLICY "Group members can insert task comments" 
ON public.task_comments 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id 
    AND public.is_group_member(auth.uid(), t.group_id)
  )
);

CREATE POLICY "Comment authors can update their comments" 
ON public.task_comments 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Comment authors or admins can delete comments" 
ON public.task_comments 
FOR DELETE 
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- RLS policies for message_mentions
CREATE POLICY "Users can view their mentions" 
ON public.message_mentions 
FOR SELECT 
USING (
  mentioned_user_id = auth.uid() OR 
  public.is_admin(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.project_messages pm 
    WHERE pm.id = message_id AND pm.user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.task_comments tc 
    WHERE tc.id = comment_id AND tc.user_id = auth.uid()
  )
);

CREATE POLICY "Message/comment authors can insert mentions" 
ON public.message_mentions 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_messages pm 
    WHERE pm.id = message_id AND pm.user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.task_comments tc 
    WHERE tc.id = comment_id AND tc.user_id = auth.uid()
  )
);

CREATE POLICY "Mentioned users can update their mention status" 
ON public.message_mentions 
FOR UPDATE 
USING (mentioned_user_id = auth.uid());

-- Create trigger for updated_at
CREATE TRIGGER update_project_messages_updated_at
BEFORE UPDATE ON public.project_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_task_comments_updated_at
BEFORE UPDATE ON public.task_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_mentions;