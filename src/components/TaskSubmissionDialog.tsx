import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Loader2, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Send,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Target,
  Users,
  Link as LinkIcon,
  MessageSquare,
  AlertTriangle,
  Upload,
  FileText,
  MessagesSquare
} from 'lucide-react';
import type { Task, TaskStatus } from '@/types/database';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { parseLocalDateTime } from '@/lib/datetime';
import MultiFileUploadSubmission, { UploadedFile } from './MultiFileUploadSubmission';
import { notifyTaskSubmitted, notifyTaskVerified } from '@/lib/notifications';
import TaskComments from './communication/TaskComments';
import CompactTaskNotes from './CompactTaskNotes';

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

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
  const [activeTab, setActiveTab] = useState('requirements');
  
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [submissionLinks, setSubmissionLinks] = useState<SubmissionLink[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [note, setNote] = useState('');
  const [taskAssignees, setTaskAssignees] = useState<string[]>([]);
  const [showLateWarning, setShowLateWarning] = useState(false);

  // Get max file size from task (cast since not in types yet)
  const taskWithSize = task as (Task & { max_file_size?: number }) | null;
  const maxFileSize = taskWithSize?.max_file_size || DEFAULT_MAX_FILE_SIZE;

  const deadlineDate = task?.deadline ? parseLocalDateTime(task.deadline) : null;

  // Check if task is overdue
  const isOverdue = !!deadlineDate && deadlineDate.getTime() < Date.now();
  // Check if this is a resubmission (has existing submission link)
  const hasExistingSubmission = !!task?.submission_link;
  
  // Permission logic
  const canSubmit = isAssignee || isLeaderInGroup;
  const isSubmittingOnBehalf = isLeaderInGroup && !isAssignee;

  // Calculate submission stats
  const validLinksCount = submissionLinks.filter(l => l.url?.trim()).length;
  const filesCount = uploadedFiles.length;
  const totalFileSize = uploadedFiles.reduce((sum, f) => sum + f.file_size, 0);
  const hasContent = filesCount > 0 || validLinksCount > 0;

  useEffect(() => {
    if (task && isOpen) {
      setStatus(task.status);
      setNote('');
      setUploadedFiles([]);
      setSubmissionLinks([]);
      setActiveTab('requirements'); // Reset to default tab when opening
      
      try {
        const parsed = task.submission_link ? JSON.parse(task.submission_link) : [];
        if (Array.isArray(parsed)) {
          // Separate links and files
          const links: SubmissionLink[] = [];
          const files: UploadedFile[] = [];
          
          parsed.forEach((item: any) => {
            if (item.file_path) {
              files.push({
                file_path: item.file_path,
                file_name: item.file_name || 'file',
                file_size: item.file_size || 0,
                storage_name: item.storage_name || ''
              });
            } else if (item.url) {
              links.push({
                title: item.title || '',
                url: item.url
              });
            }
          });
          
          setSubmissionLinks(links);
          setUploadedFiles(files);
        } else {
          // Legacy: plain string URL
          setSubmissionLinks([{ title: 'Bài nộp', url: task.submission_link }]);
        }
      } catch {
        if (task.submission_link) {
          setSubmissionLinks([{ title: 'Bài nộp', url: task.submission_link }]);
        }
      }
      
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

  const handleSubmitClick = () => {
    if (!task || !canSubmit) return;
    
    if (!hasContent) {
      toast({
        title: 'Chưa có nội dung nộp',
        description: 'Vui lòng thêm ít nhất 1 file hoặc 1 liên kết để nộp bài.',
        variant: 'destructive',
      });
      return;
    }

    const now = new Date();
    const isLateSubmission = !!deadlineDate && now > deadlineDate;
    
    if (hasExistingSubmission && isLateSubmission) {
      setShowLateWarning(true);
      return;
    }

    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!task || !canSubmit) return;
    
    setIsLoading(true);

    try {
      const now = new Date();
      const isLateSubmission = !!deadlineDate && now > deadlineDate;

      // Check if this is a status change to VERIFIED
      const isVerifying = status === 'VERIFIED' && task.status !== 'VERIFIED';

      // Build combined submission data (links + files)
      const allSubmissions: any[] = [];
      
      // Add valid links
      const validLinks = submissionLinks.filter(l => l.url?.trim());
      validLinks.forEach(link => {
        allSubmissions.push({
          title: link.title || 'Link',
          url: link.url,
          type: 'link'
        });
      });
      
      // Add files
      uploadedFiles.forEach(file => {
        allSubmissions.push({
          title: file.file_name,
          file_path: file.file_path,
          file_name: file.file_name,
          file_size: file.file_size,
          storage_name: file.storage_name,
          type: 'file'
        });
      });

      const submissionLinkJson = JSON.stringify(allSubmissions);

      // Update task
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          status,
          submission_link: submissionLinkJson,
        })
        .eq('id', task.id);

      if (taskError) throw taskError;

      // Determine submission type for history: 'file', 'link', or 'mixed'
      const hasFiles = uploadedFiles.length > 0;
      const hasLinks = validLinks.length > 0;
      let historyType: 'file' | 'link' | 'mixed' = 'link';
      if (hasFiles && hasLinks) {
        historyType = 'mixed';
      } else if (hasFiles) {
        historyType = 'file';
      } else {
        historyType = 'link';
      }

      // Save to submission history
      const { error: historyError } = await supabase
        .from('submission_history')
        .insert({
          task_id: task.id,
          user_id: user!.id,
          submission_link: submissionLinkJson,
          note: note.trim() || (isSubmittingOnBehalf ? 'Leader nộp thay' : null),
          submission_type: historyType,
          file_path: hasFiles ? uploadedFiles[0].file_path : null,
          file_name: hasFiles ? uploadedFiles[0].file_name : null,
          file_size: hasFiles ? uploadedFiles[0].file_size : null
        });

      if (historyError) throw historyError;

      const actionType = isLateSubmission ? 'LATE_SUBMISSION' : 'SUBMISSION';
      const lateHours = isLateSubmission && deadlineDate
        ? Math.round((now.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60))
        : 0;

      // Get leader IDs for notification
      const { data: groupMembers } = await supabase
        .from('group_members')
        .select('user_id, role')
        .eq('group_id', task.group_id);
      
      const leaderIds = groupMembers
        ?.filter(m => m.role === 'leader' && m.user_id !== user?.id)
        .map(m => m.user_id) || [];

      const submitterName = profile?.full_name || user?.email || 'Thành viên';

      // Notify leaders about submission
      if (leaderIds.length > 0 && !isSubmittingOnBehalf) {
        await notifyTaskSubmitted({
          leaderIds,
          submitterName,
          taskTitle: task.title,
          taskId: task.id,
          groupId: task.group_id,
          isLate: isLateSubmission,
        });
      }

      // If task is being verified, notify assignees
      if (isVerifying) {
        const assigneeIds = task.task_assignments
          ?.map((a: any) => a.user_id)
          .filter((id: string) => id !== user?.id) || [];
        
        if (assigneeIds.length > 0) {
          await notifyTaskVerified({
            assigneeIds,
            leaderName: submitterName,
            taskTitle: task.title,
            taskId: task.id,
            groupId: task.group_id,
          });
        }
      }

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: submitterName,
        action: isVerifying ? 'VERIFY_TASK' : actionType,
        action_type: 'task',
        description: isVerifying
          ? `Đã duyệt task "${task.title}"`
          : isSubmittingOnBehalf 
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
          submitted_by_leader: isSubmittingOnBehalf,
          files_count: uploadedFiles.length,
          links_count: validLinks.length,
          is_verified: isVerifying,
        }
      });

      toast({
        title: isVerifying ? 'Đã duyệt task' : 'Nộp bài thành công',
        description: isVerifying 
          ? 'Task đã được đánh dấu hoàn thành'
          : isLateSubmission 
            ? 'Bài nộp đã được ghi nhận (trễ hạn)' 
            : 'Bài nộp đã được ghi nhận',
      });
      
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Submission error:', error);
      toast({
        title: 'Không thể nộp bài',
        description: 'Hệ thống chưa ghi nhận được bài nộp. Vui lòng thử lại. Nếu vẫn lỗi, báo admin.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const statusConfig = task ? getStatusConfig(task.status) : getStatusConfig('TODO');
  const StatusIcon = statusConfig.icon;

  const getTimeStatus = () => {
    if (!deadlineDate) return null;
    const now = new Date();
    const deadline = deadlineDate;
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[1280px] h-[720px] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* Header with task info */}
        <DialogHeader className="px-6 py-3 border-b bg-gradient-to-r from-primary/10 to-transparent shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg font-bold truncate">{task?.title || 'Task'}</DialogTitle>
                <DialogDescription className="text-xs mt-0.5 truncate">
                  {task?.description ? task.description.substring(0, 80) + (task.description.length > 80 ? '...' : '') : 'Xem yêu cầu task và nộp bài'}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSubmittingOnBehalf && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <User className="w-3 h-3" />
                  Nộp thay
                </Badge>
              )}
              {timeStatus && (
                <Badge 
                  variant={timeStatus.isOverdue ? "destructive" : "secondary"}
                  className="gap-1 text-xs"
                >
                  <Clock className="w-3 h-3" />
                  {timeStatus.text}
                </Badge>
              )}
              <Badge className={`${statusConfig.color} gap-1 border text-xs`}>
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        
        {/* Tab Navigation - Fixed horizontal menu */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b bg-muted/30 px-6 shrink-0">
            <TabsList className="h-12 bg-transparent gap-1 p-0">
              <TabsTrigger 
                value="requirements" 
                className="h-10 px-5 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary transition-all"
              >
                <FileText className="w-4 h-4" />
                <span className="font-medium">Yêu cầu task</span>
              </TabsTrigger>
              <TabsTrigger 
                value="discussion" 
                className="h-10 px-5 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary transition-all"
              >
                <MessagesSquare className="w-4 h-4" />
                <span className="font-medium">Trao đổi</span>
              </TabsTrigger>
              <TabsTrigger 
                value="submit" 
                className="h-10 px-5 gap-2 rounded-b-none border-b-2 border-transparent transition-all
                  data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:border-primary
                  data-[state=inactive]:bg-primary/10 data-[state=inactive]:text-primary data-[state=inactive]:hover:bg-primary/20
                  animate-pulse data-[state=active]:animate-none"
              >
                <Send className="w-4 h-4" />
                <span className="font-bold">Nộp bài</span>
                {hasContent && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-background/80">
                    {filesCount + validLinksCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content - Scrollable per page */}
          <div className="flex-1 overflow-hidden">
            {/* Tab 1: Yêu cầu Task */}
            <TabsContent value="requirements" className="h-full m-0 data-[state=inactive]:hidden">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
                  {/* Task Title & Description */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tiêu đề</Label>
                      <h2 className="text-xl font-bold text-foreground mt-1">{task?.title}</h2>
                    </div>
                    
                    {task?.description && (
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Mô tả & Yêu cầu</Label>
                        <div className="mt-2 p-4 rounded-xl bg-muted/30 border border-border/50">
                          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{task.description}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Deadline Card */}
                    <div className={`p-4 rounded-xl border ${isOverdue ? 'border-destructive/30 bg-destructive/5' : 'border-border/50 bg-muted/20'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className={`w-4 h-4 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`} />
                        <span className={`text-xs font-medium uppercase ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>Thời hạn</span>
                      </div>
                      {deadlineDate ? (
                        <div>
                          <p className={`text-base font-semibold ${isOverdue ? 'text-destructive' : 'text-foreground'}`}>
                            {format(deadlineDate, "dd/MM/yyyy", { locale: vi })}
                          </p>
                          <p className={`text-sm ${isOverdue ? 'text-destructive/70' : 'text-muted-foreground'}`}>
                            {format(deadlineDate, "HH:mm", { locale: vi })}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Không có</p>
                      )}
                    </div>

                    {/* Assignees Card */}
                    <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase">Thực hiện</span>
                      </div>
                      {taskAssignees.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {taskAssignees.map((name, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs py-0.5">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Chưa phân công</p>
                      )}
                    </div>

                    {/* Status Card */}
                    <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase">Trạng thái</span>
                      </div>
                      <Badge className={`${statusConfig.color} gap-1 border`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </Badge>
                    </div>

                    {/* Submission Stats Card */}
                    <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Upload className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase">Đã nộp</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {filesCount} file, {validLinksCount} link
                        </p>
                        {totalFileSize > 0 && (
                          <p className="text-xs text-muted-foreground">{formatFileSize(totalFileSize)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notes Section */}
                  {task && (
                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Ghi chú trong Task
                      </Label>
                      <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden" style={{ height: '280px' }}>
                        <CompactTaskNotes 
                          taskId={task.id}
                          className="h-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Tab 2: Trao đổi */}
            <TabsContent value="discussion" className="h-full m-0 data-[state=inactive]:hidden">
              {task && (
                <div className="h-full flex flex-col">
                  <TaskComments 
                    taskId={task.id} 
                    groupId={task.group_id} 
                    className="flex-1"
                  />
                </div>
              )}
            </TabsContent>

            {/* Tab 3: Nộp bài */}
            <TabsContent value="submit" className="h-full m-0 data-[state=inactive]:hidden">
              <ScrollArea className="h-full">
                <div className="p-6">
                  {/* Submission Area - Prominent visual design */}
                  <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/8 via-primary/4 to-background shadow-xl shadow-primary/10 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-4 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border-b border-primary/20">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-primary/20 border border-primary/30 shadow-sm">
                          <Send className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">Nộp bài tại đây</h3>
                          <p className="text-sm text-muted-foreground">
                            Tải file và/hoặc thêm liên kết bài làm
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6 space-y-6">
                      {/* Two columns for upload methods */}
                      <div className="grid grid-cols-2 gap-6">
                        {/* File Upload Column */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <Upload className="w-4 h-4 text-primary" />
                              <span className="text-sm font-semibold text-foreground">Tải file lên</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              Tối đa: {formatFileSize(maxFileSize)}
                            </span>
                          </div>
                          <div className="rounded-xl border border-border/50 bg-background/80 p-4 min-h-[200px] hover:border-primary/30 transition-colors">
                            <MultiFileUploadSubmission
                              onFilesChanged={setUploadedFiles}
                              uploadedFiles={uploadedFiles}
                              userId={user?.id || ''}
                              taskId={task?.id || ''}
                              disabled={!canSubmit}
                              compact
                              maxTotalSize={maxFileSize}
                            />
                          </div>
                        </div>

                        {/* Links Column */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <LinkIcon className="w-4 h-4 text-primary" />
                              <span className="text-sm font-semibold text-foreground">Liên kết bài làm</span>
                            </div>
                            {canSubmit && (
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={addSubmissionLink} 
                                className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                              >
                                <Plus className="w-3 h-3" />
                                Thêm link
                              </Button>
                            )}
                          </div>
                          <div className="rounded-xl border border-border/50 bg-background/80 p-4 min-h-[200px] hover:border-primary/30 transition-colors">
                            {submissionLinks.length > 0 ? (
                              <div className="space-y-3">
                                {submissionLinks.map((link, index) => (
                                  <div key={index} className="p-3 rounded-lg border border-border/40 bg-background space-y-2 group hover:border-primary/30 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs px-2 py-0.5 shrink-0 bg-primary/10 border-primary/20 text-primary">
                                        {index + 1}
                                      </Badge>
                                      <Input
                                        placeholder="Tiêu đề liên kết"
                                        value={link.title}
                                        onChange={(e) => updateSubmissionLink(index, 'title', e.target.value)}
                                        disabled={!canSubmit}
                                        className="h-8 text-sm px-3 flex-1 border-border/40 bg-transparent"
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Input
                                        placeholder="https://..."
                                        value={link.url}
                                        onChange={(e) => updateSubmissionLink(index, 'url', e.target.value)}
                                        disabled={!canSubmit}
                                        className="h-8 text-sm px-3 flex-1 font-mono border-border/40 bg-transparent"
                                      />
                                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {link.url && (
                                          <a href={link.url} target="_blank" rel="noopener noreferrer">
                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                              <ExternalLink className="w-4 h-4" />
                                            </Button>
                                          </a>
                                        )}
                                        {canSubmit && (
                                          <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => removeSubmissionLink(index)}
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div 
                                onClick={() => canSubmit && addSubmissionLink()}
                                className={`
                                  h-full min-h-[180px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all
                                  ${canSubmit ? 'cursor-pointer border-primary/20 hover:border-primary/40 hover:bg-primary/5' : 'border-muted/30'}
                                `}
                              >
                                <LinkIcon className="w-8 h-8 text-muted-foreground/40 mb-2" />
                                <p className="text-sm text-muted-foreground/60">
                                  {canSubmit ? 'Nhấn để thêm liên kết' : 'Chưa có liên kết'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: Status & Note */}
                      {canSubmit && (
                        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-primary/10">
                          {/* Status */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-primary" />
                              <Label className="text-sm font-semibold text-foreground">Trạng thái sau khi nộp</Label>
                            </div>
                            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                              <SelectTrigger className="h-10 text-sm bg-background border-primary/20 focus:ring-primary/30">
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

                          {/* Note */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-muted-foreground" />
                              <Label className="text-sm font-medium text-muted-foreground">Ghi chú nộp bài (tùy chọn)</Label>
                            </div>
                            <Textarea
                              placeholder="Thêm ghi chú cho bài nộp..."
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              rows={2}
                              className="resize-none text-sm min-h-[40px] border-border/40 bg-background"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
        
        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-10 min-w-24">
            Đóng
          </Button>
          {canSubmit && (
            <Button 
              onClick={() => {
                if (activeTab !== 'submit') {
                  setActiveTab('submit');
                } else {
                  handleSubmitClick();
                }
              }} 
              disabled={isLoading || (activeTab === 'submit' && !hasContent)} 
              className="h-10 min-w-32 gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang nộp...
                </>
              ) : activeTab !== 'submit' ? (
                <>
                  <Send className="w-4 h-4" />
                  Đi đến Nộp bài
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {isSubmittingOnBehalf ? 'Nộp thay' : 'Nộp bài'}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Late Submission Warning Dialog */}
      <AlertDialog open={showLateWarning} onOpenChange={setShowLateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Cảnh báo nộp bài trễ
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bạn đang nộp lại bài sau deadline. Bài nộp trễ có thể bị trừ điểm theo quy định.
              <br /><br />
              Bạn có chắc chắn muốn tiếp tục?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowLateWarning(false);
                handleSubmit();
              }}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Tiếp tục nộp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
