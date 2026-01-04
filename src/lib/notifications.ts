import { supabase } from '@/integrations/supabase/client';

// Notification types
export type NotificationType = 
  | 'task_assigned'
  | 'task_updated' 
  | 'task_deadline'
  | 'task_verified'
  | 'task_submitted';

interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  taskId?: string;
  groupId?: string;
}

// Send notification to a specific user
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      task_id: payload.taskId || null,
      group_id: payload.groupId || null,
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

// Send notification to multiple users
export async function sendNotifications(userIds: string[], notification: Omit<NotificationPayload, 'userId'>): Promise<void> {
  if (userIds.length === 0) return;
  
  try {
    const notifications = userIds.map(userId => ({
      user_id: userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      task_id: notification.taskId || null,
      group_id: notification.groupId || null,
    }));
    
    await supabase.from('notifications').insert(notifications);
  } catch (error) {
    console.error('Failed to send notifications:', error);
  }
}

// ============ Notification Templates ============

// When a task is created and assigned
export function notifyTaskAssigned(params: {
  assigneeIds: string[];
  leaderName: string;
  taskTitle: string;
  taskId: string;
  groupId: string;
  groupName: string;
  deadline?: string | null;
}): Promise<void> {
  const deadlineText = params.deadline 
    ? ` (deadline: ${new Date(params.deadline).toLocaleDateString('vi-VN')})`
    : '';
  
  return sendNotifications(params.assigneeIds, {
    type: 'task_assigned',
    title: '📋 Task mới được giao',
    message: `${params.leaderName} đã giao cho bạn task "${params.taskTitle}" trong project "${params.groupName}"${deadlineText}`,
    taskId: params.taskId,
    groupId: params.groupId,
  });
}

// When task details are updated (deadline, description, title, etc.)
export function notifyTaskUpdated(params: {
  assigneeIds: string[];
  leaderName: string;
  taskTitle: string;
  taskId: string;
  groupId: string;
  changes: string[]; // e.g. ['deadline', 'mô tả', 'tên task']
}): Promise<void> {
  const changesText = params.changes.length > 0 
    ? params.changes.join(', ')
    : 'thông tin';
  
  return sendNotifications(params.assigneeIds, {
    type: 'task_updated',
    title: '✏️ Task đã được cập nhật',
    message: `${params.leaderName} đã cập nhật ${changesText} của task "${params.taskTitle}"`,
    taskId: params.taskId,
    groupId: params.groupId,
  });
}

// When task assignees are changed
export function notifyTaskAssigneesChanged(params: {
  newAssigneeIds: string[];
  removedAssigneeIds: string[];
  leaderName: string;
  taskTitle: string;
  taskId: string;
  groupId: string;
  groupName: string;
}): Promise<void[]> {
  const promises: Promise<void>[] = [];
  
  // Notify new assignees
  if (params.newAssigneeIds.length > 0) {
    promises.push(sendNotifications(params.newAssigneeIds, {
      type: 'task_assigned',
      title: '📋 Bạn được thêm vào task',
      message: `${params.leaderName} đã thêm bạn vào task "${params.taskTitle}" trong project "${params.groupName}"`,
      taskId: params.taskId,
      groupId: params.groupId,
    }));
  }
  
  // Notify removed assignees
  if (params.removedAssigneeIds.length > 0) {
    promises.push(sendNotifications(params.removedAssigneeIds, {
      type: 'task_updated',
      title: '🔄 Bạn đã được gỡ khỏi task',
      message: `${params.leaderName} đã gỡ bạn khỏi task "${params.taskTitle}"`,
      taskId: params.taskId,
      groupId: params.groupId,
    }));
  }
  
  return Promise.all(promises);
}

// When task is verified by leader
export function notifyTaskVerified(params: {
  assigneeIds: string[];
  leaderName: string;
  taskTitle: string;
  taskId: string;
  groupId: string;
}): Promise<void> {
  return sendNotifications(params.assigneeIds, {
    type: 'task_verified',
    title: '✅ Task đã được duyệt',
    message: `${params.leaderName} đã duyệt task "${params.taskTitle}" của bạn`,
    taskId: params.taskId,
    groupId: params.groupId,
  });
}

// When someone submits a task (notify leader)
export function notifyTaskSubmitted(params: {
  leaderIds: string[];
  submitterName: string;
  taskTitle: string;
  taskId: string;
  groupId: string;
  isLate: boolean;
}): Promise<void> {
  const lateText = params.isLate ? ' (nộp trễ)' : '';
  
  return sendNotifications(params.leaderIds, {
    type: 'task_submitted',
    title: '📤 Có bài nộp mới',
    message: `${params.submitterName} đã nộp bài cho task "${params.taskTitle}"${lateText}`,
    taskId: params.taskId,
    groupId: params.groupId,
  });
}

// When deadline is approaching (within 24 hours)
export function notifyDeadlineApproaching(params: {
  assigneeIds: string[];
  taskTitle: string;
  taskId: string;
  groupId: string;
  hoursRemaining: number;
}): Promise<void> {
  const timeText = params.hoursRemaining < 1 
    ? 'dưới 1 giờ'
    : `${Math.round(params.hoursRemaining)} giờ`;
  
  return sendNotifications(params.assigneeIds, {
    type: 'task_deadline',
    title: '⏰ Sắp hết hạn',
    message: `Task "${params.taskTitle}" sẽ hết hạn trong ${timeText}. Hãy hoàn thành sớm!`,
    taskId: params.taskId,
    groupId: params.groupId,
  });
}
