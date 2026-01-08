-- Create task_notes table for storing note versions per task
CREATE TABLE public.task_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL DEFAULT 'Phiên bản 1',
  content TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;

-- Create policies - all group members can view and edit notes
CREATE POLICY "Group members can view task notes"
ON public.task_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.group_members gm ON gm.group_id = t.group_id
    WHERE t.id = task_notes.task_id AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Group members can create task notes"
ON public.task_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.group_members gm ON gm.group_id = t.group_id
    WHERE t.id = task_notes.task_id AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Group members can update task notes"
ON public.task_notes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.group_members gm ON gm.group_id = t.group_id
    WHERE t.id = task_notes.task_id AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Group members can delete task notes"
ON public.task_notes
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.group_members gm ON gm.group_id = t.group_id
    WHERE t.id = task_notes.task_id AND gm.user_id = auth.uid()
  )
);

-- Create task_note_attachments table for file attachments in notes
CREATE TABLE public.task_note_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES public.task_notes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  storage_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_note_attachments ENABLE ROW LEVEL SECURITY;

-- Policies for attachments
CREATE POLICY "Group members can view note attachments"
ON public.task_note_attachments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.task_notes tn
    JOIN public.tasks t ON t.id = tn.task_id
    JOIN public.group_members gm ON gm.group_id = t.group_id
    WHERE tn.id = task_note_attachments.note_id AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Group members can create note attachments"
ON public.task_note_attachments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.task_notes tn
    JOIN public.tasks t ON t.id = tn.task_id
    JOIN public.group_members gm ON gm.group_id = t.group_id
    WHERE tn.id = task_note_attachments.note_id AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Group members can delete note attachments"
ON public.task_note_attachments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.task_notes tn
    JOIN public.tasks t ON t.id = tn.task_id
    JOIN public.group_members gm ON gm.group_id = t.group_id
    WHERE tn.id = task_note_attachments.note_id AND gm.user_id = auth.uid()
  )
);

-- Create storage bucket for note attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('task-note-attachments', 'task-note-attachments', true, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can view note attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-note-attachments');

CREATE POLICY "Authenticated users can upload note attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'task-note-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete own note attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'task-note-attachments' AND auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_task_notes_updated_at
BEFORE UPDATE ON public.task_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();