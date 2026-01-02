-- Create feedbacks table for main posts
CREATE TABLE public.feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create feedback_comments table for replies
CREATE TABLE public.feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedbacks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_feedbacks_created_at ON public.feedbacks(created_at DESC);
CREATE INDEX idx_feedback_comments_feedback_id ON public.feedback_comments(feedback_id);

-- RLS Policies for feedbacks
-- All authenticated users can view non-hidden feedbacks (or admin can see all)
CREATE POLICY "Users can view feedbacks"
ON public.feedbacks
FOR SELECT
USING (
  (is_hidden = false) OR 
  (user_id = auth.uid()) OR 
  is_admin(auth.uid())
);

-- All authenticated users can create feedbacks
CREATE POLICY "Users can create feedbacks"
ON public.feedbacks
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own feedbacks
CREATE POLICY "Users can update own feedbacks"
ON public.feedbacks
FOR UPDATE
USING (user_id = auth.uid());

-- Admin can update any feedback (for hiding)
CREATE POLICY "Admin can update any feedback"
ON public.feedbacks
FOR UPDATE
USING (is_admin(auth.uid()));

-- Users can delete their own feedbacks
CREATE POLICY "Users can delete own feedbacks"
ON public.feedbacks
FOR DELETE
USING (user_id = auth.uid());

-- Admin can delete any feedback
CREATE POLICY "Admin can delete any feedback"
ON public.feedbacks
FOR DELETE
USING (is_admin(auth.uid()));

-- RLS Policies for feedback_comments
CREATE POLICY "Users can view comments"
ON public.feedback_comments
FOR SELECT
USING (
  (is_hidden = false) OR 
  (user_id = auth.uid()) OR 
  is_admin(auth.uid())
);

CREATE POLICY "Users can create comments"
ON public.feedback_comments
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own comments"
ON public.feedback_comments
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Admin can update any comment"
ON public.feedback_comments
FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Users can delete own comments"
ON public.feedback_comments
FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Admin can delete any comment"
ON public.feedback_comments
FOR DELETE
USING (is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_feedbacks_updated_at
BEFORE UPDATE ON public.feedbacks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_feedback_comments_updated_at
BEFORE UPDATE ON public.feedback_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();