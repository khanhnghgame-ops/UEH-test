-- Fix overly-permissive INSERT policy on public.notifications (WITH CHECK true)
-- Goal: prevent arbitrary notification injection while keeping legitimate leader/system notifications.

DROP POLICY IF EXISTS "Authenticated users can receive notifications" ON public.notifications;

-- Tighten existing policies to authenticated role (optional hardening)
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow INSERT only when:
-- - user inserts a notification to themselves, OR
-- - user is leader/admin of the group and the target user is a member of that group
CREATE POLICY "Leaders can send group notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR (
    group_id IS NOT NULL
    AND public.is_group_leader(auth.uid(), group_id)
    AND public.is_group_member(user_id, group_id)
  )
);
