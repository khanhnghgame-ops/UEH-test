import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Plus,
  MoreVertical,
  Calendar,
  ExternalLink,
  Trash2,
  Edit,
  Loader2,
  Layers,
  ChevronDown,
  ChevronRight,
  Send,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Eye,
  History,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Task, Stage, GroupMember } from '@/types/database';
import TaskSubmissionDialog from './TaskSubmissionDialog';
import SubmissionHistoryPopup from './SubmissionHistoryPopup';

// Stage color helper - returns a consistent color for each stage index
const getStageColor = (index: number) => {
  const colors = [
    { bg: 'bg-stage-1/10', text: 'text-stage-1', border: 'border-stage-1/30', dot: 'bg-stage-1' },
    { bg: 'bg-stage-2/10', text: 'text-stage-2', border: 'border-stage-2/30', dot: 'bg-stage-2' },
    { bg: 'bg-stage-3/10', text: 'text-stage-3', border: 'border-stage-3/30', dot: 'bg-stage-3' },
    { bg: 'bg-stage-4/10', text: 'text-stage-4', border: 'border-stage-4/30', dot: 'bg-stage-4' },
    { bg: 'bg-stage-5/10', text: 'text-stage-5', border: 'border-stage-5/30', dot: 'bg-stage-5' },
    { bg: 'bg-stage-6/10', text: 'text-stage-6', border: 'border-stage-6/30', dot: 'bg-stage-6' },
  ];
  return colors[index % colors.length];
};

// Helper functions
const getStatusColor = (status: string, isOverdue: boolean) => {
  if (isOverdue && status !== 'DONE' && status !== 'VERIFIED') {
    return 'bg-destructive/10 text-destructive border-destructive/30';
  }
  switch (status) {
    case 'TODO':
      return 'bg-muted text-muted-foreground';
    case 'IN_PROGRESS':
      return 'bg-warning/10 text-warning border-warning/30';
    case 'DONE':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'VERIFIED':
      return 'bg-success/10 text-success border-success/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getStatusLabel = (status: string, isOverdue: boolean) => {
  if (isOverdue && status !== 'DONE' && status !== 'VERIFIED') {
    return 'Trễ deadline';
  }
  switch (status) {
    case 'TODO':
      return 'Chờ làm';
    case 'IN_PROGRESS':
      return 'Đang làm';
    case 'DONE':
      return 'Hoàn thành';
    case 'VERIFIED':
      return 'Đã duyệt';
    default:
      return status;
  }
};

const getProgressPercent = (status: string) => {
  switch (status) {
    case 'TODO':
      return 0;
    case 'IN_PROGRESS':
      return 50;
    case 'DONE':
    case 'VERIFIED':
      return 100;
    default:
      return 0;
  }
};

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const isOverdue = (deadline: string | null) => {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
};

// TaskRow component
interface TaskRowProps {
  task: Task;
  stageName: string;
  stageColor: ReturnType<typeof getStageColor>;
  isLeaderInGroup: boolean;
  isAssignee: boolean;
  onEditTask: (task: Task) => void;
  openSubmissionDialog: (task: Task) => void;
  setTaskToDelete: (task: Task) => void;
}

function TaskRow({
  task,
  stageName,
  stageColor,
  isLeaderInGroup,
  isAssignee,
  onEditTask,
  openSubmissionDialog,
  setTaskToDelete,
}: TaskRowProps) {
  const progress = getProgressPercent(task.status);
  const overdueStatus = isOverdue(task.deadline);
  const taskIsOverdue = overdueStatus && task.status !== 'DONE' && task.status !== 'VERIFIED';
  const canSubmit = isLeaderInGroup || (isAssignee && !taskIsOverdue);

  const handleTaskClick = () => {
    if (isLeaderInGroup) {
      onEditTask(task);
    }
  };

  return (
    <div className={`group flex items-center gap-4 p-4 bg-card border rounded-xl transition-all hover:shadow-md ${
      taskIsOverdue ? 'border-destructive/30 bg-destructive/5' : ''
    }`}>
      {/* Task Title */}
      <div 
        className={`flex-1 min-w-0 ${isLeaderInGroup ? 'cursor-pointer' : ''}`}
        onClick={handleTaskClick}
      >
        <div className="flex items-center gap-2">
          <h4 className={`font-semibold text-sm truncate ${isLeaderInGroup ? 'group-hover:text-primary transition-colors' : ''}`}>
            {task.title}
          </h4>
          {taskIsOverdue && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Task đã quá deadline</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-xs">{task.description}</p>
        )}
      </div>

      {/* Stage with color */}
      <div className="w-32 flex-shrink-0 hidden md:block">
        <Badge className={`${stageColor.bg} ${stageColor.text} ${stageColor.border} text-xs truncate max-w-full border`}>
          <span className={`w-2 h-2 rounded-full ${stageColor.dot} mr-1.5`} />
          {stageName}
        </Badge>
      </div>

      {/* Assignees */}
      <div className="w-28 flex-shrink-0 hidden lg:flex items-center gap-1">
        {task.task_assignments && task.task_assignments.length > 0 ? (
          <>
            <div className="flex -space-x-2">
              {task.task_assignments.slice(0, 2).map((assignment) => (
                <Avatar key={assignment.id} className="w-6 h-6 border-2 border-background">
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                    {assignment.profiles ? getInitials(assignment.profiles.full_name) : '?'}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-xs text-muted-foreground truncate">
              {task.task_assignments[0]?.profiles?.full_name?.split(' ').pop()}
              {task.task_assignments.length > 1 && ` +${task.task_assignments.length - 1}`}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">Chưa giao</span>
        )}
      </div>

      {/* Deadline */}
      <div className="w-24 flex-shrink-0 hidden sm:block">
        {task.deadline ? (
          <div className={`flex items-center gap-1 text-xs ${taskIsOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            <Calendar className="w-3 h-3" />
            <span>{formatDate(task.deadline)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">-</span>
        )}
      </div>

      {/* Status */}
      <div className="w-28 flex-shrink-0">
        <Badge className={`${getStatusColor(task.status, taskIsOverdue)} text-xs border`}>
          {getStatusLabel(task.status, taskIsOverdue)}
        </Badge>
      </div>

      {/* Progress */}
      <div className="w-16 flex-shrink-0 hidden xl:block">
        <div className="flex items-center gap-1">
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="text-[10px] text-muted-foreground">{progress}%</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* History popup - compact button */}
        <SubmissionHistoryPopup 
          taskId={task.id} 
          taskDeadline={task.deadline}
          currentSubmissionLink={task.submission_link}
        />

        {/* Submit Button */}
        {(isAssignee || isLeaderInGroup) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={task.submission_link ? "outline" : "default"}
                  size="sm"
                  className={`gap-1 h-8 text-xs ${!canSubmit ? 'opacity-50' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openSubmissionDialog(task);
                  }}
                >
                  {task.submission_link ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-success" />
                      <span className="hidden sm:inline">Xem</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span className="hidden sm:inline">Nộp</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {taskIsOverdue && !isLeaderInGroup 
                  ? 'Đã quá deadline - Chỉ Leader được nộp thay'
                  : task.submission_link 
                    ? 'Xem/Cập nhật bài nộp' 
                    : 'Nộp bài'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Leader actions */}
        {isLeaderInGroup && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem onClick={() => onEditTask(task)}>
                <Edit className="w-4 h-4 mr-2" />
                Chỉnh sửa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSubmissionDialog(task)}>
                <Send className="w-4 h-4 mr-2" />
                {task.submission_link ? 'Xem bài nộp' : 'Nộp thay'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTaskToDelete(task)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Xóa task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

interface TaskListViewProps {
  stages: Stage[];
  tasks: Task[];
  members: GroupMember[];
  isLeaderInGroup: boolean;
  groupId: string;
  onRefresh: () => void;
  onEditTask: (task: Task) => void;
  onCreateTask: (stageId: string) => void;
  onEditStage: (stage: Stage) => void;
  onDeleteStage: (stage: Stage) => void;
}

export default function TaskListView({
  stages,
  tasks,
  members,
  isLeaderInGroup,
  groupId,
  onRefresh,
  onEditTask,
  onCreateTask,
  onEditStage,
  onDeleteStage,
}: TaskListViewProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(stages.map(s => s.id)));
  const [filterStage, setFilterStage] = useState<string>('all');
  
  // Submission dialog state
  const [submissionTask, setSubmissionTask] = useState<Task | null>(null);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);

  const getTasksByStage = (stageId: string | null) => {
    return tasks.filter((task) => task.stage_id === stageId);
  };

  const isUserAssignee = (task: Task) => {
    return task.task_assignments?.some(a => a.user_id === user?.id) || false;
  };

  const toggleStage = (stageId: string) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId);
    } else {
      newExpanded.add(stageId);
    }
    setExpandedStages(newExpanded);
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);

    try {
      await supabase.from('task_assignments').delete().eq('task_id', taskToDelete.id);
      await supabase.from('task_scores').delete().eq('task_id', taskToDelete.id);
      await supabase.from('submission_history').delete().eq('task_id', taskToDelete.id);
      const { error } = await supabase.from('tasks').delete().eq('id', taskToDelete.id);

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: user?.email || 'Unknown',
        action: 'DELETE_TASK',
        action_type: 'task',
        description: `Xóa task "${taskToDelete.title}"`,
        group_id: groupId,
        metadata: { task_id: taskToDelete.id, task_title: taskToDelete.title }
      });

      toast({
        title: 'Đã xóa task',
        description: `Task "${taskToDelete.title}" đã được xóa`,
      });
      setTaskToDelete(null);
      onRefresh();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể xóa task',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const openSubmissionDialog = (task: Task) => {
    setSubmissionTask(task);
    setIsSubmissionOpen(true);
  };

  const filteredStages = filterStage === 'all' 
    ? stages 
    : stages.filter(s => s.id === filterStage);

  const unstagedTasks = getTasksByStage(null);

  // Calculate stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
  const overdueTasks = tasks.filter(t => isOverdue(t.deadline) && t.status !== 'DONE' && t.status !== 'VERIFIED').length;

  return (
    <>
      {/* Header with stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Task & Giai đoạn</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{totalTasks} task</span>
              <span>•</span>
              <span className="text-success">{completedTasks} hoàn thành</span>
              {overdueTasks > 0 && (
                <>
                  <span>•</span>
                  <span className="text-destructive">{overdueTasks} trễ</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-48 h-9 bg-background">
            <SelectValue placeholder="Lọc giai đoạn" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Tất cả giai đoạn</SelectItem>
            {stages.map((stage, index) => {
              const color = getStageColor(index);
              return (
                <SelectItem key={stage.id} value={stage.id}>
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                    {stage.name}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Stage Sections */}
      <div className="space-y-4">
        {filteredStages.map((stage, stageIndex) => {
          const stageTasks = getTasksByStage(stage.id);
          const completedCount = stageTasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
          const overdueCount = stageTasks.filter(t => isOverdue(t.deadline) && t.status !== 'DONE' && t.status !== 'VERIFIED').length;
          const isExpanded = expandedStages.has(stage.id);
          const stageColor = getStageColor(stageIndex);
          const progressPercent = stageTasks.length > 0 ? (completedCount / stageTasks.length) * 100 : 0;

          return (
            <Card key={stage.id} className={`overflow-hidden border-2 ${isExpanded ? stageColor.border : ''}`}>
              <CardHeader 
                className={`py-3 px-4 cursor-pointer transition-colors ${stageColor.bg}`}
                onClick={() => toggleStage(stage.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                    <div className={`w-3 h-3 rounded-full ${stageColor.dot} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <CardTitle className={`text-base font-semibold flex items-center gap-2 ${stageColor.text}`}>
                        {stage.name}
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal">
                          {stageTasks.length}
                        </Badge>
                        {overdueCount > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 h-5">
                            {overdueCount} trễ
                          </Badge>
                        )}
                      </CardTitle>
                      {stage.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{stage.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2 min-w-[100px]">
                      <Progress value={progressPercent} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {Math.round(progressPercent)}%
                      </span>
                    </div>
                    {isLeaderInGroup && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditStage(stage); }}>
                            <Edit className="w-4 h-4 mr-2" />
                            Đổi tên
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDeleteStage(stage); }} className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Xóa giai đoạn
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="p-4 space-y-3">
                  {stageTasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-xl bg-muted/20">
                      <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Chưa có task nào trong giai đoạn này
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[400px]">
                      <div className="space-y-3 pr-2">
                        {stageTasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            stageName={stage.name}
                            stageColor={stageColor}
                            isLeaderInGroup={isLeaderInGroup}
                            isAssignee={isUserAssignee(task)}
                            onEditTask={onEditTask}
                            openSubmissionDialog={openSubmissionDialog}
                            setTaskToDelete={setTaskToDelete}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  
                  {isLeaderInGroup && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-muted-foreground hover:text-foreground border-dashed border-2 mt-2"
                      onClick={() => onCreateTask(stage.id)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Thêm task mới
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* Unstaged Tasks */}
        {filterStage === 'all' && unstagedTasks.length > 0 && (
          <Card className="overflow-hidden border-dashed border-2">
            <CardHeader className="py-3 px-4 bg-muted/20">
              <CardTitle className="text-base font-medium text-muted-foreground flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                Chưa phân giai đoạn
                <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal">
                  {unstagedTasks.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-3 pr-2">
                  {unstagedTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      stageName="Chưa phân"
                      stageColor={{ bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-muted', dot: 'bg-muted-foreground/50' }}
                      isLeaderInGroup={isLeaderInGroup}
                      isAssignee={isUserAssignee(task)}
                      onEditTask={onEditTask}
                      openSubmissionDialog={openSubmissionDialog}
                      setTaskToDelete={setTaskToDelete}
                    />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {stages.length === 0 && unstagedTasks.length === 0 && (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl bg-muted/10">
            <Layers className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium mb-1">Chưa có giai đoạn nào</p>
            <p className="text-sm">Tạo giai đoạn đầu tiên để bắt đầu quản lý task</p>
          </div>
        )}
      </div>

      {/* Delete Task Confirmation */}
      <AlertDialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa task</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa task <span className="font-semibold">"{taskToDelete?.title}"</span>?
              <br />
              Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xóa task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submission Dialog */}
      <TaskSubmissionDialog
        task={submissionTask}
        isOpen={isSubmissionOpen}
        onClose={() => {
          setIsSubmissionOpen(false);
          setSubmissionTask(null);
        }}
        onSave={onRefresh}
        isAssignee={submissionTask ? isUserAssignee(submissionTask) : false}
        isLeaderInGroup={isLeaderInGroup}
      />
    </>
  );
}
