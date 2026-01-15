export type AppRole = 'admin' | 'leader' | 'member';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'VERIFIED';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  student_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  is_approved: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  // Extended profile fields
  year_batch: string | null;
  major: string | null;
  phone: string | null;
  skills: string | null;
  bio: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Group {
  id: string;
  short_id: string;
  slug: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  image_url?: string | null;
  class_code?: string | null;
  instructor_name?: string | null;
  instructor_email?: string | null;
  zalo_link?: string | null;
  additional_info?: string | null;
  is_public?: boolean;
  share_token?: string | null;
  show_activity_public?: boolean;
  show_members_public?: boolean;
  leader_id?: string | null;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: AppRole;
  joined_at: string;
  profiles?: Profile;
}

export interface Task {
  id: string;
  short_id: string;
  slug: string;
  group_id: string;
  stage_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  deadline: string | null;
  submission_link: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  task_assignments?: TaskAssignment[];
  groups?: Group;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  user_id: string;
  assigned_at: string;
  profiles?: Profile;
}

export interface PendingApproval {
  id: string;
  user_id: string;
  group_id: string;
  status: ApprovalStatus;
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
  profiles?: Profile;
  groups?: Group;
}

export interface Stage {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  order_index: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}
