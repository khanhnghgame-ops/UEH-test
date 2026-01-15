-- Add policies for public access to task_notes for shared groups
-- This allows notes to be created/updated/viewed without authentication for public projects

-- Policy for public INSERT on task_notes
CREATE POLICY "Public can create notes for shared group tasks"
ON public.task_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN groups g ON t.group_id = g.id
    WHERE t.id = task_notes.task_id
    AND g.is_public = true
    AND g.share_token IS NOT NULL
  )
);

-- Policy for public UPDATE on task_notes  
CREATE POLICY "Public can update notes for shared group tasks"
ON public.task_notes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN groups g ON t.group_id = g.id
    WHERE t.id = task_notes.task_id
    AND g.is_public = true
    AND g.share_token IS NOT NULL
  )
);

-- Policy for public SELECT on task_notes
CREATE POLICY "Public can view notes for shared group tasks"
ON public.task_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN groups g ON t.group_id = g.id
    WHERE t.id = task_notes.task_id
    AND g.is_public = true
    AND g.share_token IS NOT NULL
  )
);

-- Policy for public DELETE on task_notes
CREATE POLICY "Public can delete notes for shared group tasks"
ON public.task_notes
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN groups g ON t.group_id = g.id
    WHERE t.id = task_notes.task_id
    AND g.is_public = true
    AND g.share_token IS NOT NULL
  )
);

-- Also add policies for task_note_attachments for public access
CREATE POLICY "Public can create attachments for shared group tasks"
ON public.task_note_attachments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM task_notes tn
    JOIN tasks t ON tn.task_id = t.id
    JOIN groups g ON t.group_id = g.id
    WHERE tn.id = task_note_attachments.note_id
    AND g.is_public = true
    AND g.share_token IS NOT NULL
  )
);

CREATE POLICY "Public can view attachments for shared group tasks"
ON public.task_note_attachments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM task_notes tn
    JOIN tasks t ON tn.task_id = t.id
    JOIN groups g ON t.group_id = g.id
    WHERE tn.id = task_note_attachments.note_id
    AND g.is_public = true
    AND g.share_token IS NOT NULL
  )
);

CREATE POLICY "Public can delete attachments for shared group tasks"
ON public.task_note_attachments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM task_notes tn
    JOIN tasks t ON tn.task_id = t.id
    JOIN groups g ON t.group_id = g.id
    WHERE tn.id = task_note_attachments.note_id
    AND g.is_public = true
    AND g.share_token IS NOT NULL
  )
);