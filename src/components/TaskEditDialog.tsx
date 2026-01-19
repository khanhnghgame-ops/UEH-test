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
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Loader2, AlertTriangle, Eye, Calendar, Users, FileText, 
  Layers, Edit, Clock, HardDrive, CalendarPlus, ArrowRight,
  ChevronRight, CheckCircle2, X, Plus
} from 'lucide-react';
import type { Task, Stage, GroupMember, TaskStatus } from '@/types/database';
import { formatDeadlineVN, formatDeadlineShortVN, isDeadlineOverdue, parseLocalDateTime } from '@/lib/datetime';
import { DeadlineHourPicker } from './DeadlineHourPicker';
import FileSizeLimitSelector, { formatFileSizeMB } from './FileSizeLimitSelector';
import { notifyTaskUpdated, notifyTaskAssigneesChanged } from '@/lib/notifications';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

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
  const [extendedDeadline, setExtendedDeadline] = useState('');
  const [showExtendSection, setShowExtendSection] = useState(false);

  // Type for extended task
  const taskWithExtended = task as Task & { extended_deadline?: string; extended_at?: string; extended_by?: string };
  const originalDeadlineOverdue = isDeadlineOverdue(task?.deadline);
  const effectiveDeadline = taskWithExtended?.extended_deadline || task?.deadline;
  const isOverdue = isDeadlineOverdue(effectiveDeadline);
  const hasExtension = !!taskWithExtended?.extended_deadline;
  
  const isLeaderOrAdmin = isLeader || isAdmin;
  const canEditDetails = canEditProp && isLeaderOrAdmin;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDeadline(task.deadline ? task.deadline.slice(0, 16) : '');
      setStageId(task.stage_id || '');
      setAssignees(task.task_assignments?.map(a => a.user_id) || []);
      const taskWithSize = task as Task & { max_file_size?: number; extended_deadline?: string };
      setMaxFileSize(taskWithSize.max_file_size || 10 * 1024 * 1024);
      setExtendedDeadline(taskWithSize.extended_deadline ? taskWithSize.extended_deadline.slice(0, 16) : '');
      setShowExtendSection(!!taskWithSize.extended_deadline);
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
      const changes: string[] = [];
      if (title.trim() !== task.title) changes.push('tên task');
      if ((description.trim() || null) !== (task.description || null)) changes.push('mô tả');
      if ((deadline || null) !== (task.deadline || null)) changes.push('deadline');
      if ((stageId || null) !== (task.stage_id || null)) changes.push('giai đoạn');
      
      const taskWithSize = task as Task & { max_file_size?: number; extended_deadline?: string };
      if (maxFileSize !== (taskWithSize.max_file_size || 10 * 1024 * 1024)) changes.push('giới hạn upload');
      
      const hadExtension = !!taskWithSize.extended_deadline;
      const hasNewExtension = !!extendedDeadline && showExtendSection;
      if (hadExtension !== hasNewExtension || (hasNewExtension && extendedDeadline !== taskWithSize.extended_deadline?.slice(0, 16))) {
        changes.push('gia hạn deadline');
      }

      const oldAssignees = task.task_assignments?.map(a => a.user_id) || [];
      const newAssigneeIds = assignees.filter(id => !oldAssignees.includes(id));
      const removedAssigneeIds = oldAssignees.filter(id => !assignees.includes(id));

      // Build update object
      const updateData: any = {
        title: title.trim(),
        description: description.trim() || null,
        deadline: deadline || null,
        stage_id: stageId || null,
        max_file_size: maxFileSize,
      };

      // Handle extended deadline
      if (showExtendSection && extendedDeadline) {
        updateData.extended_deadline = extendedDeadline;
        if (!taskWithSize.extended_deadline) {
          updateData.extended_at = new Date().toISOString();
          updateData.extended_by = user!.id;
        }
      } else {
        updateData.extended_deadline = null;
        updateData.extended_at = null;
        updateData.extended_by = null;
      }

      const { error: taskError } = await supabase
        .from('tasks')
        .update(updateData)
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
        return { label: 'Chờ làm', color: 'bg-muted text-muted-foreground', icon: Clock };
      case 'IN_PROGRESS':
        return { label: 'Đang làm', color: 'bg-warning/10 text-warning border-warning/50', icon: Clock };
      case 'DONE':
        return { label: 'Hoàn thành', color: 'bg-primary/10 text-primary border-primary/50', icon: CheckCircle2 };
      case 'VERIFIED':
        return { label: 'Đã duyệt', color: 'bg-success/10 text-success border-success/50', icon: CheckCircle2 };
      default:
        return { label: s, color: 'bg-muted', icon: Clock };
    }
  };

  const statusConfig = task ? getStatusConfig(task.status) : getStatusConfig('TODO');

  // Calculate extension info
  const getExtensionInfo = () => {
    if (!deadline || !extendedDeadline) return null;
    const original = parseLocalDateTime(deadline);
    const extended = parseLocalDateTime(extendedDeadline);
    if (!original || !extended) return null;
    
    const diffMs = extended.getTime() - original.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    if (diffMs <= 0) return { text: 'Phải sau deadline gốc', valid: false, days: 0, hours: 0 };
    
    return { 
      text: `+${diffDays > 0 ? `${diffDays} ngày` : ''}${diffDays > 0 && remainingHours > 0 ? ' ' : ''}${remainingHours > 0 ? `${remainingHours} giờ` : ''}`.trim() || '+vài phút',
      valid: true,
      days: diffDays,
      hours: remainingHours
    };
  };

  const extensionInfo = getExtensionInfo();

  // Get extension info for existing task
  const getExistingExtensionInfo = () => {
    if (!task?.deadline || !taskWithExtended?.extended_deadline) return null;
    const original = parseLocalDateTime(task.deadline);
    const extended = parseLocalDateTime(taskWithExtended.extended_deadline);
    if (!original || !extended) return null;
    
    const diffMs = extended.getTime() - original.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    let text = '+';
    if (diffDays > 0) text += `${diffDays} ngày`;
    if (diffDays > 0 && remainingHours > 0) text += ' ';
    if (remainingHours > 0) text += `${remainingHours} giờ`;
    
    return text || '+vài phút';
  };

  const existingExtensionText = getExistingExtensionInfo();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[85vh] max-h-[800px] p-0 overflow-hidden flex flex-col">
        {/* Header - Compact and informative */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${canEditDetails ? 'bg-primary/10 border border-primary/20' : 'bg-muted border border-border'}`}>
                {canEditDetails ? (
                  <Edit className="w-6 h-6 text-primary" />
                ) : (
                  <Eye className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {canEditDetails ? 'Chỉnh sửa Task' : 'Chi tiết Task'}
                </DialogTitle>
                <DialogDescription className="text-sm mt-1">
                  {task?.title && <span className="font-medium text-foreground">{task.title}</span>}
                </DialogDescription>
              </div>
            </div>
            
            {/* Status badges */}
            <div className="flex items-center gap-2">
              {!isLeaderOrAdmin && (
                <Badge variant="secondary" className="gap-1.5 px-3 py-1">
                  <Eye className="w-3.5 h-3.5" />
                  Chế độ xem
                </Badge>
              )}
              {hasExtension && (
                <Badge className="gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-600 border border-blue-500/30 hover:bg-blue-500/20">
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Đã gia hạn
                </Badge>
              )}
              {isOverdue && (
                <Badge variant="destructive" className="gap-1.5 px-3 py-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Quá hạn
                </Badge>
              )}
              <Badge className={`${statusConfig.color} border px-3 py-1 gap-1.5`}>
                <statusConfig.icon className="w-3.5 h-3.5" />
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        
        {/* Content - Two column layout */}
        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-3 h-full">
            {/* Left Column - Main content (2/3) */}
            <div className="col-span-2 p-6 overflow-y-auto border-r">
              <div className="space-y-6 max-w-3xl">
                {/* Section 1: Basic Info */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-primary">Thông tin cơ bản</h3>
                  </div>
                  
                  <div className="space-y-4 pl-8">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Tên task {canEditDetails && <span className="text-destructive">*</span>}
                      </Label>
                      {canEditDetails ? (
                        <Input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Nhập tên task..."
                          className="h-11 text-base"
                        />
                      ) : (
                        <div className="p-3 rounded-lg bg-muted/50 border text-base font-medium">
                          {task?.title}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Mô tả chi tiết</Label>
                      {canEditDetails ? (
                        <Textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Mô tả công việc cần thực hiện..."
                          className="min-h-[120px] resize-none"
                        />
                      ) : (
                        <div className="p-3 rounded-lg bg-muted/50 border min-h-[80px]">
                          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                            {task?.description || 'Không có mô tả'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Section 2: Stage & Config */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-warning/10">
                      <Layers className="w-4 h-4 text-warning" />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-warning">Giai đoạn & Cấu hình</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pl-8">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                        Giai đoạn
                      </Label>
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
                        <div className="p-2.5 rounded-lg bg-muted/50 border text-sm">
                          {stages.find(s => s.id === task?.stage_id)?.name || 'Chưa phân giai đoạn'}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                        Giới hạn upload
                      </Label>
                      {canEditDetails ? (
                        <div className="h-10 flex items-center">
                          <FileSizeLimitSelector
                            value={maxFileSize}
                            onChange={setMaxFileSize}
                          />
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-muted/50 border text-sm">
                          {formatFileSizeMB(maxFileSize)}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Section 3: Deadline & Extension - THE MAIN FEATURE */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-blue-500/10">
                      <Calendar className="w-4 h-4 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-blue-600">Thời hạn hoàn thành</h3>
                  </div>
                  
                  <div className="pl-8 space-y-4">
                    {/* Original Deadline */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        Deadline ban đầu
                      </Label>
                      {canEditDetails ? (
                        <DeadlineHourPicker
                          value={deadline}
                          onChange={setDeadline}
                          placeholder="Chọn ngày deadline..."
                        />
                      ) : (
                        <div className={`p-2.5 rounded-lg border text-sm ${
                          originalDeadlineOverdue && !hasExtension 
                            ? 'bg-destructive/10 border-destructive/30 text-destructive font-medium' 
                            : 'bg-muted/50'
                        }`}>
                          {task?.deadline ? formatDeadlineVN(task.deadline) : 'Không có deadline'}
                        </div>
                      )}
                    </div>

                    {/* Deadline Extension Section */}
                    {canEditDetails && deadline && (
                      <div className="rounded-xl border-2 border-dashed border-blue-300/50 bg-blue-50/30 dark:bg-blue-950/20 p-4">
                        {!showExtendSection ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setShowExtendSection(true)}
                            className="w-full h-auto py-4 gap-3 text-blue-600 hover:text-blue-700 hover:bg-blue-100/50"
                          >
                            <div className="p-2 rounded-full bg-blue-500/10">
                              <Plus className="w-4 h-4" />
                            </div>
                            <div className="text-left">
                              <p className="font-medium">Gia hạn deadline</p>
                              <p className="text-xs text-muted-foreground font-normal">Thêm thời gian cho task mà không thay đổi deadline gốc</p>
                            </div>
                            <ChevronRight className="w-5 h-5 ml-auto" />
                          </Button>
                        ) : (
                          <div className="space-y-4">
                            {/* Header with cancel */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CalendarPlus className="w-5 h-5 text-blue-600" />
                                <span className="font-semibold text-blue-600">Gia hạn deadline</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowExtendSection(false);
                                  setExtendedDeadline('');
                                }}
                                className="h-8 px-2 text-muted-foreground hover:text-destructive"
                              >
                                <X className="w-4 h-4 mr-1" />
                                Hủy
                              </Button>
                            </div>

                            {/* New deadline picker */}
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Deadline sau gia hạn</Label>
                              <DeadlineHourPicker
                                value={extendedDeadline}
                                onChange={setExtendedDeadline}
                                placeholder="Chọn ngày mới..."
                              />
                            </div>

                            {/* Summary visualization */}
                            {extendedDeadline && extensionInfo && (
                              <div className={`rounded-lg p-4 ${extensionInfo.valid ? 'bg-white dark:bg-background border-2 border-blue-200' : 'bg-destructive/10 border border-destructive/30'}`}>
                                {extensionInfo.valid ? (
                                  <div className="space-y-3">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tóm tắt thay đổi</p>
                                    
                                    <div className="flex items-center gap-3">
                                      {/* Original */}
                                      <div className="flex-1 p-3 rounded-lg bg-muted/50 text-center">
                                        <p className="text-[10px] text-muted-foreground uppercase mb-1">Deadline gốc</p>
                                        <p className="text-sm font-semibold">{formatDeadlineShortVN(deadline)}</p>
                                      </div>
                                      
                                      {/* Arrow with extension time */}
                                      <div className="flex flex-col items-center">
                                        <div className="px-3 py-1.5 rounded-full bg-blue-500 text-white text-xs font-bold shadow-sm">
                                          {extensionInfo.text}
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-blue-500 mt-1" />
                                      </div>
                                      
                                      {/* Extended */}
                                      <div className="flex-1 p-3 rounded-lg bg-blue-500/10 border-2 border-blue-500/30 text-center">
                                        <p className="text-[10px] text-blue-600 uppercase mb-1 font-medium">Deadline mới</p>
                                        <p className="text-sm font-bold text-blue-700">{formatDeadlineShortVN(extendedDeadline)}</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-destructive text-center">
                                    ⚠️ Deadline gia hạn phải sau deadline gốc
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show existing extension (View mode or when already extended) */}
                    {!canEditDetails && hasExtension && (
                      <div className="rounded-xl bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200 p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <CalendarPlus className="w-5 h-5 text-blue-600" />
                          <span className="font-semibold text-blue-700">Task đã được gia hạn</span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {/* Original */}
                          <div className="flex-1 p-3 rounded-lg bg-white/80 dark:bg-background/50 text-center border">
                            <p className="text-[10px] text-muted-foreground uppercase mb-1">Deadline ban đầu</p>
                            <p className="text-sm font-semibold">{formatDeadlineShortVN(task?.deadline)}</p>
                          </div>
                          
                          {/* Extension badge */}
                          <div className="flex flex-col items-center shrink-0">
                            <div className="px-3 py-1.5 rounded-full bg-blue-500 text-white text-xs font-bold shadow-md">
                              {existingExtensionText}
                            </div>
                            <ArrowRight className="w-5 h-5 text-blue-500 mt-1" />
                          </div>
                          
                          {/* New deadline */}
                          <div className="flex-1 p-3 rounded-lg bg-blue-500/10 border-2 border-blue-500/40 text-center">
                            <p className="text-[10px] text-blue-600 uppercase mb-1 font-medium">Deadline hiện tại</p>
                            <p className="text-sm font-bold text-blue-700">{formatDeadlineShortVN(taskWithExtended.extended_deadline)}</p>
                          </div>
                        </div>
                        
                        {taskWithExtended.extended_at && (
                          <p className="text-xs text-muted-foreground mt-3 text-center">
                            Gia hạn lúc {format(new Date(taskWithExtended.extended_at), "HH:mm 'ngày' dd/MM/yyyy", { locale: vi })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Show existing extension in EDIT mode */}
                    {canEditDetails && hasExtension && showExtendSection && extendedDeadline && extensionInfo?.valid && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 border border-success/30">
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        <p className="text-sm text-success">
                          Gia hạn sẽ được lưu: {extensionInfo.text} từ deadline gốc
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
            
            {/* Right Column - Assignees (1/3) */}
            <div className="col-span-1 flex flex-col bg-muted/20">
              <div className="p-4 border-b bg-success/5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-success/10">
                    <Users className="w-4 h-4 text-success" />
                  </div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-success">Người phụ trách</h3>
                  {assignees.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {assignees.length} người
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                {canEditDetails ? (
                  <div className="space-y-2">
                    {members.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Chưa có thành viên</p>
                      </div>
                    ) : (
                      members.map((member) => (
                        <div 
                          key={member.id} 
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                            assignees.includes(member.user_id) 
                              ? 'bg-success/10 ring-2 ring-success/40 shadow-sm' 
                              : 'hover:bg-background border border-transparent hover:border-border'
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
                            checked={assignees.includes(member.user_id)}
                            className="h-5 w-5"
                          />
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                            {member.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{member.profiles?.full_name}</p>
                            <p className="text-xs text-muted-foreground">{member.profiles?.student_id}</p>
                          </div>
                          {member.role === 'leader' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-warning/10 text-warning border-warning/30 shrink-0">
                              Leader
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {task?.task_assignments && task.task_assignments.length > 0 ? (
                      task.task_assignments.map((assignment) => (
                        <div key={assignment.id} className="flex items-center gap-3 p-3 rounded-xl bg-success/5 border border-success/20">
                          <div className="w-9 h-9 rounded-full bg-success/20 flex items-center justify-center text-sm font-bold text-success">
                            {assignment.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium truncate">{assignment.profiles?.full_name}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Chưa có người được giao</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-3 shrink-0">
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
                  <CheckCircle2 className="w-4 h-4" />
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
