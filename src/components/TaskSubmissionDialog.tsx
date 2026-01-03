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
    
    // Check if we have at least one valid submission (link or file)
    const validLinks = submissionLinks.filter(l => l.url?.trim());
    const hasFiles = uploadedFiles.length > 0;
    
    if (validLinks.length === 0 && !hasFiles) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng thêm ít nhất 1 liên kết hoặc tải lên file bài làm',
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

      // Determine submission type for history
      const hasFiles = uploadedFiles.length > 0;
      const hasLinks = validLinks.length > 0;
      const historyType = hasFiles && hasLinks ? 'mixed' : hasFiles ? 'file' : 'link';

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

  // Count submissions for display
  const validLinksCount = submissionLinks.filter(l => l.url?.trim()).length;
  const filesCount = uploadedFiles.length;

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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-primary flex items-center gap-2 uppercase tracking-wide">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Nộp bài tại đây
                  </h3>
                  {(filesCount > 0 || validLinksCount > 0) && (
                    <Badge variant="secondary" className="text-[10px]">
                      {filesCount > 0 && `${filesCount} file`}
                      {filesCount > 0 && validLinksCount > 0 && ' + '}
                      {validLinksCount > 0 && `${validLinksCount} link`}
                    </Badge>
                  )}
                </div>
                
                <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto">
                  {/* Status Select - Inside submission area */}
                  {canSubmit && (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-background/50 shrink-0">
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

                  {/* File Upload Section */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Upload className="w-3 h-3" />
                      Tải file lên
                    </Label>
                    <MultiFileUploadSubmission
                      onFilesChanged={setUploadedFiles}
                      uploadedFiles={uploadedFiles}
                      userId={user?.id || ''}
                      taskId={task?.id || ''}
                      disabled={!canSubmit}
                    />
                  </div>

                  {/* Links Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
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
                    
                    {submissionLinks.length > 0 && (
                      <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                        {submissionLinks.map((link, index) => (
                          <div key={index} className="p-2 rounded-lg border bg-muted/30 space-y-1">
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

                    {submissionLinks.length === 0 && (
                      <div className="border border-dashed rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">
                          Chưa có liên kết. Nhấn "Thêm" để thêm link bài làm.
                        </p>
                      </div>
                    )}
                  </div>

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
