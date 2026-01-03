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
  Upload
} from 'lucide-react';
import type { Task, TaskStatus } from '@/types/database';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { parseLocalDateTime } from '@/lib/datetime';
import MultiFileUploadSubmission, { UploadedFile } from './MultiFileUploadSubmission';

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
          submitted_by_leader: isSubmittingOnBehalf,
          files_count: uploadedFiles.length,
          links_count: validLinks.length
        }
      });

      toast({
        title: 'Nộp bài thành công',
        description: isLateSubmission ? 'Bài nộp đã được ghi nhận (trễ hạn)' : 'Bài nộp đã được ghi nhận',
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
      <DialogContent className="max-w-[95vw] w-[1400px] h-[85vh] max-h-[800px] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-3 border-b bg-gradient-to-r from-primary/10 to-transparent shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Nộp bài</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Xem yêu cầu task và nộp bài làm
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
        
        {/* Content - 5:5 Two column layout */}
        <div className="flex-1 p-5 overflow-hidden">
          <div className="grid grid-cols-2 gap-5 h-full">
            {/* Left Column - Task Requirements (50%) - Information display, subtle */}
            <div className="flex flex-col gap-3 overflow-y-auto pr-2">
              {/* Task Requirements - subdued, informational */}
              <div className="p-4 rounded-xl border border-border/40 bg-muted/20">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-3 uppercase tracking-wide">
                  <Target className="w-4 h-4 text-primary" />
                  Yêu cầu Task
                </h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground/70 uppercase">Tiêu đề</Label>
                    <p className="text-base font-medium mt-0.5 text-foreground/90">{task?.title}</p>
                  </div>
                  {task?.description && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground/70 uppercase">Mô tả</Label>
                      <div className="mt-1 p-3 rounded-lg bg-background/60 border border-border/30">
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{task.description}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Info Cards Row - also subdued */}
              <div className="grid grid-cols-2 gap-3">
                {/* Deadline Card */}
                <div className={`p-3 rounded-lg border ${isOverdue ? 'border-destructive/20 bg-destructive/5' : 'border-border/40 bg-muted/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className={`w-4 h-4 ${isOverdue ? 'text-destructive/70' : 'text-muted-foreground/60'}`} />
                    <span className={`text-[10px] font-medium uppercase ${isOverdue ? 'text-destructive/70' : 'text-muted-foreground/60'}`}>Thời hạn</span>
                  </div>
                  {deadlineDate ? (
                    <div>
                      <p className={`text-sm font-medium ${isOverdue ? 'text-destructive' : 'text-foreground/80'}`}>
                        {format(deadlineDate, "dd/MM/yyyy", { locale: vi })}
                      </p>
                      <p className={`text-xs ${isOverdue ? 'text-destructive/70' : 'text-muted-foreground'}`}>
                        {format(deadlineDate, "HH:mm", { locale: vi })}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">Không có</p>
                  )}
                </div>

                {/* Assignees Card */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-muted-foreground/60" />
                    <span className="text-[10px] font-medium text-muted-foreground/60 uppercase">Thực hiện</span>
                  </div>
                  {taskAssignees.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {taskAssignees.map((name, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px] py-0 h-5 bg-background/60">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">Chưa phân công</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Right Column - Submission Area (50%) - Main action area, prominent */}
            <div className="flex flex-col overflow-hidden">
              {/* Unified submission container - visually prominent */}
              <div className="flex-1 flex flex-col rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/8 via-primary/4 to-background shadow-xl shadow-primary/10 overflow-hidden ring-1 ring-primary/10">
                {/* Header - strong visual indicator */}
                <div className="px-5 py-3 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border-b border-primary/20 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30 shadow-sm">
                      <Send className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">Nộp bài tại đây</h3>
                      <p className="text-[11px] text-muted-foreground">
                        Tải file và/hoặc thêm liên kết
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Content - unified feel, minimal internal separation */}
                <div className="flex-1 flex flex-col gap-5 p-5 overflow-y-auto bg-gradient-to-b from-transparent to-background/50">
                  {/* Two columns for upload methods - unified styling */}
                  <div className="grid grid-cols-2 gap-5 flex-1 min-h-0">
                    {/* File Upload Column */}
                    <div className="flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2">
                          <Upload className="w-4 h-4 text-primary/70" />
                          <span className="text-xs font-semibold text-foreground/80">Tải file lên</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          Tối đa: {formatFileSize(maxFileSize)}
                        </span>
                      </div>
                      <div className="flex-1 rounded-xl border border-border/50 bg-background/80 p-3 overflow-y-auto hover:border-primary/30 transition-colors">
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
                    <div className="flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2">
                          <LinkIcon className="w-4 h-4 text-primary/70" />
                          <span className="text-xs font-semibold text-foreground/80">Liên kết bài làm</span>
                        </div>
                        {canSubmit && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={addSubmissionLink} 
                            className="h-6 px-2 text-[10px] gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          >
                            <Plus className="w-3 h-3" />
                            Thêm
                          </Button>
                        )}
                      </div>
                      <div className="flex-1 rounded-xl border border-border/50 bg-background/80 p-3 overflow-y-auto hover:border-primary/30 transition-colors">
                        {submissionLinks.length > 0 ? (
                          <div className="space-y-2">
                            {submissionLinks.map((link, index) => (
                              <div key={index} className="p-2.5 rounded-lg border border-border/40 bg-background space-y-1.5 group hover:border-primary/30 transition-colors">
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0 bg-primary/10 border-primary/20 text-primary">
                                    {index + 1}
                                  </Badge>
                                  <Input
                                    placeholder="Tiêu đề"
                                    value={link.title}
                                    onChange={(e) => updateSubmissionLink(index, 'title', e.target.value)}
                                    disabled={!canSubmit}
                                    className="h-6 text-[11px] px-2 flex-1 border-border/40 bg-transparent"
                                  />
                                </div>
                                <div className="flex gap-1.5">
                                  <Input
                                    placeholder="https://..."
                                    value={link.url}
                                    onChange={(e) => updateSubmissionLink(index, 'url', e.target.value)}
                                    disabled={!canSubmit}
                                    className="h-6 text-[11px] px-2 flex-1 font-mono border-border/40 bg-transparent"
                                  />
                                  <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {link.url && (
                                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary">
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
                                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
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
                              h-full min-h-[60px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all
                              ${canSubmit ? 'cursor-pointer border-primary/20 hover:border-primary/40 hover:bg-primary/5' : 'border-muted/30'}
                            `}
                          >
                            <LinkIcon className="w-5 h-5 text-muted-foreground/40 mb-1" />
                            <p className="text-[11px] text-muted-foreground/50">
                              {canSubmit ? 'Nhấn để thêm link' : 'Chưa có link'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Status & Note - within the same container */}
                  {canSubmit && (
                    <div className="grid grid-cols-2 gap-4 shrink-0 pt-3 border-t border-primary/10">
                      {/* Status - more prominent */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          <Label className="text-xs font-semibold text-foreground">Trạng thái sau khi nộp</Label>
                        </div>
                        <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                          <SelectTrigger className="h-9 text-xs bg-background border-primary/20 focus:ring-primary/30">
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

                      {/* Note - subtle */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/60" />
                          <Label className="text-[11px] font-medium text-muted-foreground/70">Ghi chú (tùy chọn)</Label>
                        </div>
                        <Textarea
                          placeholder="Thêm ghi chú..."
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={1}
                          className="resize-none text-xs min-h-[36px] h-9 border-border/40 bg-background/60"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <DialogFooter className="px-5 py-3 border-t bg-muted/30 gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-10 min-w-24">
            Đóng
          </Button>
          {canSubmit && (
            <Button 
              onClick={handleSubmitClick} 
              disabled={isLoading || !hasContent} 
              className="h-10 min-w-32 gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang nộp...
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
