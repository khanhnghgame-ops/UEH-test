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
  Loader2, AlertTriangle, Eye, Calendar, Users, FileText, 
  Layers, Edit, Clock, HardDrive, CalendarPlus, ArrowRight,
  CheckCircle2, X, Plus
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
  const [extensionHours, setExtensionHours] = useState<number>(0);
  const [showExtendSection, setShowExtendSection] = useState(false);
  const [showAssigneesExpanded, setShowAssigneesExpanded] = useState(false);

  // Type for extended task
  const taskWithExtended = task as Task & { extended_deadline?: string; extended_at?: string; extended_by?: string };
  const originalDeadlineOverdue = isDeadlineOverdue(task?.deadline);
  const effectiveDeadline = taskWithExtended?.extended_deadline || task?.deadline;
  const isOverdue = isDeadlineOverdue(effectiveDeadline);
  const hasExtension = !!taskWithExtended?.extended_deadline;
  
  const isLeaderOrAdmin = isLeader || isAdmin;
  const canEditDetails = canEditProp && isLeaderOrAdmin;

  // Calculate existing extension hours from task
  const getExistingExtensionHours = () => {
    if (!task?.deadline || !taskWithExtended?.extended_deadline) return 0;
    const original = parseLocalDateTime(task.deadline);
    const extended = parseLocalDateTime(taskWithExtended.extended_deadline);
    if (!original || !extended) return 0;
    const diffMs = extended.getTime() - original.getTime();
    return Math.round(diffMs / (1000 * 60 * 60));
  };

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDeadline(task.deadline ? task.deadline.slice(0, 16) : '');
      setStageId(task.stage_id || '');
      setAssignees(task.task_assignments?.map(a => a.user_id) || []);
      const taskWithSize = task as Task & { max_file_size?: number };
      setMaxFileSize(taskWithSize.max_file_size || 10 * 1024 * 1024);
      
      const existingHours = getExistingExtensionHours();
      setExtensionHours(existingHours);
      setShowExtendSection(existingHours > 0);
    }
  }, [task]);

  // Calculate extended deadline from hours
  const calculateExtendedDeadline = () => {
    if (!deadline || extensionHours <= 0) return null;
    const original = parseLocalDateTime(deadline);
    if (!original) return null;
    const extended = new Date(original.getTime() + extensionHours * 60 * 60 * 1000);
    return extended;
  };

  const extendedDeadlineDate = calculateExtendedDeadline();

  // Format extension text
  const getExtensionText = (hours: number) => {
    if (hours <= 0) return '';
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    let text = '+';
    if (days > 0) text += `${days} ngày`;
    if (days > 0 && remainingHours > 0) text += ' ';
    if (remainingHours > 0) text += `${remainingHours} giờ`;
    return text;
  };

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
      
      const taskWithSize = task as Task & { max_file_size?: number };
      if (maxFileSize !== (taskWithSize.max_file_size || 10 * 1024 * 1024)) changes.push('giới hạn upload');
      
      const existingHours = getExistingExtensionHours();
      const newHours = showExtendSection ? extensionHours : 0;
      if (existingHours !== newHours) {
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

      // Handle extended deadline based on hours
      if (showExtendSection && extensionHours > 0 && extendedDeadlineDate) {
        // Format as ISO string but keep local time
        const year = extendedDeadlineDate.getFullYear();
        const month = String(extendedDeadlineDate.getMonth() + 1).padStart(2, '0');
        const day = String(extendedDeadlineDate.getDate()).padStart(2, '0');
        const hours = String(extendedDeadlineDate.getHours()).padStart(2, '0');
        const minutes = String(extendedDeadlineDate.getMinutes()).padStart(2, '0');
        updateData.extended_deadline = `${year}-${month}-${day}T${hours}:${minutes}`;
        
        if (!taskWithExtended.extended_deadline) {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[85vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${canEditDetails ? 'bg-primary/10' : 'bg-muted'}`}>
                {canEditDetails ? <Edit className="w-5 h-5 text-primary" /> : <Eye className="w-5 h-5 text-muted-foreground" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {canEditDetails ? 'Chỉnh sửa Task' : 'Chi tiết Task'}
                </DialogTitle>
                <DialogDescription className="text-xs">{task?.title}</DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasExtension && (
                <Badge className="gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs">
                  <CalendarPlus className="w-3 h-3" />Đã gia hạn
                </Badge>
              )}
              {isOverdue && (
                <Badge variant="destructive" className="gap-1 px-2 py-0.5 text-xs">
                  <AlertTriangle className="w-3 h-3" />Quá hạn
                </Badge>
              )}
              <Badge className={`${statusConfig.color} border px-2 py-0.5 gap-1 text-xs`}>
                <statusConfig.icon className="w-3 h-3" />
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        
        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-12 h-full">
            {/* Left Column (8 cols) */}
            <div className="col-span-8 p-4 overflow-y-auto border-r space-y-4">
              {/* Basic Info */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase">Thông tin cơ bản</span>
                </div>
                <div className="grid grid-cols-1 gap-3 pl-6">
                  <div>
                    <Label className="text-xs mb-1.5 block">Tên task {canEditDetails && <span className="text-destructive">*</span>}</Label>
                    {canEditDetails ? (
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nhập tên task..." className="h-9" />
                    ) : (
                      <div className="p-2 rounded-md bg-muted/50 border text-sm font-medium">{task?.title}</div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Mô tả</Label>
                    {canEditDetails ? (
                      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả công việc..." className="min-h-[80px] resize-none text-sm" />
                    ) : (
                      <div className="p-2 rounded-md bg-muted/50 border text-sm min-h-[60px]">
                        {task?.description || <span className="text-muted-foreground">Không có mô tả</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stage & Config */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-warning">
                  <Layers className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase">Giai đoạn & Cấu hình</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div>
                    <Label className="text-xs mb-1.5 block">Giai đoạn</Label>
                    {canEditDetails ? (
                      <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Chọn giai đoạn" /></SelectTrigger>
                        <SelectContent>
                          {stages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 rounded-md bg-muted/50 border text-sm">
                        {stages.find(s => s.id === task?.stage_id)?.name || 'Chưa phân giai đoạn'}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block flex items-center gap-1">
                      <HardDrive className="w-3 h-3" /> Giới hạn upload
                    </Label>
                    {canEditDetails ? (
                      <FileSizeLimitSelector value={maxFileSize} onChange={setMaxFileSize} />
                    ) : (
                      <div className="p-2 rounded-md bg-muted/50 border text-sm">{formatFileSizeMB(maxFileSize)}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Deadline & Extension */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-blue-600">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase">Deadline & Gia hạn</span>
                </div>
                <div className="pl-6 space-y-3">
                  {/* Original Deadline */}
                  <div>
                    <Label className="text-xs mb-1.5 block">Deadline ban đầu</Label>
                    {canEditDetails ? (
                      <DeadlineHourPicker value={deadline} onChange={setDeadline} placeholder="Chọn deadline..." />
                    ) : (
                      <div className={`p-2 rounded-md border text-sm ${originalDeadlineOverdue && !hasExtension ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-muted/50'}`}>
                        {task?.deadline ? formatDeadlineVN(task.deadline) : 'Không có deadline'}
                      </div>
                    )}
                  </div>

                  {/* Extension Section - Only for Edit mode with deadline */}
                  {canEditDetails && deadline && (
                    <div className="rounded-lg border-2 border-dashed border-blue-300/50 bg-blue-50/30 dark:bg-blue-950/20 p-3">
                      {!showExtendSection ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setShowExtendSection(true)}
                          className="w-full h-auto py-3 gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100/50"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="font-medium">Gia hạn deadline</span>
                        </Button>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CalendarPlus className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-semibold text-blue-600">Gia hạn deadline</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => { setShowExtendSection(false); setExtensionHours(0); }}
                              className="h-7 px-2 text-muted-foreground hover:text-destructive"
                            >
                              <X className="w-3 h-3 mr-1" />Hủy
                            </Button>
                          </div>

                          {/* Hours Input */}
                          <div>
                            <Label className="text-xs mb-1.5 block">Số giờ gia hạn thêm</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                value={extensionHours || ''}
                                onChange={(e) => setExtensionHours(Math.max(0, parseInt(e.target.value) || 0))}
                                placeholder="VD: 24"
                                className="h-9 w-32"
                              />
                              <span className="text-sm text-muted-foreground">giờ</span>
                              <div className="flex gap-1 ml-2">
                                {[6, 12, 24, 48, 72].map(h => (
                                  <Button
                                    key={h}
                                    type="button"
                                    variant={extensionHours === h ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setExtensionHours(h)}
                                    className="h-7 px-2 text-xs"
                                  >
                                    +{h}h
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Preview */}
                          {extensionHours > 0 && extendedDeadlineDate && (
                            <div className="rounded-lg bg-white dark:bg-background border-2 border-blue-200 p-3">
                              <p className="text-[10px] text-muted-foreground uppercase mb-2 font-medium">Tóm tắt gia hạn</p>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 p-2 rounded bg-muted/50 text-center">
                                  <p className="text-[9px] text-muted-foreground uppercase">Deadline gốc</p>
                                  <p className="text-xs font-semibold">{formatDeadlineShortVN(deadline)}</p>
                                </div>
                                <div className="flex flex-col items-center shrink-0">
                                  <div className="px-2 py-1 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                                    {getExtensionText(extensionHours)}
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5" />
                                </div>
                                <div className="flex-1 p-2 rounded bg-blue-500/10 border border-blue-500/30 text-center">
                                  <p className="text-[9px] text-blue-600 uppercase font-medium">Deadline mới</p>
                                  <p className="text-xs font-bold text-blue-700">
                                    {format(extendedDeadlineDate, "dd/MM – HH:mm", { locale: vi })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* View mode: Show existing extension */}
                  {!canEditDetails && hasExtension && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <CalendarPlus className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-semibold text-blue-700">Task đã được gia hạn</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 p-2 rounded bg-white/80 dark:bg-background/50 text-center border">
                          <p className="text-[9px] text-muted-foreground uppercase">Deadline gốc</p>
                          <p className="text-xs font-semibold">{formatDeadlineShortVN(task?.deadline)}</p>
                        </div>
                        <div className="flex flex-col items-center shrink-0">
                          <div className="px-2 py-1 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                            {getExtensionText(getExistingExtensionHours())}
                          </div>
                          <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5" />
                        </div>
                        <div className="flex-1 p-2 rounded bg-blue-500/10 border border-blue-500/30 text-center">
                          <p className="text-[9px] text-blue-600 uppercase font-medium">Deadline hiện tại</p>
                          <p className="text-xs font-bold text-blue-700">{formatDeadlineShortVN(taskWithExtended.extended_deadline)}</p>
                        </div>
                      </div>
                      {taskWithExtended.extended_at && (
                        <p className="text-[10px] text-muted-foreground mt-2 text-center">
                          Gia hạn lúc {format(new Date(taskWithExtended.extended_at), "HH:mm dd/MM/yyyy", { locale: vi })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Right Column - Assignees (4 cols) - Compact */}
            <div className="col-span-4 flex flex-col bg-muted/20">
              <div className="px-3 py-2 border-b bg-success/5">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-success" />
                  <span className="text-xs font-semibold uppercase text-success">Người phụ trách</span>
                  {assignees.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">{assignees.length}</Badge>
                  )}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2">
                {canEditDetails ? (
                  <>
                    {/* Summary View (Default - Collapsed) */}
                    {!showAssigneesExpanded ? (
                      <div className="space-y-1.5">
                        {/* Summary of selected assignees - compact chips */}
                        <div className="p-1.5 rounded-lg bg-background border min-h-[50px]">
                          {assignees.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground text-center py-1.5">Chưa chọn người phụ trách</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {assignees.slice(0, 6).map(userId => {
                                const member = members.find(m => m.user_id === userId);
                                return member ? (
                                  <div key={userId} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 border border-success/30">
                                    <div className="w-4 h-4 rounded-full bg-success/20 flex items-center justify-center text-[7px] font-bold text-success shrink-0">
                                      {member.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <span className="text-[9px] font-medium truncate max-w-[50px]">{member.profiles?.full_name?.split(' ').pop()}</span>
                                  </div>
                                ) : null;
                              })}
                              {assignees.length > 6 && (
                                <div className="flex items-center px-1.5 py-0.5 rounded-full bg-muted border text-[8px] text-muted-foreground">
                                  +{assignees.length - 6}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Expand Button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAssigneesExpanded(true)}
                          className="w-full h-6 gap-1 text-[10px]"
                        >
                          <Edit className="w-3 h-3" />
                          Chỉnh sửa
                        </Button>
                      </div>
                    ) : (
                      /* Expanded View (Full List) - Compact */
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground">Chọn thành viên:</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAssigneesExpanded(false)}
                            className="h-5 px-1 text-[9px] text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-2.5 h-2.5 mr-0.5" />Gọn
                          </Button>
                        </div>
                        <div className="space-y-0.5 max-h-[260px] overflow-y-auto">
                          {members.length === 0 ? (
                            <div className="text-center py-3 text-muted-foreground">
                              <Users className="w-5 h-5 mx-auto mb-1 opacity-30" />
                              <p className="text-[9px]">Chưa có thành viên</p>
                            </div>
                          ) : (
                            members.map((member) => (
                              <div 
                                key={member.id} 
                                className={`flex items-center gap-1 p-1 rounded-md cursor-pointer transition-all ${
                                  assignees.includes(member.user_id) 
                                    ? 'bg-success/10 ring-1 ring-success/40' 
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
                                <Checkbox checked={assignees.includes(member.user_id)} className="h-3 w-3" />
                                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[7px] font-bold text-primary shrink-0">
                                  {member.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-medium truncate">{member.profiles?.full_name}</p>
                                  <p className="text-[8px] text-muted-foreground">{member.profiles?.student_id}</p>
                                </div>
                                {member.role === 'leader' && (
                                  <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-warning/10 text-warning border-warning/30 shrink-0">
                                    L
                                  </Badge>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* View-only mode - Compact */
                  <div className="space-y-0.5">
                    {task?.task_assignments && task.task_assignments.length > 0 ? (
                      task.task_assignments.map((assignment) => (
                        <div key={assignment.id} className="flex items-center gap-1.5 p-1 rounded-md bg-success/5 border border-success/20">
                          <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center text-[8px] font-bold text-success">
                            {assignment.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[10px] font-medium truncate">{assignment.profiles?.full_name}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-3 text-muted-foreground">
                        <Users className="w-5 h-5 mx-auto mb-1 opacity-30" />
                        <p className="text-[9px]">Chưa có người được giao</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 border-t bg-muted/30 gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-9 min-w-20">
            {canEditDetails ? 'Hủy' : 'Đóng'}
          </Button>
          {canEditDetails && (
            <Button onClick={handleSave} disabled={isLoading} className="h-9 min-w-28 gap-2">
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Đang lưu...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" />Lưu thay đổi</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
