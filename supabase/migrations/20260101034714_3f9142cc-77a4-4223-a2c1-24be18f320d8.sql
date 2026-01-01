-- Drop the old restrictive policy first
DROP POLICY IF EXISTS "Assignees can insert submissions" ON public.submission_history;

-- Create new policy allowing leaders and admins to insert submissions on behalf of assignees
CREATE POLICY "Leaders and admins can insert submissions"
ON public.submission_history
FOR INSERT
WITH CHECK (
  -- Either the user is submitting for themselves and is an assignee
  ((user_id = auth.uid()) AND is_task_assignee(auth.uid(), task_id))
  OR
  -- Or the user is a leader of the task's group
  (EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_id AND is_group_leader(auth.uid(), t.group_id)
  ))
  OR
  -- Or the user is an admin
  is_admin(auth.uid())
);