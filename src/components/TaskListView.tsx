import { useState, useCallback } from 'react';
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
  Trash2,
  Edit,
  Loader2,
  Layers,
  ChevronDown,
  ChevronRight,
  Send,
  AlertTriangle,
  CheckCircle2,
  History,
  Clock,
  Target,
  GripVertical,
  Users,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Task, Stage, GroupMember } from '@/types/database';
import { formatDeadlineVN, isDeadlineOverdue } from '@/lib/datetime';
import TaskSubmissionDialog from './TaskSubmissionDialog';
import SubmissionHistoryPopup from './SubmissionHistoryPopup';
import SubmissionButton from './SubmissionButton';

// Stage color helper - returns a consistent color for each stage index
const getStageColor = (index: number) => {
  const colors = [
    { bg: 'bg-stage-1/10', text: 'text-stage-1', border: 'border-stage-1/30', dot: 'bg-stage-1', accent: 'bg-stage-1/20' },
    { bg: 'bg-stage-2/10', text: 'text-stage-2', border: 'border-stage-2/30', dot: 'bg-stage-2', accent: 'bg-stage-2/20' },
    { bg: 'bg-stage-3/10', text: 'text-stage-3', border: 'border-stage-3/30', dot: 'bg-stage-3', accent: 'bg-stage-3/20' },
    { bg: 'bg-stage-4/10', text: 'text-stage-4', border: 'border-stage-4/30', dot: 'bg-stage-4', accent: 'bg-stage-4/20' },
    { bg: 'bg-stage-5/10', text: 'text-stage-5', border: 'border-stage-5/30', dot: 'bg-stage-5', accent: 'bg-stage-5/20' },
    { bg: 'bg-stage-6/10', text: 'text-stage-6', border: 'border-stage-6/30', dot: 'bg-stage-6', accent: 'bg-stage-6/20' },
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
      return 'bg-muted text-muted-foreground border-muted';
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
    return 'Trễ';
  }
  switch (status) {
    case 'TODO':
      return 'Chờ';
    case 'IN_PROGRESS':
      return 'Đang làm';
    case 'DONE':
      return 'Xong';
    case 'VERIFIED':
      return 'Duyệt';
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
  return formatDeadlineVN(dateStr);
};

// Get main assignee name (first assignee)
const getMainAssignee = (task: Task) => {
  if (!task.task_assignments || task.task_assignments.length === 0) return null;
  return task.task_assignments[0].profiles?.full_name || null;
};

// Calculate task code: [stage_order].[task_order_within_stage]
const getTaskCode = (task: Task, allTasks: Task[], stages: Stage[]) => {
  if (!task.stage_id) return null;
  
  // Find stage order (1-indexed, based on created order)
  const sortedStages = [...stages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const stageOrder = sortedStages.findIndex(s => s.id === task.stage_id) + 1;
  if (stageOrder === 0) return null;
  
  // Find task order within stage (1-indexed, based on created order)
  const stageTasks = allTasks
    .filter(t => t.stage_id === task.stage_id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const taskOrder = stageTasks.findIndex(t => t.id === task.id) + 1;
  
  return `${stageOrder}.${taskOrder}`;
};

const isOverdue = (deadline: string | null) => isDeadlineOverdue(deadline);

// Horizontal TaskRow component with CSS Grid layout
interface TaskRowProps {
  task: Task;
  taskCode: string | null;
  stageColor: ReturnType<typeof getStageColor>;
  isLeaderInGroup: boolean;
  isAssignee: boolean;
  groupId: string;
  onEditTask: (task: Task) => void;
  openSubmissionDialog: (task: Task) => void;
  setTaskToDelete: (task: Task) => void;
  dragHandleProps?: any;
  isDragging?: boolean;
}

function TaskRow({
  task,
  taskCode,
  stageColor,
  isLeaderInGroup,
  isAssignee,
  groupId,
  onEditTask,
  openSubmissionDialog,
  setTaskToDelete,
  dragHandleProps,
  isDragging,
}: TaskRowProps) {
  const overdueStatus = isOverdue(task.deadline);
  const taskIsOverdue = overdueStatus && task.status !== 'DONE' && task.status !== 'VERIFIED';
  const canSubmit = isAssignee || isLeaderInGroup;
  const assignments = task.task_assignments || [];
  const hasMultipleAssignees = assignments.length > 1;

  return (
    <div 
      className={`group bg-card rounded-lg border transition-all hover:shadow-sm hover:border-primary/30 ${
        taskIsOverdue ? 'border-destructive/40 bg-destructive/5' : 'border-border'
      } ${isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''}`}
    >
      {/* Responsive grid: desktop has fixed columns; mobile stacks meta/actions to avoid overlap */}
      <div className="grid grid-cols-[32px_1fr] md:grid-cols-[32px_1fr_140px_70px_180px] gap-2 p-3 items-start md:items-center">
        {/* Column 1: Drag handle + Status bar */}
        <div className="flex flex-col items-center gap-1 pt-0.5 md:pt-0">
          {isLeaderInGroup && dragHandleProps && (
            <div 
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none"
              aria-label="Kéo để đổi thứ tự"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div
            className={`w-1 ${isLeaderInGroup && dragHandleProps ? 'h-6' : 'h-8'} rounded-full ${
              taskIsOverdue ? 'bg-destructive' : 
              task.status === 'VERIFIED' ? 'bg-success' :
              task.status === 'DONE' ? 'bg-primary' :
              task.status === 'IN_PROGRESS' ? 'bg-warning' : 'bg-muted-foreground/30'
            }`}
          />
        </div>
        
        {/* Column 2: Task code + Title + Assignees (flexible) */}
        <div 
          className={`flex items-start gap-2 min-w-0 overflow-hidden ${isLeaderInGroup ? 'cursor-pointer' : ''}`}
          onClick={() => isLeaderInGroup && onEditTask(task)}
        >
          {taskCode && (
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0.5 font-mono font-semibold bg-primary/5 border-primary/20 text-primary">
              {taskCode}
            </Badge>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5">
              {taskIsOverdue && (
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              )}
              <h4 className={`font-medium text-sm line-clamp-2 ${
                isLeaderInGroup ? 'group-hover:text-primary transition-colors' : ''
              }`}>
                {task.title}
              </h4>
            </div>
            
            {/* Assignees */}
            {assignments.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                {hasMultipleAssignees ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <div className="flex -space-x-1.5">
                            {assignments.slice(0, 3).map((assignment) => (
                              <Avatar key={assignment.id} className="w-5 h-5 border border-background">
                                <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                  {assignment.profiles ? getInitials(assignment.profiles.full_name) : '?'}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {assignments.length} thành viên
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <div className="space-y-1">
                          {assignments.map((a, idx) => (
                            <div key={a.id} className="flex items-center gap-2 text-xs">
                              <span className="font-medium">{idx + 1}.</span>
                              <span>{a.profiles?.full_name || 'Unknown'}</span>
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {assignments[0]?.profiles?.full_name || 'Unknown'}
                  </span>
                )}
              </div>
            )}

            {/* Mobile-only: deadline + status + actions in one row (prevents overlap) */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 md:hidden">
              <div className="flex items-center gap-2">
                {task.deadline ? (
                  <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md whitespace-nowrap ${
                    taskIsOverdue 
                      ? 'bg-destructive/10 text-destructive' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span className="max-w-[140px] truncate">{formatDate(task.deadline)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/50">—</span>
                )}

                <Badge 
                  className={`${getStatusColor(task.status, taskIsOverdue)} text-[10px] px-1.5 py-0.5 border whitespace-nowrap`}
                >
                  {getStatusLabel(task.status, taskIsOverdue)}
                </Badge>
              </div>

              <div className="flex items-center gap-1">
                <SubmissionHistoryPopup 
                  taskId={task.id}
                  groupId={groupId}
                  taskDeadline={task.deadline}
                  currentSubmissionLink={task.submission_link}
                />

                <SubmissionButton 
                  submissionLink={task.submission_link} 
                  variant="compact"
                  onStopPropagation={true}
                  taskId={task.id}
                  groupId={groupId}
                />

                {(isAssignee || isLeaderInGroup) && (
                  <Button
                    variant={task.submission_link ? "outline" : "default"}
                    size="sm"
                    className="h-7 text-xs px-2 gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      openSubmissionDialog(task);
                    }}
                  >
                    {task.submission_link ? (
                      <>
                        <Edit className="w-3 h-3" />
                        <span className="hidden sm:inline">Sửa</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span className="hidden sm:inline">Nộp</span>
                      </>
                    )}
                  </Button>
                )}

                {isLeaderInGroup && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-50 bg-popover min-w-[140px]">
                      <DropdownMenuItem onClick={() => onEditTask(task)} className="text-xs">
                        <Edit className="w-3.5 h-3.5 mr-2" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setTaskToDelete(task)} className="text-destructive text-xs">
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Xóa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Desktop-only columns */}
        <div className="hidden md:flex justify-end">
          {task.deadline ? (
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md whitespace-nowrap ${
              taskIsOverdue 
                ? 'bg-destructive/10 text-destructive' 
                : 'bg-muted text-muted-foreground'
            }`}>
              <Calendar className="w-3 h-3 shrink-0" />
              <span className="truncate">{formatDate(task.deadline)}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          )}
        </div>
        
        <div className="hidden md:flex justify-center">
          <Badge 
            className={`${getStatusColor(task.status, taskIsOverdue)} text-[10px] px-1.5 py-0.5 border whitespace-nowrap`}
          >
            {getStatusLabel(task.status, taskIsOverdue)}
          </Badge>
        </div>
        
        <div className="hidden md:flex items-center justify-end gap-1">
          <SubmissionHistoryPopup 
            taskId={task.id}
            groupId={groupId}
            taskDeadline={task.deadline}
            currentSubmissionLink={task.submission_link}
          />

          <SubmissionButton 
            submissionLink={task.submission_link} 
            variant="compact"
            onStopPropagation={true}
            taskId={task.id}
            groupId={groupId}
          />
          
          {(isAssignee || isLeaderInGroup) && (
            <Button
              variant={task.submission_link ? "outline" : "default"}
              size="sm"
              className="h-7 text-xs px-2 gap-1"
              onClick={(e) => {
                e.stopPropagation();
                openSubmissionDialog(task);
              }}
            >
              {task.submission_link ? (
                <>
                  <Edit className="w-3 h-3" />
                  <span className="hidden md:inline">Sửa</span>
                </>
              ) : (
                <>
                  <Send className="w-3 h-3" />
                  <span className="hidden md:inline">Nộp</span>
                </>
              )}
            </Button>
          )}

          {isLeaderInGroup && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 bg-popover min-w-[140px]">
                <DropdownMenuItem onClick={() => onEditTask(task)} className="text-xs">
                  <Edit className="w-3.5 h-3.5 mr-2" />
                  Chỉnh sửa
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTaskToDelete(task)} className="text-destructive text-xs">
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Xóa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
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
  
  // Local task order for drag & drop (maps stage_id -> ordered task ids)
  const [localTaskOrder, setLocalTaskOrder] = useState<Record<string, string[]>>({});

  const getTasksByStage = useCallback((stageId: string | null) => {
    const stageTasks = tasks.filter((task) => task.stage_id === stageId);
    
    // If we have a local order for this stage, use it
    const stageKey = stageId || 'unstaged';
    if (localTaskOrder[stageKey]) {
      const orderedIds = localTaskOrder[stageKey];
      return stageTasks.sort((a, b) => {
        const indexA = orderedIds.indexOf(a.id);
        const indexB = orderedIds.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
    }
    
    // Default sort by created_at
    return stageTasks.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [tasks, localTaskOrder]);

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
  
  // Handle drag & drop reordering
  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    
    const stageId = source.droppableId === 'unstaged' ? null : source.droppableId;
    const stageKey = source.droppableId;
    const stageTasks = getTasksByStage(stageId);
    
    // Reorder the tasks
    const newOrder = [...stageTasks.map(t => t.id)];
    newOrder.splice(source.index, 1);
    newOrder.splice(destination.index, 0, draggableId);
    
    // Update local state immediately for smooth UX
    setLocalTaskOrder(prev => ({
      ...prev,
      [stageKey]: newOrder
    }));
    
    // Log activity
    try {
      const movedTask = tasks.find(t => t.id === draggableId);
      if (movedTask && user) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          user_name: user.email || 'Unknown',
          action: 'REORDER_TASK',
          action_type: 'task',
          description: `Sắp xếp lại task "${movedTask.title}"`,
          group_id: groupId,
          metadata: { task_id: draggableId, new_position: destination.index + 1 }
        });
      }
    } catch (error) {
      console.error('Error logging reorder:', error);
    }
  }, [getTasksByStage, tasks, user, groupId]);

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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Không thể xóa task';
      toast({
        title: 'Lỗi',
        description: errorMessage,
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
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;

  return (
    <>
      {/* Header with stats - Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Task & Giai đoạn</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">{totalTasks} task</span>
              <span className="text-success">• {completedTasks} xong</span>
              {inProgressTasks > 0 && <span className="text-warning">• {inProgressTasks} đang làm</span>}
              {overdueTasks > 0 && <span className="text-destructive">• {overdueTasks} trễ</span>}
            </div>
          </div>
        </div>
        
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-44 h-8 text-xs bg-background">
            <SelectValue placeholder="Lọc giai đoạn" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all" className="text-xs">Tất cả giai đoạn</SelectItem>
            {stages.map((stage, index) => {
              const color = getStageColor(index);
              return (
                <SelectItem key={stage.id} value={stage.id} className="text-xs">
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

      {/* Stage Sections with Drag & Drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {filteredStages.map((stage, stageIndex) => {
            const stageTasks = getTasksByStage(stage.id);
            const completedCount = stageTasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
            const overdueCount = stageTasks.filter(t => isOverdue(t.deadline) && t.status !== 'DONE' && t.status !== 'VERIFIED').length;
            const isExpanded = expandedStages.has(stage.id);
            const stageColor = getStageColor(stageIndex);
            const progressPercent = stageTasks.length > 0 ? (completedCount / stageTasks.length) * 100 : 0;

            return (
              <Card key={stage.id} className={`overflow-hidden border-l-4 ${stageColor.border} shadow-sm`}>
                {/* Stage Header */}
                <CardHeader 
                  className={`py-2.5 px-4 cursor-pointer transition-colors ${stageColor.bg} hover:opacity-90`}
                  onClick={() => toggleStage(stage.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 p-0">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </Button>
                      <div className={`w-2.5 h-2.5 rounded-full ${stageColor.dot} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <CardTitle className={`text-sm font-bold ${stageColor.text} truncate`}>
                          {stage.name}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-medium">
                          {completedCount}/{stageTasks.length}
                        </Badge>
                        {overdueCount > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 h-5">
                            {overdueCount} trễ
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Progress bar */}
                      <div className="hidden sm:flex items-center gap-1.5 w-24">
                        <Progress value={progressPercent} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-muted-foreground w-7 text-right">
                          {Math.round(progressPercent)}%
                        </span>
                      </div>
                      
                      {isLeaderInGroup && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover min-w-[120px]">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditStage(stage); }} className="text-xs">
                              <Edit className="w-3.5 h-3.5 mr-2" />
                              Đổi tên
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDeleteStage(stage); }} className="text-destructive text-xs">
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                {/* Tasks List with Drag & Drop */}
                {isExpanded && (
                  <CardContent className="p-3">
                    {stageTasks.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-xs border border-dashed rounded-lg bg-muted/10">
                        <Layers className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                        Chưa có task
                      </div>
                    ) : (
                      <Droppable droppableId={stage.id}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="space-y-2"
                          >
                            {stageTasks.map((task, index) => (
                              <Draggable 
                                key={task.id} 
                                draggableId={task.id} 
                                index={index}
                                isDragDisabled={!isLeaderInGroup}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                  >
                                    <TaskRow
                                      task={task}
                                      taskCode={getTaskCode(task, tasks, stages)}
                                      stageColor={stageColor}
                                      isLeaderInGroup={isLeaderInGroup}
                                      isAssignee={isUserAssignee(task)}
                                      groupId={groupId}
                                      onEditTask={onEditTask}
                                      openSubmissionDialog={openSubmissionDialog}
                                      setTaskToDelete={setTaskToDelete}
                                      dragHandleProps={provided.dragHandleProps}
                                      isDragging={snapshot.isDragging}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                    {isLeaderInGroup && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center text-muted-foreground hover:text-foreground border-dashed border mt-2.5 h-8 text-xs"
                        onClick={() => onCreateTask(stage.id)}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Thêm task
                      </Button>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Unstaged Tasks with Drag & Drop */}
          {filterStage === 'all' && unstagedTasks.length > 0 && (
            <Card className="overflow-hidden border-dashed border-l-4 border-l-muted-foreground/30">
              <CardHeader className="py-2.5 px-4 bg-muted/20">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
                  Chưa phân giai đoạn
                  <Badge variant="secondary" className="text-[10px] px-1.5 h-5">
                    {unstagedTasks.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <Droppable droppableId="unstaged">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-2"
                    >
                      {unstagedTasks.map((task, index) => (
                        <Draggable 
                          key={task.id} 
                          draggableId={task.id} 
                          index={index}
                          isDragDisabled={!isLeaderInGroup}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                            >
                              <TaskRow
                                task={task}
                                taskCode={null}
                                stageColor={{ bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-muted', dot: 'bg-muted-foreground/50', accent: 'bg-muted/50' }}
                                isLeaderInGroup={isLeaderInGroup}
                                isAssignee={isUserAssignee(task)}
                                groupId={groupId}
                                onEditTask={onEditTask}
                                openSubmissionDialog={openSubmissionDialog}
                                setTaskToDelete={setTaskToDelete}
                                dragHandleProps={provided.dragHandleProps}
                                isDragging={snapshot.isDragging}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {stages.length === 0 && unstagedTasks.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl bg-muted/10">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-1">Chưa có giai đoạn nào</p>
              <p className="text-sm">Tạo giai đoạn đầu tiên để bắt đầu</p>
            </div>
          )}
        </div>
      </DragDropContext>

      {/* Delete Task Confirmation */}
      <AlertDialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa task</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              Bạn có chắc muốn xóa task <span className="font-semibold">"{taskToDelete?.title}"</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xóa'}
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
