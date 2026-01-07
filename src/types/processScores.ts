// Types for Process Scores (Điểm quá trình) feature

export type AppealStatus = 'pending' | 'approved' | 'rejected';
export type AppealType = 'task' | 'stage' | 'final';
export type AdjustmentType = 'task' | 'stage' | 'final';

export interface TaskScore {
  id: string;
  task_id: string;
  user_id: string;
  base_score: number;
  adjustment: number;
  adjustment_reason: string | null;
  adjusted_by: string | null;
  adjusted_at: string | null;
  final_score: number;
  created_at: string;
  updated_at: string;
  // Joined data
  tasks?: {
    id: string;
    title: string;
    stage_id: string | null;
    status: string;
    deadline: string | null;
  };
  profiles?: {
    id: string;
    full_name: string;
    student_id: string;
  };
  adjuster?: {
    id: string;
    full_name: string;
  };
}

export interface StageWeight {
  id: string;
  stage_id: string;
  weight: number;
  created_at: string;
  updated_at: string;
  stages?: {
    id: string;
    name: string;
    order_index: number;
  };
}

export interface MemberStageScore {
  id: string;
  stage_id: string;
  user_id: string;
  average_score: number | null;
  adjustment: number;
  adjustment_reason: string | null;
  adjusted_by: string | null;
  adjusted_at: string | null;
  final_stage_score: number | null;
  created_at: string;
  updated_at: string;
  // Joined data
  stages?: {
    id: string;
    name: string;
    order_index: number;
  };
  profiles?: {
    id: string;
    full_name: string;
    student_id: string;
  };
  adjuster?: {
    id: string;
    full_name: string;
  };
}

export interface MemberFinalScore {
  id: string;
  group_id: string;
  user_id: string;
  calculated_score: number;
  adjustment: number;
  adjustment_reason: string | null;
  adjusted_by: string | null;
  adjusted_at: string | null;
  final_score: number;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: {
    id: string;
    full_name: string;
    student_id: string;
  };
  adjuster?: {
    id: string;
    full_name: string;
  };
}

export interface ScoreAppeal {
  id: string;
  user_id: string;
  appeal_type: AppealType;
  task_score_id: string | null;
  stage_score_id: string | null;
  final_score_id: string | null;
  content: string;
  status: AppealStatus;
  response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: {
    id: string;
    full_name: string;
    student_id: string;
  };
  responder?: {
    id: string;
    full_name: string;
  };
  attachments?: AppealAttachment[];
}

export interface AppealAttachment {
  id: string;
  appeal_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string | null;
  created_at: string;
}

export interface ScoreAdjustmentHistory {
  id: string;
  adjustment_type: AdjustmentType;
  task_score_id: string | null;
  stage_score_id: string | null;
  final_score_id: string | null;
  user_id: string;
  previous_score: number | null;
  new_score: number | null;
  adjustment: number;
  reason: string;
  adjusted_by: string;
  created_at: string;
  // Joined data
  profiles?: {
    id: string;
    full_name: string;
  };
  adjuster?: {
    id: string;
    full_name: string;
  };
}

// Helper type for displaying scores in UI
export interface MemberScoreSummary {
  userId: string;
  profile: {
    id: string;
    full_name: string;
    student_id: string;
    avatar_url?: string | null;
  };
  taskScores: TaskScore[];
  stageScores: MemberStageScore[];
  finalScore: MemberFinalScore | null;
  pendingAppeals: number;
}
