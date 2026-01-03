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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  FileText,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Target,
  Users,
  Link as LinkIcon,
  MessageSquare,
  AlertTriangle,
  Upload,
  File
} from 'lucide-react';
import type { Task, TaskStatus } from '@/types/database';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { parseLocalDateTime } from '@/lib/datetime';
import FileUploadSubmission from './FileUploadSubmission';

interface SubmissionLink {
  id?: string;
  title: string;
  url: string;
}

interface UploadedFile {
  file_path: string;
  file_name: string;
  file_size: number;
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
  const [submissionType, setSubmissionType] = useState<'link' | 'file'>('file');
  const [submissionLinks, setSubmissionLinks] = useState<SubmissionLink[]>([]);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [existingFile, setExistingFile] = useState<UploadedFile | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [note, setNote] = useState('');
  const [taskAssignees, setTaskAssignees] = useState<string[]>([]);
  const [showLateWarning, setShowLateWarning] = useState(false);

  const deadlineDate = task?.deadline ? parseLocalDateTime(task.deadline) : null;

  // Check if task is overdue
  const isOverdue = !!deadlineDate && deadlineDate.getTime() < Date.now();
  // Check if this is a resubmission (has existing submission link)
  const hasExistingSubmission = !!task?.submission_link;
  
  // Permission logic
  const canSubmit = isAssignee || isLeaderInGroup;
  const isSubmittingOnBehalf = isLeaderInGroup && !isAssignee;

  useEffect(() => {
    if (task && isOpen) {
      setStatus(task.status);
      setNote('');
      setUploadedFile(null);
      setExistingFile(null);
      setFileTitle('');
      
      try {
        const parsed = task.submission_link ? JSON.parse(task.submission_link) : [];
        if (Array.isArray(parsed)) {
          // Separate links and files
          const links = parsed.filter((item: any) => !item.file_path && item.url);
          const files = parsed.filter((item: any) => item.file_path);
          
          setSubmissionLinks(links.length > 0 ? links : []);
          
          // Set existing file if there's one
          if (files.length > 0) {
            const file = files[0];
            setExistingFile({
              file_path: file.file_path,
              file_name: file.file_name,
              file_size: file.file_size || 0
            });
            setFileTitle(file.title || '');
            setSubmissionType('file');
          } else if (links.length > 0) {
            setSubmissionType('link');
          } else {
            setSubmissionType('file');
          }
        } else {
          setSubmissionLinks([{ title: 'Bài nộp', url: task.submission_link }]);
          setSubmissionType('link');
        }
      } catch {
        if (task.submission_link) {
          setSubmissionLinks([{ title: 'Bài nộp', url: task.submission_link }]);
          setSubmissionType('link');
        } else {
          setSubmissionLinks([]);
          setSubmissionType('file');
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
    
    // Check if we have at least one valid submission (link or file)
    const validLinks = submissionLinks.filter(l => l.url?.trim());
    const hasNewFile = uploadedFile && fileTitle.trim();
    const hasExistingFileWithTitle = existingFile && fileTitle.trim();
    const hasValidFile = hasNewFile || hasExistingFileWithTitle;
    
    if (validLinks.length === 0 && !hasValidFile) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng thêm ít nhất 1 liên kết hoặc tải lên file bài làm',
        variant: 'destructive',
      });
      return;
    }
    
    // If user is on file tab but hasn't entered title for existing file
    if (submissionType === 'file' && (uploadedFile || existingFile) && !fileTitle.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập tiêu đề cho file',
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

      // Build combined submission data (links + file)
      const allSubmissions: any[] = [];
      
      // Add valid links
      const validLinks = submissionLinks.filter(l => l.url?.trim());
      validLinks.forEach(link => {
        allSubmissions.push({
          title: link.title,
          url: link.url,
          type: 'link'
        });
      });
      
      // Add file (new upload or existing)
      const fileToSave = uploadedFile || existingFile;
      if (fileToSave && fileTitle.trim()) {
        // Delete old file if uploading a new one and there's an existing file
        if (uploadedFile && existingFile && existingFile.file_path !== uploadedFile.file_path) {
          try {
            await supabase.storage
              .from('task-submissions')
              .remove([existingFile.file_path]);
          } catch (e) {
            console.warn('Failed to delete old file:', e);
          }
        }
        
        allSubmissions.push({
          title: fileTitle.trim(),
          file_path: fileToSave.file_path,
          file_name: fileToSave.file_name,
          file_size: fileToSave.file_size,
          type: 'file'
        });
      }

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

      // Determine submission type for history
      const hasFile = !!fileToSave && fileTitle.trim();
      const hasLinks = validLinks.length > 0;
      const historyType = hasFile && hasLinks ? 'mixed' : hasFile ? 'file' : 'link';

      // Save to submission history
      const { error: historyError } = await supabase
        .from('submission_history')
        .insert({
          task_id: task.id,
          user_id: user!.id,
          submission_link: submissionLinkJson,
          note: note.trim() || (isSubmittingOnBehalf ? 'Leader nộp thay' : null),
          submission_type: historyType,
          file_path: hasFile ? fileToSave!.file_path : null,
          file_name: hasFile ? fileToSave!.file_name : null,
          file_size: hasFile ? fileToSave!.file_size : null
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
          submission_type: submissionType
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
        {/* Header - Match Create Task style */}
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
        
        {/* Content - 6:4 Two column layout */}
        <div className="flex-1 p-5 overflow-hidden">
          <div className="grid grid-cols-10 gap-5 h-full">
            {/* Left Column - Task Requirements (6/10 = 60%) */}
            <div className="col-span-6 flex flex-col gap-4 overflow-y-auto pr-2">
              {/* Task Title & Description Card */}
              <div className="p-5 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                <h3 className="text-sm font-bold text-primary flex items-center gap-2 mb-4 uppercase tracking-wide">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  Yêu cầu Task
                </h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase font-medium">Tiêu đề</Label>
                    <p className="text-lg font-semibold mt-1">{task?.title}</p>
                  </div>
                  {task?.description && (
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase font-medium">Mô tả chi tiết</Label>
                      <div className="mt-2 p-4 rounded-lg bg-background/50 border">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Info Cards Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Deadline Card */}
                <div className={`p-4 rounded-xl border-2 ${isOverdue ? 'border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent' : 'border-warning/20 bg-gradient-to-br from-warning/5 to-transparent'}`}>
                  <h3 className={`text-sm font-bold flex items-center gap-2 mb-3 uppercase tracking-wide ${isOverdue ? 'text-destructive' : 'text-warning'}`}>
                    <div className={`w-2 h-2 rounded-full ${isOverdue ? 'bg-destructive' : 'bg-warning'}`} />
                    Thời hạn
                  </h3>
                  <div className="flex items-center gap-3">
                    <Calendar className={`w-8 h-8 ${isOverdue ? 'text-destructive' : 'text-warning'}`} />
                    <div>
                      {deadlineDate ? (
                        <>
                          <p className={`font-semibold ${isOverdue ? 'text-destructive' : ''}`}>
                            {format(deadlineDate, "dd/MM/yyyy", { locale: vi })}
                          </p>
                          <p className={`text-sm ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {format(deadlineDate, "HH:mm", { locale: vi })}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Không có deadline</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Assignees Card */}
                <div className="p-4 rounded-xl border-2 border-success/20 bg-gradient-to-br from-success/5 to-transparent">
                  <h3 className="text-sm font-bold text-success flex items-center gap-2 mb-3 uppercase tracking-wide">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    Người thực hiện
                  </h3>
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-success" />
                    <div>
                      {taskAssignees.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {taskAssignees.map((name, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">Chưa phân công</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Column - Submission Area (4/10 = 40%) */}
            <div className="col-span-4">
              <div className="p-5 rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 h-full flex flex-col">
                <h3 className="text-sm font-bold text-primary flex items-center gap-2 mb-3 uppercase tracking-wide">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Nộp bài tại đây
                </h3>
                
                <div className="flex-1 flex flex-col gap-3 min-h-0">
                  {/* Status Select - Inside submission area */}
                  {canSubmit && (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-background/50">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-muted-foreground" />
                        <Label className="text-xs font-medium">Trạng thái:</Label>
                      </div>
                      <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                        <SelectTrigger className="flex-1 h-8 text-xs">
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

                  {/* Submission Type Tabs */}
                  <Tabs value={submissionType} onValueChange={(v) => setSubmissionType(v as 'link' | 'file')} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="grid w-full grid-cols-2 mb-2 shrink-0">
                      <TabsTrigger value="file" className="gap-2 text-xs">
                        <Upload className="w-3.5 h-3.5" />
                        Tải file lên
                      </TabsTrigger>
                      <TabsTrigger value="link" className="gap-2 text-xs">
                        <LinkIcon className="w-3.5 h-3.5" />
                        Nộp bằng link
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="file" className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden">
                      {/* File Upload */}
                      <div className="flex flex-col gap-2 flex-1">
                        <div>
                          <Label className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
                            <File className="w-3 h-3" />
                            Tiêu đề file (bắt buộc)
                          </Label>
                          <Input
                            placeholder="Nhập tiêu đề cho bài nộp..."
                            value={fileTitle}
                            onChange={(e) => setFileTitle(e.target.value)}
                            disabled={!canSubmit}
                            className="h-8 text-xs"
                          />
                        </div>
                        
                        <FileUploadSubmission
                          onFileUploaded={(file) => {
                            setUploadedFile(file);
                          }}
                          onFileRemoved={() => {
                            setUploadedFile(null);
                            setExistingFile(null);
                          }}
                          uploadedFile={uploadedFile || existingFile}
                          userId={user?.id || ''}
                          taskId={task?.id || ''}
                          disabled={!canSubmit}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="link" className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden">
                      {/* Submission Links */}
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-2 shrink-0">
                          <Label className="text-xs font-medium flex items-center gap-1.5">
                            <LinkIcon className="w-3 h-3" />
                            Liên kết bài làm
                          </Label>
                          {canSubmit && (
                            <Button type="button" variant="outline" size="sm" onClick={addSubmissionLink} className="gap-1 h-6 text-[10px] px-2">
                              <Plus className="w-3 h-3" />
                              Thêm
                            </Button>
                          )}
                        </div>
                        
                        <div className="flex-1 border rounded-lg bg-background/50 p-2 overflow-y-auto min-h-[100px]">
                          {submissionLinks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-4">
                              <FileText className="w-8 h-8 mb-2 text-muted-foreground/40" />
                              <p className="text-[10px] text-muted-foreground mb-2">Chưa có liên kết nộp bài</p>
                              {canSubmit && (
                                <Button variant="outline" size="sm" onClick={addSubmissionLink} className="text-[10px] h-6 px-2">
                                  <Plus className="w-3 h-3 mr-1" />
                                  Thêm liên kết
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {submissionLinks.map((link, index) => (
                                <div key={index} className="p-2 rounded-lg border bg-muted/30 space-y-1.5">
                                  <Input
                                    placeholder="Tiêu đề (bắt buộc)"
                                    value={link.title}
                                    onChange={(e) => updateSubmissionLink(index, 'title', e.target.value)}
                                    disabled={!canSubmit}
                                    className="h-7 text-xs"
                                  />
                                  <div className="flex gap-1">
                                    <Input
                                      placeholder="URL liên kết"
                                      value={link.url}
                                      onChange={(e) => updateSubmissionLink(index, 'url', e.target.value)}
                                      disabled={!canSubmit}
                                      className="h-7 text-xs flex-1"
                                    />
                                    <div className="flex gap-0.5 shrink-0">
                                      {link.url && (
                                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
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
                                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>

                  {/* Note */}
                  {canSubmit && (
                    <div className="shrink-0">
                      <Label className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
                        <MessageSquare className="w-3 h-3" />
                        Ghi chú
                        <span className="text-[10px] text-muted-foreground font-normal">(tùy chọn)</span>
                      </Label>
                      <Textarea
                        placeholder="Thêm ghi chú cho lần nộp này..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        className="resize-none text-xs"
                      />
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
            <Button onClick={handleSubmitClick} disabled={isLoading} className="h-10 min-w-32 gap-2">
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
