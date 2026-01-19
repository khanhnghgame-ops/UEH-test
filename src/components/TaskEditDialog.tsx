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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  CheckCircle2, X, Plus, Settings
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
  const [activeTab, setActiveTab] = useState('basic');
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [stageId, setStageId] = useState<string>('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [maxFileSize, setMaxFileSize] = useState<number>(10 * 1024 * 1024);
  const [extensionHours, setExtensionHours] = useState<number>(0);

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
      setExtensionHours(getExistingExtensionHours());
      setActiveTab('basic');
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
      if (existingHours !== extensionHours) {
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
      if (extensionHours > 0 && extendedDeadlineDate) {
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
      <DialogContent className="max-w-[95vw] w-[1280px] h-[720px] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-3 border-b bg-gradient-to-r from-primary/10 to-transparent shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${canEditDetails ? 'bg-primary/20 border border-primary/30' : 'bg-muted'}`}>
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
        
        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b bg-muted/30 px-6 shrink-0">
            <TabsList className="h-11 bg-transparent gap-1 p-0">
              <TabsTrigger 
                value="basic" 
                className="h-9 px-4 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <FileText className="w-4 h-4" />
                <span className="font-medium">Thông tin chính</span>
              </TabsTrigger>
              <TabsTrigger 
                value="description" 
                className="h-9 px-4 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <Edit className="w-4 h-4" />
                <span className="font-medium">Mô tả chi tiết</span>
              </TabsTrigger>
              <TabsTrigger 
                value="assignees" 
                className="h-9 px-4 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <Users className="w-4 h-4" />
                <span className="font-medium">Người phụ trách</span>
                {assignees.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{assignees.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {/* Tab 1: Thông tin chính */}
            <TabsContent value="basic" className="h-full m-0 data-[state=inactive]:hidden">
              <ScrollArea className="h-full">
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column - Basic Info */}
                    <div className="space-y-5">
                      {/* Task Title */}
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
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
                          <div className="p-3 rounded-lg bg-muted/50 border text-base font-medium">{task?.title}</div>
                        )}
                      </div>

                      {/* Stage */}
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2">
                          <Layers className="w-4 h-4 text-warning" />
                          Giai đoạn
                        </Label>
                        {canEditDetails ? (
                          <Select value={stageId} onValueChange={setStageId}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Chọn giai đoạn" /></SelectTrigger>
                            <SelectContent>
                              {stages.map((stage) => (
                                <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="p-3 rounded-lg bg-muted/50 border">
                            {stages.find(s => s.id === task?.stage_id)?.name || 'Chưa phân giai đoạn'}
                          </div>
                        )}
                      </div>

                      {/* Upload Limit */}
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-emerald-500" />
                          Giới hạn upload
                        </Label>
                        {canEditDetails ? (
                          <FileSizeLimitSelector value={maxFileSize} onChange={setMaxFileSize} />
                        ) : (
                          <div className="p-3 rounded-lg bg-muted/50 border">{formatFileSizeMB(maxFileSize)}</div>
                        )}
                      </div>
                    </div>

                    {/* Right Column - Deadline & Extension */}
                    <div className="space-y-5">
                      {/* Deadline */}
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          Deadline ban đầu
                        </Label>
                        {canEditDetails ? (
                          <DeadlineHourPicker value={deadline} onChange={setDeadline} placeholder="Chọn deadline..." />
                        ) : (
                          <div className={`p-3 rounded-lg border ${originalDeadlineOverdue && !hasExtension ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-muted/50'}`}>
                            {task?.deadline ? formatDeadlineVN(task.deadline) : 'Không có deadline'}
                          </div>
                        )}
                      </div>

                      {/* Extension Section */}
                      {canEditDetails && deadline && (
                        <div className="rounded-xl border-2 border-dashed border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CalendarPlus className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-bold text-blue-700">Gia hạn Deadline</span>
                            </div>
                            {extensionHours > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setExtensionHours(0)}
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              >
                                <X className="w-3 h-3 mr-1" />Xóa gia hạn
                              </Button>
                            )}
                          </div>

                          {/* Hours Input */}
                          <div className="space-y-2">
                            <Label className="text-xs">Số giờ gia hạn thêm</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                value={extensionHours || ''}
                                onChange={(e) => setExtensionHours(Math.max(0, parseInt(e.target.value) || 0))}
                                placeholder="0"
                                className="h-10 w-24"
                              />
                              <span className="text-sm text-muted-foreground">giờ</span>
                              <div className="flex gap-1 ml-auto flex-wrap">
                                {[6, 12, 24, 48, 72].map(h => (
                                  <Button
                                    key={h}
                                    type="button"
                                    variant={extensionHours === h ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setExtensionHours(h)}
                                    className="h-8 px-2 text-xs"
                                  >
                                    +{h}h
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Preview */}
                          {extensionHours > 0 && extendedDeadlineDate && (
                            <div className="rounded-lg bg-white dark:bg-background border-2 border-blue-300 p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 text-center">
                                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Deadline gốc</p>
                                  <p className="text-sm font-semibold">{formatDeadlineShortVN(deadline)}</p>
                                </div>
                                <div className="flex flex-col items-center shrink-0">
                                  <Badge className="bg-blue-500 text-white text-xs px-2">
                                    {getExtensionText(extensionHours)}
                                  </Badge>
                                  <ArrowRight className="w-4 h-4 text-blue-500 mt-1" />
                                </div>
                                <div className="flex-1 text-center bg-blue-500/10 rounded-lg p-2 border border-blue-500/30">
                                  <p className="text-[10px] text-blue-600 uppercase mb-1">Deadline mới</p>
                                  <p className="text-sm font-bold text-blue-700">
                                    {format(extendedDeadlineDate, "dd/MM/yyyy – HH:mm", { locale: vi })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* View mode: Show existing extension */}
                      {!canEditDetails && hasExtension && (
                        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <CalendarPlus className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-bold text-blue-700">Task đã được gia hạn</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 text-center p-2 rounded bg-white/80 dark:bg-background/50 border">
                              <p className="text-[10px] text-muted-foreground uppercase">Deadline gốc</p>
                              <p className="text-sm font-semibold">{formatDeadlineShortVN(task?.deadline)}</p>
                            </div>
                            <div className="flex flex-col items-center shrink-0">
                              <Badge className="bg-blue-500 text-white text-xs px-2">
                                {getExtensionText(getExistingExtensionHours())}
                              </Badge>
                              <ArrowRight className="w-4 h-4 text-blue-500 mt-1" />
                            </div>
                            <div className="flex-1 text-center p-2 rounded bg-blue-500/10 border border-blue-500/30">
                              <p className="text-[10px] text-blue-600 uppercase">Deadline hiện tại</p>
                              <p className="text-sm font-bold text-blue-700">{formatDeadlineShortVN(taskWithExtended.extended_deadline)}</p>
                            </div>
                          </div>
                          {taskWithExtended.extended_at && (
                            <p className="text-xs text-muted-foreground mt-3 text-center">
                              Gia hạn lúc {format(new Date(taskWithExtended.extended_at), "HH:mm dd/MM/yyyy", { locale: vi })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Tab 2: Mô tả chi tiết */}
            <TabsContent value="description" className="h-full m-0 data-[state=inactive]:hidden">
              <div className="h-full p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <Edit className="w-5 h-5 text-primary" />
                  <Label className="text-base font-bold">Mô tả công việc</Label>
                </div>
                {canEditDetails ? (
                  <Textarea 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    placeholder="Nhập mô tả chi tiết về task này..."
                    className="flex-1 min-h-0 text-base resize-none"
                  />
                ) : (
                  <div className="flex-1 p-4 rounded-lg bg-muted/50 border overflow-auto">
                    {task?.description ? (
                      <p className="text-base whitespace-pre-wrap">{task.description}</p>
                    ) : (
                      <p className="text-muted-foreground">Không có mô tả</p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 3: Người phụ trách */}
            <TabsContent value="assignees" className="h-full m-0 data-[state=inactive]:hidden">
              <div className="h-full p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-success" />
                    <Label className="text-base font-bold">Người phụ trách</Label>
                    {assignees.length > 0 && (
                      <Badge variant="secondary">{assignees.length} đã chọn</Badge>
                    )}
                  </div>
                  {canEditDetails && members.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAssignees(members.map(m => m.user_id))}
                        className="text-xs"
                      >
                        Chọn tất cả
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAssignees([])}
                        className="text-xs"
                      >
                        Bỏ chọn tất cả
                      </Button>
                    </div>
                  )}
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                    {members.length === 0 ? (
                      <div className="col-span-full text-center py-12 text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Chưa có thành viên trong project</p>
                      </div>
                    ) : canEditDetails ? (
                      members.map((member) => (
                        <div 
                          key={member.id} 
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border-2 ${
                            assignees.includes(member.user_id) 
                              ? 'bg-success/10 border-success/40' 
                              : 'hover:bg-muted/50 border-transparent hover:border-border'
                          }`}
                          onClick={() => {
                            if (assignees.includes(member.user_id)) {
                              setAssignees(assignees.filter(id => id !== member.user_id));
                            } else {
                              setAssignees([...assignees, member.user_id]);
                            }
                          }}
                        >
                          <Checkbox checked={assignees.includes(member.user_id)} className="h-5 w-5" />
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                            {member.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{member.profiles?.full_name}</p>
                            <p className="text-xs text-muted-foreground">{member.profiles?.student_id}</p>
                          </div>
                          {member.role === 'leader' && (
                            <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30 shrink-0">
                              Leader
                            </Badge>
                          )}
                        </div>
                      ))
                    ) : (
                      task?.task_assignments && task.task_assignments.length > 0 ? (
                        task.task_assignments.map((assignment) => (
                          <div key={assignment.id} className="flex items-center gap-3 p-3 rounded-lg bg-success/5 border border-success/20">
                            <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-sm font-bold text-success">
                              {assignment.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{assignment.profiles?.full_name}</p>
                              <p className="text-xs text-muted-foreground">{assignment.profiles?.student_id}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full text-center py-12 text-muted-foreground">
                          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>Chưa có người được giao</p>
                        </div>
                      )
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-10 min-w-24">
            {canEditDetails ? 'Hủy' : 'Đóng'}
          </Button>
          {canEditDetails && (
            <Button onClick={handleSave} disabled={isLoading} className="h-10 min-w-32 gap-2">
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
