-- Create storage bucket for task file submissions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-submissions', 
  'task-submissions', 
  true,
  5242880, -- 5MB limit
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'text/csv', 'application/zip', 'application/x-rar-compressed']
);

-- Create RLS policies for the bucket
CREATE POLICY "Authenticated users can upload task files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-submissions');

CREATE POLICY "Anyone can view task files"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-submissions');

CREATE POLICY "Users can update their own task files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'task-submissions' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own task files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'task-submissions' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add file storage columns to submission_history table
ALTER TABLE public.submission_history
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_size INTEGER,
ADD COLUMN IF NOT EXISTS submission_type TEXT DEFAULT 'link' CHECK (submission_type IN ('link', 'file'));