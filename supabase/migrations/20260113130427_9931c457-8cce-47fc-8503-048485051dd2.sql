-- Drop existing incorrect policies
DROP POLICY IF EXISTS "Group leaders can upload project images" ON storage.objects;
DROP POLICY IF EXISTS "Group leaders can update project images" ON storage.objects;
DROP POLICY IF EXISTS "Group leaders can delete project images" ON storage.objects;

-- Recreate policies with correct syntax:
-- 1. Use storage.foldername(name) where 'name' is the column from storage.objects
-- 2. Fix is_group_leader parameter order: (user_id, group_id) not (group_id, user_id)

CREATE POLICY "Group leaders can upload project images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'project-images' 
  AND EXISTS (
    SELECT 1 FROM groups g 
    WHERE g.id::text = (storage.foldername(name))[1]
    AND is_group_leader(auth.uid(), g.id)
  )
);

CREATE POLICY "Group leaders can update project images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'project-images' 
  AND EXISTS (
    SELECT 1 FROM groups g 
    WHERE g.id::text = (storage.foldername(name))[1]
    AND is_group_leader(auth.uid(), g.id)
  )
);

CREATE POLICY "Group leaders can delete project images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'project-images' 
  AND EXISTS (
    SELECT 1 FROM groups g 
    WHERE g.id::text = (storage.foldername(name))[1]
    AND is_group_leader(auth.uid(), g.id)
  )
);