import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
import { Loader2, Lock, AlertTriangle, Eye, Calendar, Users, FileText, Layers } from 'lucide-react';
import type { Task, Stage, GroupMember, TaskStatus } from '@/types/database';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DateTimePicker } from './DateTimePicker';

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
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [assignees, setAssignees] = useState<string[]>([]);

  // Check if task is overdue
  const isOverdue = task?.deadline ? new Date(task.deadline) < new Date() : false;
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
      setStatus(task.status);
      setAssignees(task.task_assignments?.map(a => a.user_id) || []);
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
      // Update task details
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          deadline: deadline || null,
          stage_id: stageId || null,
          status,
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

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: profile?.full_name || user?.email || 'Unknown',
        action: 'UPDATE_TASK',
        action_type: 'task',
        description: `Cập nhật task "${title.trim()}"`,
        group_id: task.group_id,
        metadata: { task_id: task.id, task_title: title.trim() }
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="space-y-3 pb-4 border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${canEditDetails ? 'bg-primary/10' : 'bg-muted'}`}>
                {canEditDetails ? (
                  <FileText className="w-5 h-5 text-primary" />
                ) : (
                  <Eye className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <DialogTitle className="text-xl font-semibold">
                {canEditDetails ? 'Chỉnh sửa task' : 'Chi tiết task'}
              </DialogTitle>
            </div>
            <Badge className={`${statusConfig.color} border`}>
              {statusConfig.label}
            </Badge>
          </div>
          
          {/* Permission indicators */}
          <div className="flex flex-wrap gap-2">
            {!isLeaderOrAdmin && (
              <Badge variant="secondary" className="gap-1">
                <Eye className="w-3 h-3" />
                Chế độ xem
              </Badge>
            )}
            {isOverdue && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                Quá deadline
              </Badge>
            )}
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Task Title */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Tên task {canEditDetails && <span className="text-destructive">*</span>}
              </Label>
              {canEditDetails ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nhập tên task..."
                  className="h-11"
                />
              ) : (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="font-medium">{task?.title}</p>
                </div>
              )}
            </div>
            
            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mô tả</Label>
              {canEditDetails ? (
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả chi tiết task..."
                  rows={3}
                  className="resize-none"
                />
              ) : (
                <div className="p-3 rounded-lg bg-muted/50 border min-h-[80px]">
                  <p className="text-sm text-muted-foreground">
                    {task?.description || 'Không có mô tả'}
                  </p>
                </div>
              )}
            </div>

            {/* Stage & Status Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  Giai đoạn
                </Label>
                {canEditDetails ? (
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Chọn giai đoạn..." />
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
                  <div className="p-3 rounded-lg bg-muted/50 border h-11 flex items-center">
                    <span className="text-sm">
                      {stages.find(s => s.id === task?.stage_id)?.name || 'Chưa phân giai đoạn'}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Trạng thái</Label>
                {canEditDetails ? (
                  <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODO">
                        <span className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                          Chờ làm
                        </span>
                      </SelectItem>
                      <SelectItem value="IN_PROGRESS">
                        <span className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-warning" />
                          Đang làm
                        </span>
                      </SelectItem>
                      <SelectItem value="DONE">
                        <span className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          Hoàn thành
                        </span>
                      </SelectItem>
                      <SelectItem value="VERIFIED">
                        <span className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-success" />
                          Đã duyệt
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-3 rounded-lg bg-muted/50 border h-11 flex items-center">
                    <Badge className={`${statusConfig.color} border`}>
                      {statusConfig.label}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                Deadline
              </Label>
              {canEditDetails ? (
                <DateTimePicker
                  value={deadline}
                  onChange={setDeadline}
                  placeholder="Chọn deadline..."
                />
              ) : (
                <div className={`p-3 rounded-lg border h-11 flex items-center gap-2 ${isOverdue ? 'bg-destructive/10 border-destructive/30' : 'bg-muted/50'}`}>
                  {task?.deadline ? (
                    <>
                      <span className={`text-sm ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                        {format(new Date(task.deadline), "dd/MM/yyyy – HH:mm", { locale: vi })}
                      </span>
                      {isOverdue && (
                        <Badge variant="destructive" className="text-xs">Quá hạn</Badge>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Không có deadline</span>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Assignees */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Người phụ trách
              </Label>
              
              {canEditDetails ? (
                <div className="border rounded-lg p-4 max-h-48 overflow-y-auto bg-muted/20">
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Chưa có thành viên nào</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {members.map((member) => (
                        <div key={member.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
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
                          />
                          <label
                            htmlFor={`assignee-${member.user_id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            <span className="font-medium">{member.profiles?.full_name}</span>
                            <span className="text-muted-foreground ml-1 text-xs">({member.profiles?.student_id})</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-muted/20">
                  {task?.task_assignments && task.task_assignments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {task.task_assignments.map((assignment) => (
                        <Badge key={assignment.id} variant="secondary" className="gap-1.5 px-3 py-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                            {assignment.profiles?.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          {assignment.profiles?.full_name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">Chưa có người được giao</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t gap-2">
          <Button variant="outline" onClick={onClose}>
            {canEditDetails ? 'Hủy' : 'Đóng'}
          </Button>
          {canEditDetails && (
            <Button onClick={handleSave} disabled={isLoading} className="min-w-24">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                'Lưu thay đổi'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
