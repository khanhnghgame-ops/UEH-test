
-- =============================================
-- ĐIỂM QUÁ TRÌNH (Process Score) System
-- =============================================

-- 1. Bảng trọng số giai đoạn
CREATE TABLE public.stage_weights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(stage_id)
);

-- 2. Bảng điểm task của thành viên (mở rộng từ task_scores hiện có)
-- Thêm cột adjustment và reason
ALTER TABLE public.task_scores 
ADD COLUMN IF NOT EXISTS adjustment NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
ADD COLUMN IF NOT EXISTS adjusted_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS adjusted_at TIMESTAMP WITH TIME ZONE;

-- 3. Bảng điểm giai đoạn - thêm cột adjustment
ALTER TABLE public.member_stage_scores
ADD COLUMN IF NOT EXISTS adjustment NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
ADD COLUMN IF NOT EXISTS adjusted_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS adjusted_at TIMESTAMP WITH TIME ZONE;

-- 4. Bảng điểm quá trình cuối cùng
CREATE TABLE public.member_final_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calculated_score NUMERIC DEFAULT 100,
  adjustment NUMERIC DEFAULT 0,
  adjustment_reason TEXT,
  adjusted_by UUID REFERENCES auth.users(id),
  adjusted_at TIMESTAMP WITH TIME ZONE,
  final_score NUMERIC DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- 5. Bảng phúc khảo (Appeals)
CREATE TABLE public.score_appeals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appeal_type TEXT NOT NULL CHECK (appeal_type IN ('task', 'stage', 'final')),
  task_score_id UUID REFERENCES public.task_scores(id) ON DELETE CASCADE,
  stage_score_id UUID REFERENCES public.member_stage_scores(id) ON DELETE CASCADE,
  final_score_id UUID REFERENCES public.member_final_scores(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  response TEXT,
  responded_by UUID REFERENCES auth.users(id),
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Bảng file minh chứng phúc khảo
CREATE TABLE public.appeal_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appeal_id UUID NOT NULL REFERENCES public.score_appeals(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Bảng lịch sử điều chỉnh điểm
CREATE TABLE public.score_adjustment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('task', 'stage', 'final')),
  task_score_id UUID REFERENCES public.task_scores(id) ON DELETE CASCADE,
  stage_score_id UUID REFERENCES public.member_stage_scores(id) ON DELETE CASCADE,
  final_score_id UUID REFERENCES public.member_final_scores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_score NUMERIC,
  new_score NUMERIC,
  adjustment NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stage_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_final_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appeal_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_adjustment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for stage_weights
CREATE POLICY "Group members can view stage weights"
ON public.stage_weights FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stages s
    WHERE s.id = stage_weights.stage_id
    AND is_group_member(auth.uid(), s.group_id)
  ) OR is_admin(auth.uid())
);

CREATE POLICY "Leaders can manage stage weights"
ON public.stage_weights FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stages s
    WHERE s.id = stage_weights.stage_id
    AND is_group_leader(auth.uid(), s.group_id)
  )
);

-- RLS Policies for member_final_scores
CREATE POLICY "Members can view own final scores"
ON public.member_final_scores FOR SELECT
USING (
  user_id = auth.uid() OR 
  is_group_leader(auth.uid(), group_id) OR 
  is_admin(auth.uid())
);

CREATE POLICY "Leaders can manage final scores"
ON public.member_final_scores FOR ALL
USING (is_group_leader(auth.uid(), group_id));

-- RLS Policies for score_appeals
CREATE POLICY "Users can view own appeals"
ON public.score_appeals FOR SELECT
USING (
  user_id = auth.uid() OR 
  is_admin(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM task_scores ts
    JOIN tasks t ON ts.task_id = t.id
    WHERE ts.id = score_appeals.task_score_id
    AND is_group_leader(auth.uid(), t.group_id)
  ) OR
  EXISTS (
    SELECT 1 FROM member_stage_scores mss
    JOIN stages s ON mss.stage_id = s.id
    WHERE mss.id = score_appeals.stage_score_id
    AND is_group_leader(auth.uid(), s.group_id)
  ) OR
  EXISTS (
    SELECT 1 FROM member_final_scores mfs
    WHERE mfs.id = score_appeals.final_score_id
    AND is_group_leader(auth.uid(), mfs.group_id)
  )
);

CREATE POLICY "Users can create own appeals"
ON public.score_appeals FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Leaders can update appeals"
ON public.score_appeals FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM task_scores ts
    JOIN tasks t ON ts.task_id = t.id
    WHERE ts.id = score_appeals.task_score_id
    AND is_group_leader(auth.uid(), t.group_id)
  ) OR
  EXISTS (
    SELECT 1 FROM member_stage_scores mss
    JOIN stages s ON mss.stage_id = s.id
    WHERE mss.id = score_appeals.stage_score_id
    AND is_group_leader(auth.uid(), s.group_id)
  ) OR
  EXISTS (
    SELECT 1 FROM member_final_scores mfs
    WHERE mfs.id = score_appeals.final_score_id
    AND is_group_leader(auth.uid(), mfs.group_id)
  )
);

-- RLS Policies for appeal_attachments
CREATE POLICY "Users can view attachments of visible appeals"
ON public.appeal_attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM score_appeals sa
    WHERE sa.id = appeal_attachments.appeal_id
    AND (
      sa.user_id = auth.uid() OR
      is_admin(auth.uid()) OR
      EXISTS (
        SELECT 1 FROM task_scores ts
        JOIN tasks t ON ts.task_id = t.id
        WHERE ts.id = sa.task_score_id
        AND is_group_leader(auth.uid(), t.group_id)
      )
    )
  )
);

CREATE POLICY "Users can add attachments to own appeals"
ON public.appeal_attachments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM score_appeals sa
    WHERE sa.id = appeal_attachments.appeal_id
    AND sa.user_id = auth.uid()
  )
);

-- RLS Policies for score_adjustment_history
CREATE POLICY "Users can view own adjustment history"
ON public.score_adjustment_history FOR SELECT
USING (
  user_id = auth.uid() OR 
  is_admin(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM task_scores ts
    JOIN tasks t ON ts.task_id = t.id
    WHERE ts.id = score_adjustment_history.task_score_id
    AND is_group_leader(auth.uid(), t.group_id)
  ) OR
  EXISTS (
    SELECT 1 FROM member_stage_scores mss
    JOIN stages s ON mss.stage_id = s.id
    WHERE mss.id = score_adjustment_history.stage_score_id
    AND is_group_leader(auth.uid(), s.group_id)
  ) OR
  EXISTS (
    SELECT 1 FROM member_final_scores mfs
    WHERE mfs.id = score_adjustment_history.final_score_id
    AND is_group_leader(auth.uid(), mfs.group_id)
  )
);

CREATE POLICY "Leaders can insert adjustment history"
ON public.score_adjustment_history FOR INSERT
WITH CHECK (adjusted_by = auth.uid());

-- Create storage bucket for appeal attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('appeal-attachments', 'appeal-attachments', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for appeal attachments
CREATE POLICY "Users can upload appeal attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'appeal-attachments' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view own appeal attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'appeal-attachments' AND
  auth.uid() IS NOT NULL
);

-- Triggers for updated_at
CREATE TRIGGER update_stage_weights_updated_at
BEFORE UPDATE ON public.stage_weights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_member_final_scores_updated_at
BEFORE UPDATE ON public.member_final_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_score_appeals_updated_at
BEFORE UPDATE ON public.score_appeals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
