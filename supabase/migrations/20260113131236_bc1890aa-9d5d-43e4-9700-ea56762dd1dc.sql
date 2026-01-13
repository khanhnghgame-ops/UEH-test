-- Fix RLS policies for bucket: project-images (storage.objects)
-- Root cause: existing policies incorrectly use storage.foldername(g.name) (group name) instead of storage.objects.name (file path), causing INSERT to fail with "new row violates row-level security policy".

-- Drop incorrect policies
DROP POLICY IF EXISTS "Group leaders can upload project images" ON storage.objects;
DROP POLICY IF EXISTS "Group leaders can update project images" ON storage.objects;
DROP POLICY IF EXISTS "Group leaders can delete project images" ON storage.objects;

-- Recreate policies (restricted to authenticated users; still checks leader/admin rights)
-- Assumes object path format: {group_id}/{filename}

CREATE POLICY "Group leaders can upload project images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-images'
  AND public.is_group_leader(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Group leaders can update project images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-images'
  AND public.is_group_leader(auth.uid(), (storage.foldername(name))[1]::uuid)
)
WITH CHECK (
  bucket_id = 'project-images'
  AND public.is_group_leader(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Group leaders can delete project images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-images'
  AND public.is_group_leader(auth.uid(), (storage.foldername(name))[1]::uuid)
);
