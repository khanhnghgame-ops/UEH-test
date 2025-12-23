-- Allow admin to update any profile
CREATE POLICY "Admin can update any profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));