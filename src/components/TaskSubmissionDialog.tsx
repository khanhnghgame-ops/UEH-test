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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Plus, 
  Trash2, 
  ExternalLink, 
  Lock, 
  Send,
  Clock,
  User,
  FileText,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Target,
  Users,
  Link as LinkIcon,
  MessageSquare,
  Info,
  ChevronDown
} from 'lucide-react';
import type { Task, TaskStatus } from '@/types/database';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface SubmissionLink {
  id?: string;
  title: string;
  url: string;
}

interface TaskSubmissionDialogProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  isAssignee: boolean;
  isLeaderInGroup: boolean;
}

export default function TaskSubmissionDialog({
  task,
  isOpen,
  onClose,
  onSave,
  isAssignee,
  isLeaderInGroup,
}: TaskSubmissionDialogProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [submissionLinks, setSubmissionLinks] = useState<SubmissionLink[]>([]);
  const [note, setNote] = useState('');
  const [taskAssignees, setTaskAssignees] = useState<string[]>([]);

  // Check if task is overdue
  const isOverdue = task?.deadline ? new Date(task.deadline) < new Date() : false;
  
  // Permission logic
  const canSubmit = isLeaderInGroup || (isAssignee && !isOverdue);
  const isSubmittingOnBehalf = isLeaderInGroup && !isAssignee && isOverdue;

  useEffect(() => {
    if (task && isOpen) {
      setStatus(task.status);
      setNote('');
      
      // Parse submission links
      try {
        const links = task.submission_link ? JSON.parse(task.submission_link) : [];
        setSubmissionLinks(Array.isArray(links) ? links : [{ title: 'Bài nộp', url: task.submission_link }]);
      } catch {
        setSubmissionLinks(task.submission_link ? [{ title: 'Bài nộp', url: task.submission_link }] : []);
      }
      
      // Extract assignee names
      if (task.task_assignments) {
        const names = task.task_assignments.map((a: any) => a.profiles?.full_name || 'Unknown');
        setTaskAssignees(names);
      }
    }
  }, [task, isOpen]);

  const addSubmissionLink = () => {
    setSubmissionLinks([...submissionLinks, { title: '', url: '' }]);
  };

  const removeSubmissionLink = (index: number) => {
    setSubmissionLinks(submissionLinks.filter((_, i) => i !== index));
  };

  const updateSubmissionLink = (index: number, field: 'title' | 'url', value: string) => {
    const updated = [...submissionLinks];
    updated[index][field] = value;
    setSubmissionLinks(updated);
  };

  const getStatusConfig = (status: TaskStatus) => {
    switch (status) {
      case 'TODO':
        return { label: 'Chờ làm', color: 'bg-muted text-muted-foreground', icon: AlertCircle };
      case 'IN_PROGRESS':
        return { label: 'Đang làm', color: 'bg-warning/10 text-warning border-warning/50', icon: Clock };
      case 'DONE':
        return { label: 'Hoàn thành', color: 'bg-primary/10 text-primary border-primary/50', icon: CheckCircle2 };
      case 'VERIFIED':
        return { label: 'Đã duyệt', color: 'bg-success/10 text-success border-success/50', icon: CheckCircle2 };
      default:
        return { label: status, color: 'bg-muted', icon: AlertCircle };
    }
  };

  const handleSubmit = async () => {
    if (!task || !canSubmit) return;
    
    const validLinks = submissionLinks.filter(l => l.url.trim());
    if (validLinks.length === 0) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng thêm ít nhất 1 liên kết nộp bài',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const submissionLinkJson = JSON.stringify(validLinks);
      const now = new Date();
      const isLateSubmission = task.deadline && now > new Date(task.deadline);

      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          status,
          submission_link: submissionLinkJson,
        })
        .eq('id', task.id);

      if (taskError) throw taskError;

      const { error: historyError } = await supabase
        .from('submission_history')
        .insert({
          task_id: task.id,
          user_id: user!.id,
          submission_link: submissionLinkJson,
          note: note.trim() || (isSubmittingOnBehalf ? 'Leader nộp thay' : null),
        });

      if (historyError) throw historyError;

      const actionType = isLateSubmission ? 'LATE_SUBMISSION' : 'SUBMISSION';
      const lateHours = isLateSubmission 
        ? Math.round((now.getTime() - new Date(task.deadline!).getTime()) / (1000 * 60 * 60))
        : 0;

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: profile?.full_name || user?.email || 'Unknown',
        action: actionType,
        action_type: 'task',
        description: isSubmittingOnBehalf 
          ? `Leader nộp thay cho task "${task.title}"${isLateSubmission ? ` (trễ ${lateHours} giờ)` : ''}`
          : isLateSubmission 
            ? `Nộp bài trễ ${lateHours} giờ cho task "${task.title}"`
            : `Nộp bài đúng hạn cho task "${task.title}"`,
        group_id: task.group_id,
        metadata: { 
          task_id: task.id, 
          task_title: task.title, 
          deadline: task.deadline,
          is_late: isLateSubmission,
          late_hours: lateHours,
          submitted_by_leader: isSubmittingOnBehalf
        }
      });

      toast({
        title: 'Nộp bài thành công',
        description: isLateSubmission ? 'Bài nộp đã được ghi nhận (trễ hạn)' : 'Bài nộp đã được ghi nhận',
      });
      
      onSave();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể nộp bài',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const statusConfig = task ? getStatusConfig(task.status) : getStatusConfig('TODO');
  const StatusIcon = statusConfig.icon;

  // Calculate time remaining or overdue
  const getTimeStatus = () => {
    if (!task?.deadline) return null;
    const now = new Date();
    const deadline = new Date(task.deadline);
    const diff = deadline.getTime() - now.getTime();
    
    if (diff < 0) {
      const hours = Math.abs(Math.round(diff / (1000 * 60 * 60)));
      if (hours < 24) return { text: `Quá hạn ${hours} giờ`, isOverdue: true };
      const days = Math.round(hours / 24);
      return { text: `Quá hạn ${days} ngày`, isOverdue: true };
    } else {
      const hours = Math.round(diff / (1000 * 60 * 60));
      if (hours < 24) return { text: `Còn ${hours} giờ`, isOverdue: false };
      const days = Math.round(hours / 24);
      return { text: `Còn ${days} ngày`, isOverdue: false };
    }
  };

  const timeStatus = getTimeStatus();

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* Header - Compact */}
        <DialogHeader className="px-5 py-4 border-b bg-muted/30 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg font-bold break-words">
                  {task?.title}
                </DialogTitle>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge className={`${statusConfig.color} gap-1 border text-xs px-2 py-0.5`}>
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
              </Badge>
              {timeStatus && (
                <Badge 
                  variant={timeStatus.isOverdue ? "destructive" : "secondary"}
                  className="gap-1 text-[10px] px-1.5 py-0"
                >
                  <Clock className="w-2.5 h-2.5" />
                  {timeStatus.text}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Alert badges */}
          {(isOverdue || isSubmittingOnBehalf) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {isOverdue && !isLeaderInGroup && (
                <Badge variant="outline" className="gap-1 border-destructive text-destructive text-xs">
                  <Lock className="w-3 h-3" />
                  Đã quá deadline - Chỉ Leader được nộp thay
                </Badge>
              )}
              {isSubmittingOnBehalf && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <User className="w-3 h-3" />
                  Bạn đang nộp thay cho thành viên
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>
        
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5 space-y-4">
            {/* Task Description Section - Expandable */}
            {task?.description && (
              <Card className="border border-primary/20">
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-primary" />
                      Mô tả công việc
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                      className="gap-1 text-xs h-7 px-2"
                    >
                      {isDescriptionExpanded ? 'Thu gọn' : 'Xem thêm'}
                      <ChevronDown className={`w-3 h-3 transition-transform ${isDescriptionExpanded ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className={`text-sm text-muted-foreground whitespace-pre-wrap break-words ${
                    isDescriptionExpanded ? '' : 'line-clamp-2'
                  }`}>
                    {task.description}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Task Info - Compact Row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Deadline */}
              <div className={`flex items-center gap-2 p-3 rounded-lg border ${isOverdue ? 'bg-destructive/5 border-destructive/30' : 'bg-muted/50'}`}>
                <Calendar className={`w-4 h-4 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Deadline</p>
                  {task?.deadline ? (
                    <p className={`text-sm font-medium truncate ${isOverdue ? 'text-destructive' : ''}`}>
                      {format(new Date(task.deadline), "dd/MM/yyyy HH:mm", { locale: vi })}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Không có</p>
                  )}
                </div>
              </div>

              {/* Assignees */}
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Thực hiện</p>
                  {taskAssignees.length > 0 ? (
                    <p className="text-sm font-medium truncate" title={taskAssignees.join(', ')}>
                      {taskAssignees.length > 1 
                        ? `${taskAssignees[0]} +${taskAssignees.length - 1}`
                        : taskAssignees[0]}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Chưa giao</p>
                  )}
                </div>
              </div>
            </div>

            {/* Status Select */}
            {canSubmit && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-primary" />
                  Trạng thái
                </Label>
                <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                  <SelectTrigger className="h-10">
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
                    {isLeaderInGroup && (
                      <SelectItem value="VERIFIED">
                        <span className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-success" />
                          Đã duyệt
                        </span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Submission Links */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-primary" />
                  Liên kết nộp bài
                </Label>
                {canSubmit && (
                  <Button type="button" variant="outline" size="sm" onClick={addSubmissionLink} className="gap-1 h-7 text-xs">
                    <Plus className="w-3 h-3" />
                    Thêm
                  </Button>
                )}
              </div>
              
              {submissionLinks.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-lg bg-muted/30">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Chưa có liên kết</p>
                  {canSubmit && (
                    <Button variant="link" size="sm" onClick={addSubmissionLink} className="mt-1 text-xs h-6">
                      Thêm liên kết
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {submissionLinks.map((link, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                      <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
                        <Input
                          placeholder="Tiêu đề"
                          value={link.title}
                          onChange={(e) => updateSubmissionLink(index, 'title', e.target.value)}
                          disabled={!canSubmit}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="URL"
                          value={link.url}
                          onChange={(e) => updateSubmissionLink(index, 'url', e.target.value)}
                          disabled={!canSubmit}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {link.url && (
                          <a href={link.url} target="_blank" rel="noopener noreferrer">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        )}
                        {canSubmit && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => removeSubmissionLink(index)}
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Note */}
            {canSubmit && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  Ghi chú
                  <span className="text-[10px] text-muted-foreground font-normal">(tùy chọn)</span>
                </Label>
                <Textarea
                  placeholder="Thêm ghi chú cho lần nộp bài này..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t bg-muted/30 gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} size="sm">
            Đóng
          </Button>
          {canSubmit && (
            <Button onClick={handleSubmit} disabled={isLoading} size="sm" className="gap-1.5">
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Đang nộp...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  {isSubmittingOnBehalf ? 'Nộp thay' : 'Nộp bài'}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}