-- Add reply_to column for message threading
ALTER TABLE public.project_messages 
ADD COLUMN reply_to UUID REFERENCES public.project_messages(id) ON DELETE SET NULL;

-- Create index for faster reply lookups
CREATE INDEX idx_project_messages_reply_to ON public.project_messages(reply_to) WHERE reply_to IS NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.project_messages.reply_to IS 'References parent message for thread/reply functionality';