import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, AlertTriangle, Eye, Calendar, Users, FileText, Layers, Edit } from 'lucide-react';
import type { Task, Stage, GroupMember, TaskStatus } from '@/types/database';
import { formatDeadlineVN, isDeadlineOverdue } from '@/lib/datetime';
import { DeadlineHourPicker } from './DeadlineHourPicker';
import FileSizeLimitSelector, { formatFileSizeMB } from './FileSizeLimitSelector';
import { notifyTaskUpdated, notifyTaskAssigneesChanged } from '@/lib/notifications';

interface TaskEditDialogProps {
  task: Task | null;
  stages: Stage[];
  members: GroupMember[];
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  canEdit: boolean;
}

export default function TaskEditDialog({
  task,
  stages,
  members,
  isOpen,
  onClose,
  onSave,
  canEdit: canEditProp,
}: TaskEditDialogProps) {
  const { toast } = useToast();
  const { user, isLeader, isAdmin, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [stageId, setStageId] = useState<string>('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [maxFileSize, setMaxFileSize] = useState<number>(10 * 1024 * 1024); // 10MB default

  // Check if task is overdue
  const isOverdue = isDeadlineOverdue(task?.deadline);
  const isLeaderOrAdmin = isLeader || isAdmin;
  
  // Only leader can edit task details (title, description, deadline, stage, assignees)
  const canEditDetails = canEditProp && isLeaderOrAdmin;
  // This dialog is now ONLY for viewing/editing task metadata by leader

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDeadline(task.deadline ? task.deadline.slice(0, 16) : '');
      setStageId(task.stage_id || '');
      setAssignees(task.task_assignments?.map(a => a.user_id) || []);
      // Get max_file_size from task (need to cast since not in types yet)
      const taskWithSize = task as Task & { max_file_size?: number };
      setMaxFileSize(taskWithSize.max_file_size || 10 * 1024 * 1024);
    }
  }, [task]);

  const handleSave = async () => {
    if (!task || !canEditDetails) return;
    if (!title.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập tên task',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Track what changed for notifications
      const changes: string[] = [];
      if (title.trim() !== task.title) changes.push('tên task');
      if ((description.trim() || null) !== (task.description || null)) changes.push('mô tả');
      if ((deadline || null) !== (task.deadline || null)) changes.push('deadline');
      if ((stageId || null) !== (task.stage_id || null)) changes.push('giai đoạn');
      
      const taskWithSize = task as Task & { max_file_size?: number };
      if (maxFileSize !== (taskWithSize.max_file_size || 10 * 1024 * 1024)) changes.push('giới hạn upload');

      // Track assignee changes
      const oldAssignees = task.task_assignments?.map(a => a.user_id) || [];
      const newAssigneeIds = assignees.filter(id => !oldAssignees.includes(id));
      const removedAssigneeIds = oldAssignees.filter(id => !assignees.includes(id));

      // Update task details
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          deadline: deadline || null,
          stage_id: stageId || null,
          max_file_size: maxFileSize,
        })
        .eq('id', task.id);

      if (taskError) throw taskError;

      // Update assignments
      await supabase.from('task_assignments').delete().eq('task_id', task.id);

      if (assignees.length > 0) {
        const assignments = assignees.map((userId) => ({
          task_id: task.id,
          user_id: userId,
        }));
        await supabase.from('task_assignments').insert(assignments);
      }

      // Get group name for notifications
      const { data: groupData } = await supabase
        .from('groups')
        .select('name')
        .eq('id', task.group_id)
        .single();

      const leaderName = profile?.full_name || user?.email || 'Leader';
      const groupName = groupData?.name || 'Project';

      // Send notifications for task updates (only if something changed)
      if (changes.length > 0 && assignees.length > 0) {
        await notifyTaskUpdated({
          assigneeIds: assignees,
          leaderName,
          taskTitle: title.trim(),
          taskId: task.id,
          groupId: task.group_id,
          changes,
        });
      }

      // Send notifications for assignee changes
      if (newAssigneeIds.length > 0 || removedAssigneeIds.length > 0) {
        await notifyTaskAssigneesChanged({
          newAssigneeIds,
          removedAssigneeIds,
          leaderName,
          taskTitle: title.trim(),
          taskId: task.id,
          groupId: task.group_id,
          groupName,
        });
      }

      // Log activity with detailed description
      const activityDescription = changes.length > 0
        ? `Cập nhật ${changes.join(', ')} của task "${title.trim()}"`
        : `Cập nhật task "${title.trim()}"`;

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: leaderName,
        action: 'UPDATE_TASK',
        action_type: 'task',
        description: activityDescription,
        group_id: task.group_id,
        metadata: { 
          task_id: task.id, 
          task_title: title.trim(),
          changes,
          new_assignees: newAssigneeIds.length,
          removed_assignees: removedAssigneeIds.length,
        }
      });

      toast({
        title: 'Đã lưu',
        description: 'Task đã được cập nhật',
      });
      
      onSave();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể cập nhật task',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusConfig = (s: TaskStatus) => {
    switch (s) {
      case 'TODO':
        return { label: 'Chờ làm', color: 'bg-muted text-muted-foreground' };
      case 'IN_PROGRESS':
        return { label: 'Đang làm', color: 'bg-warning/10 text-warning border-warning/50' };
      case 'DONE':
        return { label: 'Hoàn thành', color: 'bg-primary/10 text-primary border-primary/50' };
      case 'VERIFIED':
        return { label: 'Đã duyệt', color: 'bg-success/10 text-success border-success/50' };
      default:
        return { label: s, color: 'bg-muted' };
    }
  };

  const statusConfig = task ? getStatusConfig(task.status) : getStatusConfig('TODO');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[85vh] max-h-[800px] p-0 overflow-hidden flex flex-col">
        {/* Header - Match Create Task style */}
        <DialogHeader className="px-6 py-3 border-b bg-gradient-to-r from-primary/10 to-transparent shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30">
                {canEditDetails ? (
                  <Edit className="w-5 h-5 text-primary" />
                ) : (
                  <Eye className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {canEditDetails ? 'Chỉnh sửa task' : 'Chi tiết task'}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {canEditDetails ? 'Cập nhật thông tin task' : 'Xem thông tin chi tiết task'}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isLeaderOrAdmin && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Eye className="w-3 h-3" />
                  Chế độ xem
                </Badge>
              )}
              {isOverdue && (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  Quá deadline
                </Badge>
              )}
              <Badge className={`${statusConfig.color} border text-xs`}>
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        
        {/* Content - Match Create Task layout */}
        <div className="flex-1 p-5 overflow-hidden">
          <div className="grid grid-cols-3 gap-5 h-full">
            {/* Left Column - Basic Info (2/3 width) */}
            <div className="col-span-2 flex flex-col gap-4">
              {/* Task Title & Description Card */}
              <div className="p-5 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent flex-1 flex flex-col">
                <h3 className="text-sm font-bold text-primary flex items-center gap-2 mb-4 uppercase tracking-wide">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  Thông tin cơ bản
                </h3>
                <div className="space-y-4 flex-1 flex flex-col">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Tên task {canEditDetails && <span className="text-destructive">*</span>}</Label>
                    {canEditDetails ? (
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="VD: Hoàn thành báo cáo chương 1"
                        className="h-10"
                      />
                    ) : (
                      <div className="p-2.5 rounded-lg bg-background/50 border">
                        <p className="font-medium">{task?.title}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 flex-1 flex flex-col">
                    <Label className="text-sm font-medium">Mô tả chi tiết</Label>
                    {canEditDetails ? (
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Mô tả công việc cần thực hiện, yêu cầu cụ thể, tài liệu tham khảo..."
                        className="resize-none flex-1 min-h-[120px]"
                      />
                    ) : (
                      <div className="p-2.5 rounded-lg bg-background/50 border flex-1 min-h-[120px]">
                        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                          {task?.description || 'Không có mô tả'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Stage & Deadline Card */}
              <div className="p-5 rounded-xl border-2 border-warning/20 bg-gradient-to-br from-warning/5 to-transparent">
                <h3 className="text-sm font-bold text-warning flex items-center gap-2 mb-4 uppercase tracking-wide">
                  <div className="w-2 h-2 rounded-full bg-warning" />
                  Thời gian & Giai đoạn
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Giai đoạn</Label>
                    {canEditDetails ? (
                      <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Chọn giai đoạn" />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-background/50 border text-sm">
                        {stages.find(s => s.id === task?.stage_id)?.name || 'Chưa phân'}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Deadline</Label>
                    {canEditDetails ? (
                      <DeadlineHourPicker
                        value={deadline}
                        onChange={setDeadline}
                        placeholder="Chọn ngày..."
                      />
                    ) : (
                      <div className={`p-2.5 rounded-lg border text-sm ${isOverdue ? 'bg-destructive/10 border-destructive/30' : 'bg-background/50'}`}>
                        {task?.deadline ? (
                          <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                            {formatDeadlineVN(task.deadline)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Không có</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Giới hạn upload</Label>
                    {canEditDetails ? (
                      <FileSizeLimitSelector
                        value={maxFileSize}
                        onChange={setMaxFileSize}
                      />
                    ) : (
                      <div className="p-2.5 rounded-lg bg-background/50 border text-sm">
                        {formatFileSizeMB(maxFileSize)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Column - Assignees (1/3 width) */}
            <div className="col-span-1">
              <div className="p-5 rounded-xl border-2 border-success/20 bg-gradient-to-br from-success/5 to-transparent h-full flex flex-col">
                <h3 className="text-sm font-bold text-success flex items-center gap-2 mb-4 uppercase tracking-wide">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  Người phụ trách
                </h3>
                
                {canEditDetails ? (
                  <>
                    <div className="border rounded-xl bg-background/50 p-2 flex-1 overflow-y-auto">
                      {members.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          Chưa có thành viên trong project
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {members.map((member) => (
                            <div 
                              key={member.id} 
                              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                                assignees.includes(member.user_id) 
                                  ? 'bg-success/10 border-2 border-success/40 shadow-sm' 
                                  : 'hover:bg-muted/50 border-2 border-transparent'
                              }`}
                              onClick={() => {
                                if (assignees.includes(member.user_id)) {
                                  setAssignees(assignees.filter(id => id !== member.user_id));
                                } else {
                                  setAssignees([...assignees, member.user_id]);
                                }
                              }}
                            >
                              <Checkbox
                                id={`assignee-${member.user_id}`}
                                checked={assignees.includes(member.user_id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setAssignees([...assignees, member.user_id]);
                                  } else {
                                    setAssignees(assignees.filter((id) => id !== member.user_id));
                                  }
                                }}
                                className="h-5 w-5"
                              />
                              <div className="flex-1 min-w-0">
                                <label htmlFor={`assignee-${member.user_id}`} className="text-sm font-medium cursor-pointer block truncate">
                                  {member.profiles?.full_name}
                                </label>
                                <p className="text-xs text-muted-foreground">{member.profiles?.student_id}</p>
                              </div>
                              {member.role === 'leader' && (
                                <span className="text-xs px-2 py-1 rounded-full bg-warning/20 text-warning font-medium shrink-0">
                                  Leader
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {assignees.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-3 text-center">
                        Đã chọn <span className="font-bold text-success">{assignees.length}</span> thành viên
                      </p>
                    )}
                  </>
                ) : (
                  <div className="border rounded-xl bg-background/50 p-3 flex-1 overflow-y-auto">
                    {task?.task_assignments && task.task_assignments.length > 0 ? (
                      <div className="space-y-2">
                        {task.task_assignments.map((assignment) => (
                          <div key={assignment.id} className="flex items-center gap-3 p-2 rounded-lg bg-success/5 border border-success/20">
                            <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-xs font-bold text-success">
                              {assignment.profiles?.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <span className="text-sm font-medium">{assignment.profiles?.full_name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Chưa có người được giao
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Match Create Task style */}
        <DialogFooter className="px-5 py-3 border-t bg-muted/30 gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-10 min-w-24">
            {canEditDetails ? 'Hủy' : 'Đóng'}
          </Button>
          {canEditDetails && (
            <Button onClick={handleSave} disabled={isLoading} className="h-10 min-w-32 gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Edit className="w-4 h-4" />
                  Lưu thay đổi
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
