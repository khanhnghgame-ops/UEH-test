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
import { 
  Loader2, 
  AlertTriangle, 
  Eye, 
  Clock, 
  Users, 
  Layers, 
  Edit, 
  FileUp,
  Plus,
  TimerReset
} from 'lucide-react';
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
  const [maxFileSize, setMaxFileSize] = useState<number>(10 * 1024 * 1024);
  
  // Extend deadline feature
  const [extendHours, setExtendHours] = useState<number>(0);

  const isOverdue = isDeadlineOverdue(task?.deadline);
  const isLeaderOrAdmin = isLeader || isAdmin;
  const canEditDetails = canEditProp && isLeaderOrAdmin;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDeadline(task.deadline ? task.deadline.slice(0, 16) : '');
      setStageId(task.stage_id || '');
      setAssignees(task.task_assignments?.map(a => a.user_id) || []);
      const taskWithSize = task as Task & { max_file_size?: number };
      setMaxFileSize(taskWithSize.max_file_size || 10 * 1024 * 1024);
      setExtendHours(0);
    }
  }, [task]);

  // Apply extend hours to deadline
  const handleExtendDeadline = () => {
    if (extendHours <= 0 || !deadline) return;
    
    const currentDeadline = new Date(deadline);
    currentDeadline.setHours(currentDeadline.getHours() + extendHours);
    
    const newDeadline = currentDeadline.toISOString().slice(0, 16);
    setDeadline(newDeadline);
    setExtendHours(0);
    
    toast({
      title: 'Đã gia hạn',
      description: `Deadline đã được gia hạn thêm ${extendHours} giờ`,
    });
  };

  const handleSave = async () => {
    if (!task || !canEditDetails) return;
    if (!title.trim()) {
      toast({ title: 'Lỗi', description: 'Vui lòng nhập tên task', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const changes: string[] = [];
      if (title.trim() !== task.title) changes.push('tên task');
      if ((description.trim() || null) !== (task.description || null)) changes.push('mô tả');
      if ((deadline || null) !== (task.deadline || null)) changes.push('deadline');
      if ((stageId || null) !== (task.stage_id || null)) changes.push('giai đoạn');
      
      const taskWithSize = task as Task & { max_file_size?: number };
      if (maxFileSize !== (taskWithSize.max_file_size || 10 * 1024 * 1024)) changes.push('giới hạn upload');

      const oldAssignees = task.task_assignments?.map(a => a.user_id) || [];
      const newAssigneeIds = assignees.filter(id => !oldAssignees.includes(id));
      const removedAssigneeIds = oldAssignees.filter(id => !assignees.includes(id));

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

      await supabase.from('task_assignments').delete().eq('task_id', task.id);

      if (assignees.length > 0) {
        const assignments = assignees.map((userId) => ({
          task_id: task.id,
          user_id: userId,
        }));
        await supabase.from('task_assignments').insert(assignments);
      }

      const { data: groupData } = await supabase
        .from('groups')
        .select('name')
        .eq('id', task.group_id)
        .single();

      const leaderName = profile?.full_name || user?.email || 'Leader';
      const groupName = groupData?.name || 'Project';

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

      toast({ title: 'Đã lưu', description: 'Task đã được cập nhật' });
      
      onSave();
      onClose();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message || 'Không thể cập nhật task', variant: 'destructive' });
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

  const toggleAssignee = (userId: string) => {
    if (!canEditDetails) return;
    setAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden flex flex-col gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30 shadow-sm">
                {canEditDetails ? (
                  <Edit className="w-5 h-5 text-primary" />
                ) : (
                  <Eye className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  {canEditDetails ? 'Chỉnh sửa task' : 'Chi tiết task'}
                </DialogTitle>
                <DialogDescription className="text-sm mt-0.5">
                  {canEditDetails ? 'Cập nhật thông tin task' : 'Xem thông tin chi tiết'}
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
                  Quá hạn
                </Badge>
              )}
              <Badge className={`${statusConfig.color} border text-xs`}>
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        
        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Task Title */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Edit className="w-4 h-4 text-primary" />
              Tên task {canEditDetails && <span className="text-destructive">*</span>}
            </Label>
            {canEditDetails ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Hoàn thành báo cáo chương 1"
                className="h-12 text-base font-medium border-2 focus:border-primary"
              />
            ) : (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="font-medium text-base">{task?.title}</p>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Mô tả</Label>
            {canEditDetails ? (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả công việc..."
                className="min-h-[100px] resize-none"
              />
            ) : (
              <div className="p-3 rounded-lg bg-muted/50 border min-h-[80px]">
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                  {task?.description || 'Không có mô tả'}
                </p>
              </div>
            )}
          </div>

          {/* Time & Stage Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Stage */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-warning" />
                Giai đoạn
              </Label>
              {canEditDetails ? (
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger className="h-11">
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
                <div className="p-3 rounded-lg bg-muted/50 border text-sm">
                  {stages.find(s => s.id === task?.stage_id)?.name || 'Chưa phân'}
                </div>
              )}
            </div>

            {/* File Size */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <FileUp className="w-4 h-4 text-muted-foreground" />
                Giới hạn upload
              </Label>
              {canEditDetails ? (
                <FileSizeLimitSelector value={maxFileSize} onChange={setMaxFileSize} />
              ) : (
                <div className="p-3 rounded-lg bg-muted/50 border text-sm">
                  {formatFileSizeMB(maxFileSize)}
                </div>
              )}
            </div>
          </div>

          {/* Deadline Section */}
          <div className="p-4 rounded-xl border-2 border-warning/20 bg-gradient-to-br from-warning/5 to-transparent space-y-4">
            <Label className="text-sm font-bold flex items-center gap-2 text-warning">
              <Clock className="w-4 h-4" />
              Deadline
            </Label>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Current/Set Deadline */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Thời hạn hiện tại</p>
                {canEditDetails ? (
                  <DeadlineHourPicker value={deadline} onChange={setDeadline} placeholder="Chọn ngày..." />
                ) : (
                  <div className={`p-3 rounded-lg border text-sm ${isOverdue ? 'bg-destructive/10 border-destructive/30' : 'bg-background'}`}>
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

              {/* Extend Deadline - Only for editors with existing deadline */}
              {canEditDetails && deadline && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TimerReset className="w-3 h-3" />
                    Gia hạn thêm
                  </p>
                  <div className="flex gap-2">
                    <Select 
                      value={extendHours.toString()} 
                      onValueChange={(v) => setExtendHours(parseInt(v))}
                    >
                      <SelectTrigger className="h-11 flex-1">
                        <SelectValue placeholder="Chọn số giờ" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">-- Chọn --</SelectItem>
                        <SelectItem value="1">+1 giờ</SelectItem>
                        <SelectItem value="2">+2 giờ</SelectItem>
                        <SelectItem value="3">+3 giờ</SelectItem>
                        <SelectItem value="6">+6 giờ</SelectItem>
                        <SelectItem value="12">+12 giờ</SelectItem>
                        <SelectItem value="24">+24 giờ (1 ngày)</SelectItem>
                        <SelectItem value="48">+48 giờ (2 ngày)</SelectItem>
                        <SelectItem value="72">+72 giờ (3 ngày)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleExtendDeadline}
                      disabled={extendHours <= 0}
                      className="h-11 w-11 shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Assignees */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-success" />
              Người phụ trách
              {assignees.length > 0 && (
                <span className="ml-auto text-xs font-normal text-success">
                  Đã chọn {assignees.length} người
                </span>
              )}
            </Label>
            
            {canEditDetails ? (
              <div className="border rounded-xl bg-muted/30 p-3 max-h-[200px] overflow-y-auto">
                {members.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">
                    Chưa có thành viên trong project
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        onClick={() => toggleAssignee(member.user_id)}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                          assignees.includes(member.user_id)
                            ? 'bg-success/10 border-2 border-success/40 shadow-sm'
                            : 'bg-background hover:bg-muted/50 border-2 border-transparent'
                        }`}
                      >
                        <Checkbox
                          checked={assignees.includes(member.user_id)}
                          onCheckedChange={() => toggleAssignee(member.user_id)}
                          className="h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.profiles?.full_name}</p>
                          <p className="text-xs text-muted-foreground">{member.profiles?.student_id}</p>
                        </div>
                        {member.role === 'leader' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                            Leader
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="border rounded-xl bg-muted/30 p-3">
                {task?.task_assignments && task.task_assignments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {task.task_assignments.map((assignment) => (
                      <div key={assignment.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/20">
                        <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center text-xs font-bold text-success">
                          {assignment.profiles?.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className="text-sm font-medium">{assignment.profiles?.full_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-4">
                    Chưa có người được giao
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="min-w-24">
            {canEditDetails ? 'Hủy' : 'Đóng'}
          </Button>
          {canEditDetails && (
            <Button onClick={handleSave} disabled={isLoading} className="min-w-32 gap-2">
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
