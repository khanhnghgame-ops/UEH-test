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
import { Loader2, Plus, Sparkles, Clock, Users, Layers, FileUp } from 'lucide-react';
import type { Stage, GroupMember } from '@/types/database';
import { DeadlineHourPicker } from './DeadlineHourPicker';
import FileSizeLimitSelector from './FileSizeLimitSelector';
import { notifyTaskAssigned } from '@/lib/notifications';

interface TaskCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  groupId: string;
  groupName?: string;
  stages: Stage[];
  members: GroupMember[];
  defaultStageId?: string;
}

export default function TaskCreateDialog({
  isOpen,
  onClose,
  onSuccess,
  groupId,
  groupName,
  stages,
  members,
  defaultStageId,
}: TaskCreateDialogProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [isCreating, setIsCreating] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [stageId, setStageId] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [maxFileSize, setMaxFileSize] = useState<number>(10 * 1024 * 1024);

  // Reset form and set default stage when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setDeadline('');
      setAssignees([]);
      setMaxFileSize(10 * 1024 * 1024);

      // Set default stage (latest or provided)
      if (defaultStageId) {
        setStageId(defaultStageId);
      } else if (stages.length > 0) {
        const latestStage = [...stages].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        setStageId(latestStage.id);
      } else {
        setStageId('');
      }
    }
  }, [isOpen, stages, defaultStageId]);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({ title: 'Lỗi', description: 'Vui lòng nhập tên task', variant: 'destructive' });
      return;
    }
    if (stages.length > 0 && !stageId) {
      toast({ title: 'Lỗi', description: 'Vui lòng chọn giai đoạn', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      const { data: newTask } = await supabase
        .from('tasks')
        .insert({
          group_id: groupId,
          title: title.trim(),
          description: description.trim() || null,
          deadline: deadline || null,
          stage_id: stageId || null,
          created_by: user!.id,
          max_file_size: maxFileSize,
          slug: '',
        })
        .select()
        .single();

      if (newTask && assignees.length > 0) {
        await supabase
          .from('task_assignments')
          .insert(assignees.map((userId) => ({ task_id: newTask.id, user_id: userId })));

        // Notify assignees
        const assigneesToNotify = assignees.filter((id) => id !== user?.id);
        if (assigneesToNotify.length > 0) {
          await notifyTaskAssigned({
            assigneeIds: assigneesToNotify,
            leaderName: profile?.full_name || 'Leader',
            taskTitle: title.trim(),
            taskId: newTask.id,
            groupId,
            groupName: groupName || 'Project',
            deadline: deadline || null,
          });
        }
      }

      toast({ title: 'Thành công', description: 'Đã tạo task mới' });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleAssignee = (userId: string) => {
    setAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden flex flex-col gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30 shadow-sm">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Tạo task mới</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                Điền thông tin để tạo task cho project
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Task Title - Most Important */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Tên task <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Hoàn thành báo cáo chương 1"
              className="h-12 text-base font-medium border-2 focus:border-primary"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Mô tả (tùy chọn)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả công việc cần thực hiện..."
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Time & Stage Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Stage */}
            {stages.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-warning" />
                  Giai đoạn <span className="text-destructive">*</span>
                </Label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Chọn giai đoạn" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Deadline */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" />
                Deadline
              </Label>
              <DeadlineHourPicker value={deadline} onChange={setDeadline} placeholder="Chọn ngày..." />
            </div>
          </div>

          {/* File Size Limit */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <FileUp className="w-4 h-4 text-muted-foreground" />
              Giới hạn upload
            </Label>
            <FileSizeLimitSelector value={maxFileSize} onChange={setMaxFileSize} />
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
            <div className="border rounded-xl bg-muted/30 p-3 max-h-[200px] overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-4">
                  Chưa có thành viên trong project
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => toggleAssignee(m.user_id)}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                        assignees.includes(m.user_id)
                          ? 'bg-success/10 border-2 border-success/40 shadow-sm'
                          : 'bg-background hover:bg-muted/50 border-2 border-transparent'
                      }`}
                    >
                      <Checkbox
                        checked={assignees.includes(m.user_id)}
                        onCheckedChange={() => toggleAssignee(m.user_id)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.profiles?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{m.profiles?.student_id}</p>
                      </div>
                      {m.role === 'leader' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                          Leader
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="min-w-24">
            Hủy
          </Button>
          <Button onClick={handleCreate} disabled={isCreating} className="min-w-32 gap-2">
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang tạo...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Tạo task
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
