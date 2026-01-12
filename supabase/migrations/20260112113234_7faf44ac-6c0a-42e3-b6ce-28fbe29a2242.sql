-- Drop existing incorrect policies for project-images bucket
DROP POLICY IF EXISTS "Group leaders can upload project images" ON storage.objects;
DROP POLICY IF EXISTS "Group leaders can update project images" ON storage.objects;
DROP POLICY IF EXISTS "Group leaders can delete project images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view project images" ON storage.objects;

-- Recreate policies with correct reference to objects.name instead of g.name
CREATE POLICY "Anyone can view project images"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-images');

CREATE POLICY "Group leaders can upload project images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-images' 
  AND EXISTS (
    SELECT 1 FROM groups g
    WHERE (g.id)::text = (storage.foldername(objects.name))[1]
    AND is_group_leader(g.id, auth.uid())
  )
);

CREATE POLICY "Group leaders can update project images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'project-images'
  AND EXISTS (
    SELECT 1 FROM groups g
    WHERE (g.id)::text = (storage.foldername(objects.name))[1]
    AND is_group_leader(g.id, auth.uid())
  )
);

CREATE POLICY "Group leaders can delete project images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-images'
  AND EXISTS (
    SELECT 1 FROM groups g
    WHERE (g.id)::text = (storage.foldername(objects.name))[1]
    AND is_group_leader(g.id, auth.uid())
  )
);