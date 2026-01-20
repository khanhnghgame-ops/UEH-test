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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  MessagesSquare,
  ChevronDown,
  Award,
  HardDrive,
  Globe
} from 'lucide-react';
import type { Task, TaskStatus } from '@/types/database';
import type { TaskScore } from '@/types/processScores';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { parseLocalDateTime } from '@/lib/datetime';
import MultiFileUploadSubmission, { UploadedFile } from './MultiFileUploadSubmission';
import { notifyTaskSubmitted, notifyTaskVerified } from '@/lib/notifications';
import TaskComments from './communication/TaskComments';
import CompactTaskNotes from './CompactTaskNotes';
import UserAvatar from './UserAvatar';
import { CountdownTimer } from './CountdownTimer';

interface TaskAssignee {
  user_id: string;
  full_name: string;
  student_id?: string;
  avatar_url?: string | null;
}

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
  viewOnly?: boolean;
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
  viewOnly = false,
}: TaskSubmissionDialogProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('requirements');
  
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [submissionLinks, setSubmissionLinks] = useState<SubmissionLink[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [note, setNote] = useState('');
  const [taskAssignees, setTaskAssignees] = useState<TaskAssignee[]>([]);
  const [showLateWarning, setShowLateWarning] = useState(false);
  const [taskScore, setTaskScore] = useState<TaskScore | null>(null);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // Get max file size from task (cast since not in types yet)
  const taskWithSize = task as (Task & { max_file_size?: number }) | null;
  const maxFileSize = taskWithSize?.max_file_size || DEFAULT_MAX_FILE_SIZE;

  // Handle extended deadline
  const taskWithExtended = task as (Task & { extended_deadline?: string; extended_at?: string }) | null;
  const originalDeadlineDate = task?.deadline ? parseLocalDateTime(task.deadline) : null;
  const extendedDeadlineDate = taskWithExtended?.extended_deadline ? parseLocalDateTime(taskWithExtended.extended_deadline) : null;
  const deadlineDate = extendedDeadlineDate || originalDeadlineDate;
  const hasExtension = !!taskWithExtended?.extended_deadline;

  // Calculate extension hours
  const getExtensionHours = () => {
    if (!originalDeadlineDate || !extendedDeadlineDate) return 0;
    const diffMs = extendedDeadlineDate.getTime() - originalDeadlineDate.getTime();
    return Math.round(diffMs / (1000 * 60 * 60));
  };

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

  // Check if task is overdue
  const isOverdue = !!deadlineDate && deadlineDate.getTime() < Date.now();
  // Check if this is a resubmission (has existing submission link)
  const hasExistingSubmission = !!task?.submission_link;
  
  // Permission logic
  const canSubmit = !viewOnly && (isAssignee || isLeaderInGroup);
  const isSubmittingOnBehalf = isLeaderInGroup && !isAssignee;

  // Calculate submission stats
  const validLinksCount = submissionLinks.filter(l => l.url?.trim()).length;
  const filesCount = uploadedFiles.length;
  const totalFileSize = uploadedFiles.reduce((sum, f) => sum + f.file_size, 0);
  const hasContent = filesCount > 0 || validLinksCount > 0;

  // Fetch task score from database
  useEffect(() => {
    const fetchTaskScore = async () => {
      if (!task || !user) return;
      
      const { data } = await supabase
        .from('task_scores')
        .select('*')
        .eq('task_id', task.id)
        .eq('user_id', user.id)
        .maybeSingle();
      
      setTaskScore(data as TaskScore | null);
    };
    
    if (task && isOpen && user) {
      fetchTaskScore();
    }
  }, [task, isOpen, user]);

  useEffect(() => {
    if (task && isOpen) {
      setStatus(task.status);
      setNote('');
      setUploadedFiles([]);
      setSubmissionLinks([]);
      setActiveTab('requirements');
      setIsNotesOpen(false);
      
      try {
        const parsed = task.submission_link ? JSON.parse(task.submission_link) : [];
        if (Array.isArray(parsed)) {
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
          setSubmissionLinks([{ title: 'Bài nộp', url: task.submission_link }]);
        }
      } catch {
        if (task.submission_link) {
          setSubmissionLinks([{ title: 'Bài nộp', url: task.submission_link }]);
        }
      }
      
      if (task.task_assignments) {
        const assignees: TaskAssignee[] = task.task_assignments.map((a: any) => ({
          user_id: a.user_id,
          full_name: a.profiles?.full_name || 'Unknown',
          student_id: a.profiles?.student_id || undefined,
          avatar_url: a.profiles?.avatar_url || null,
        }));
        setTaskAssignees(assignees);
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
              {!viewOnly && (
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
              )}
              {viewOnly && (
                <div className="flex items-center h-10 px-4 gap-2 text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">Chế độ xem</span>
                </div>
              )}
            </TabsList>
          </div>

          {/* Tab Content - Scrollable per page */}
          <div className="flex-1 overflow-hidden">
            {/* Tab 1: Yêu cầu Task - Optimized compact layout */}
            <TabsContent value="requirements" className="h-full m-0 data-[state=inactive]:hidden">
              <ScrollArea className="h-full">
                <div className="p-4">
                  {/* Compact Two Column Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Left Column - Main Content (8 cols) */}
                    <div className="lg:col-span-8 space-y-3">
                      {/* Task Title & Description - Combined for compactness */}
                      <div className="rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-background overflow-hidden">
                        <div className="px-3 py-2 border-b border-border/30 bg-primary/5">
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-primary" />
                            <span className="text-sm font-bold text-primary">Yêu cầu Task</span>
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <h2 className="text-base font-bold text-foreground leading-tight">{task?.title}</h2>
                          {task?.description && (
                            <div className="pt-2 border-t border-border/30">
                              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{task.description}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Deadline - Compact 1 line with tooltip */}
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 cursor-default ${hasExtension ? 'border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20' : isOverdue ? 'border-destructive/30 bg-destructive/5' : 'border-border/50 bg-muted/20'}`}>
                              <Calendar className={`w-4 h-4 shrink-0 ${hasExtension ? 'text-blue-600' : isOverdue ? 'text-destructive' : 'text-orange-500'}`} />
                              <span className="text-xs text-muted-foreground shrink-0">Deadline:</span>
                              
                              {hasExtension && originalDeadlineDate && extendedDeadlineDate ? (
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className="text-xs text-muted-foreground line-through truncate">
                                    {format(originalDeadlineDate, "dd/MM – HH:mm", { locale: vi })}
                                  </span>
                                  <Badge className="shrink-0 text-[9px] px-1 bg-blue-500/10 text-blue-600 border-blue-500/30">
                                    {getExtensionText(getExtensionHours())}
                                  </Badge>
                                  <span className={`text-xs font-bold truncate ${isOverdue ? 'text-destructive' : 'text-blue-700'}`}>
                                    {format(extendedDeadlineDate, "dd/MM/yyyy – HH:mm", { locale: vi })}
                                  </span>
                                </div>
                              ) : deadlineDate ? (
                                <span className={`text-xs font-bold truncate ${isOverdue ? 'text-destructive' : 'text-foreground'}`}>
                                  {format(deadlineDate, "dd/MM/yyyy – HH:mm", { locale: vi })}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Không có deadline</span>
                              )}
                              
                              {timeStatus && (
                                <Badge 
                                  variant={timeStatus.isOverdue ? "destructive" : "secondary"}
                                  className="ml-auto shrink-0 gap-1 text-[10px] px-1.5"
                                >
                                  <Clock className="w-2.5 h-2.5" />
                                  {timeStatus.text}
                                </Badge>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs max-w-xs">
                            <div className="space-y-1">
                              {hasExtension && originalDeadlineDate && extendedDeadlineDate ? (
                                <>
                                  <p><span className="text-muted-foreground">Deadline gốc:</span> {format(originalDeadlineDate, "dd/MM/yyyy – HH:mm", { locale: vi })}</p>
                                  <p><span className="text-muted-foreground">Gia hạn:</span> {getExtensionText(getExtensionHours())}</p>
                                  <p><span className="text-muted-foreground">Deadline mới:</span> <span className="font-bold">{format(extendedDeadlineDate, "dd/MM/yyyy – HH:mm", { locale: vi })}</span></p>
                                </>
                              ) : deadlineDate ? (
                                <p><span className="text-muted-foreground">Deadline:</span> <span className="font-bold">{format(deadlineDate, "dd/MM/yyyy – HH:mm", { locale: vi })}</span></p>
                              ) : (
                                <p>Không có deadline</p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Assignees - Horizontal compact */}
                      <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-semibold text-foreground">Người thực hiện</span>
                          <Badge variant="secondary" className="text-[10px] ml-auto">{taskAssignees.length}</Badge>
                        </div>
                        {taskAssignees.length > 0 ? (
                          <TooltipProvider delayDuration={200}>
                            <div className="flex flex-wrap gap-1.5">
                              {taskAssignees.map((assignee, idx) => (
                                <Tooltip key={idx}>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background/60 border border-border/30 hover:border-primary/30 cursor-pointer transition-all">
                                      <UserAvatar 
                                        src={assignee.avatar_url} 
                                        name={assignee.full_name} 
                                        size="xs"
                                      />
                                      <span className="text-[11px] font-medium text-foreground truncate max-w-20">
                                        {assignee.full_name}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <div className="font-medium">{assignee.full_name}</div>
                                    {assignee.student_id && (
                                      <div className="text-muted-foreground">MSSV: {assignee.student_id}</div>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </TooltipProvider>
                        ) : (
                          <p className="text-xs text-muted-foreground">Chưa phân công</p>
                        )}
                      </div>

                      {/* Notes - Collapsible for compactness */}
                      {task && (
                        <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                            <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between hover:bg-amber-500/10 transition-colors">
                              <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-xs font-semibold text-foreground">Ghi chú Task</span>
                                <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-500/30">Thông tin phụ</Badge>
                              </div>
                              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isNotesOpen ? 'rotate-180' : ''}`} />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="h-[130px] border-t border-amber-500/20">
                                <CompactTaskNotes 
                                  taskId={task.id}
                                  className="h-full"
                                />
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      )}
                    </div>

                    {/* Right Column - Submission Summary + Status + Score (4 cols) */}
                    <div className="lg:col-span-4 space-y-3">
                      {/* Submission Summary Card */}
                      <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 rounded-lg bg-primary/20">
                            <Upload className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="text-sm font-bold text-foreground">Bài đã nộp</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="text-center p-2 rounded-lg bg-background/60">
                            <HardDrive className="w-3.5 h-3.5 mx-auto mb-0.5 text-emerald-500" />
                            <p className="text-lg font-bold text-foreground">{filesCount}</p>
                            <p className="text-[9px] text-muted-foreground">File</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-background/60">
                            <Globe className="w-3.5 h-3.5 mx-auto mb-0.5 text-blue-500" />
                            <p className="text-lg font-bold text-foreground">{validLinksCount}</p>
                            <p className="text-[9px] text-muted-foreground">Link</p>
                          </div>
                        </div>

                        {totalFileSize > 0 && (
                          <p className="text-[10px] text-muted-foreground text-center pt-1.5 border-t border-primary/20">
                            Dung lượng: {formatFileSize(totalFileSize)}
                          </p>
                        )}

                        {!hasContent && (
                          <div className="text-center pt-1.5 border-t border-primary/20 mt-2">
                            <p className="text-[10px] text-muted-foreground">Chưa có bài nộp</p>
                          </div>
                        )}
                      </div>

                      {/* Status + Score Row - Same row, equal width */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-border/50 bg-muted/20 p-2 text-center">
                          <StatusIcon className={`w-3.5 h-3.5 mx-auto mb-0.5 ${task?.status === 'VERIFIED' ? 'text-success' : task?.status === 'DONE' ? 'text-primary' : 'text-warning'}`} />
                          <p className="text-[9px] uppercase text-muted-foreground mb-0.5">Trạng thái</p>
                          <Badge className={`${statusConfig.color} gap-0.5 border text-[9px] px-1 py-0`}>
                            {statusConfig.label}
                          </Badge>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/20 p-2 text-center">
                          <Award className="w-3.5 h-3.5 mx-auto mb-0.5 text-amber-500" />
                          <p className="text-[9px] uppercase text-muted-foreground mb-0.5">Điểm</p>
                          {taskScore ? (
                            <span className={`text-base font-bold ${
                              taskScore.final_score >= 90 ? 'text-green-600' :
                              taskScore.final_score >= 70 ? 'text-primary' :
                              taskScore.final_score >= 50 ? 'text-yellow-600' : 'text-destructive'
                            }`}>{taskScore.final_score}</span>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">Chưa chấm</p>
                          )}
                        </div>
                      </div>

                      {/* Quick Action - Full width button */}
                      {canSubmit && (
                        <Button 
                          onClick={() => setActiveTab('submit')}
                          className="w-full h-12 gap-2 shadow-lg text-sm font-semibold"
                          size="lg"
                        >
                          <Send className="w-4 h-4" />
                          Đi đến Nộp bài
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Tab 2: Trao đổi - Full height chat */}
            <TabsContent value="discussion" className="h-full m-0 data-[state=inactive]:hidden">
              <div className="h-full flex flex-col">
                {task && (
                  <TaskComments 
                    taskId={task.id} 
                    groupId={task.group_id} 
                    className="flex-1 border-0 rounded-none"
                  />
                )}
              </div>
            </TabsContent>

            {/* Tab 3: Nộp bài - Redesigned with full-width layout */}
            <TabsContent value="submit" className="h-full m-0 data-[state=inactive]:hidden">
              <div className="h-full flex flex-col">
                {/* Compact Header Bar */}
                <div className="px-4 py-2.5 border-b bg-gradient-to-r from-primary/10 to-transparent shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/15 border border-primary/30">
                        <Send className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Nộp bài Task</h3>
                        <p className="text-[10px] text-muted-foreground">Tải file hoặc dán liên kết</p>
                      </div>
                    </div>
                    
                    {/* Right side: Countdown + Stats */}
                    <div className="flex items-center gap-3">
                      {/* Countdown Timer */}
                      {task?.deadline && (
                        <div className={`px-3 py-1.5 rounded-lg border ${isOverdue ? 'bg-destructive/10 border-destructive/30' : 'bg-primary/10 border-primary/30'}`}>
                          <CountdownTimer 
                            deadline={task.deadline} 
                            showIcon={true}
                            className="text-sm"
                          />
                        </div>
                      )}
                      
                      {/* Submission Stats */}
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50">
                        <div className="flex items-center gap-1">
                          <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-sm font-bold text-foreground">{filesCount}</span>
                        </div>
                        <div className="w-px h-4 bg-border/50" />
                        <div className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-sm font-bold text-foreground">{validLinksCount}</span>
                        </div>
                        {totalFileSize > 0 && (
                          <>
                            <div className="w-px h-4 bg-border/50" />
                            <span className="text-xs text-muted-foreground">{formatFileSize(totalFileSize)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scrollable Content Area */}
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Two Column Layout - File Upload & Links */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Method 1: File Upload */}
                      <div className="rounded-xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-background overflow-hidden flex flex-col">
                        {/* Method Header */}
                        <div className="px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/20 shrink-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-emerald-600 text-white border-0 text-[10px] px-1.5 font-bold">
                                Cách 1
                              </Badge>
                              <div className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                                <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-foreground">Tải file lên</h4>
                                <p className="text-[9px] text-muted-foreground">Upload từ máy tính</p>
                              </div>
                            </div>
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[9px] px-1.5">
                              Max {formatFileSize(maxFileSize)}
                            </Badge>
                          </div>
                        </div>
                        {/* Upload Area - Expanded */}
                        <div className="p-3 flex-1 min-h-[280px]">
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

                      {/* Method 2: External Links */}
                      <div className="rounded-xl border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-background overflow-hidden flex flex-col">
                        {/* Method Header */}
                        <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20 shrink-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-blue-600 text-white border-0 text-[10px] px-1.5 font-bold">
                                Cách 2
                              </Badge>
                              <div className="p-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30">
                                <Globe className="w-3.5 h-3.5 text-blue-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-foreground">Dán liên kết</h4>
                                <p className="text-[9px] text-muted-foreground">Drive, Dropbox, Github...</p>
                              </div>
                            </div>
                            {canSubmit && (
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                onClick={addSubmissionLink} 
                                className="h-6 px-2 text-[10px] gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                              >
                                <Plus className="w-3 h-3" />
                                Thêm
                              </Button>
                            )}
                          </div>
                        </div>
                        {/* Links Area - Expanded */}
                        <div className="p-3 flex-1 min-h-[280px]">
                          {submissionLinks.length > 0 ? (
                            <div className="space-y-2">
                              {submissionLinks.map((link, index) => (
                                <div key={index} className="p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 space-y-1.5 group hover:border-blue-500/40 transition-colors">
                                  <div className="flex items-center gap-2">
                                    <Badge className="text-[9px] px-1 py-0 shrink-0 bg-blue-500/20 border-0 text-blue-600">
                                      #{index + 1}
                                    </Badge>
                                    <Input
                                      placeholder="Tên liên kết"
                                      value={link.title}
                                      onChange={(e) => updateSubmissionLink(index, 'title', e.target.value)}
                                      disabled={!canSubmit}
                                      className="h-6 text-xs px-2 flex-1 border-blue-500/20 bg-background/80"
                                    />
                                  </div>
                                  <div className="flex gap-1">
                                    <Input
                                      placeholder="https://drive.google.com/..."
                                      value={link.url}
                                      onChange={(e) => updateSubmissionLink(index, 'url', e.target.value)}
                                      disabled={!canSubmit}
                                      className="h-6 text-xs px-2 flex-1 font-mono border-blue-500/20 bg-background/80"
                                    />
                                    <div className="flex gap-0.5 shrink-0">
                                      {link.url && (
                                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10">
                                            <ExternalLink className="w-3 h-3" />
                                          </Button>
                                        </a>
                                      )}
                                      {canSubmit && (
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => removeSubmissionLink(index)}
                                          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        >
                                          <Trash2 className="w-3 h-3" />
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
                                h-full min-h-[240px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all
                                ${canSubmit ? 'cursor-pointer border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/5' : 'border-muted/30'}
                              `}
                            >
                              <div className="p-3 rounded-full bg-blue-500/10 mb-2">
                                <LinkIcon className="w-6 h-6 text-blue-500/50" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">
                                {canSubmit ? 'Nhấn để thêm liên kết' : 'Chưa có liên kết'}
                              </p>
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                Google Drive, Dropbox, OneDrive...
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom: Status & Note - More compact */}
                    {canSubmit && (
                      <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                        <div className="flex flex-wrap items-end gap-4">
                          {/* Status */}
                          <div className="space-y-1 min-w-[180px]">
                            <div className="flex items-center gap-1.5">
                              <Target className="w-3 h-3 text-primary" />
                              <Label className="text-[10px] font-semibold text-foreground">Trạng thái sau khi nộp</Label>
                            </div>
                            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                              <SelectTrigger className="h-8 text-xs bg-background border-border/50">
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

                          {/* Note - Flexible width */}
                          <div className="flex-1 min-w-[200px] space-y-1">
                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="w-3 h-3 text-muted-foreground" />
                              <Label className="text-[10px] font-medium text-muted-foreground">Ghi chú (tùy chọn)</Label>
                            </div>
                            <Input
                              placeholder="Thêm ghi chú cho bài nộp..."
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              className="h-8 text-xs border-border/50 bg-background"
                            />
                          </div>
                        </div>
                      </div>
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
