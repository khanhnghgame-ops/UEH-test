import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import UserAvatar from '@/components/UserAvatar';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Plus,
  MoreVertical,
  Calendar,
  ExternalLink,
  Trash2,
  Edit,
  Loader2,
  Users,
  GripVertical,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Task, Stage, GroupMember, Profile } from '@/types/database';
import { formatDateVN, isDeadlineOverdue } from '@/lib/datetime';

interface KanbanBoardProps {
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

export default function KanbanBoard({
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
}: KanbanBoardProps) {
  const { toast } = useToast();
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getTasksByStage = (stageId: string | null) => {
    return tasks.filter((task) => task.stage_id === stageId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'TODO':
        return 'bg-muted text-muted-foreground';
      case 'IN_PROGRESS':
        return 'bg-warning/10 text-warning';
      case 'DONE':
        return 'bg-primary/10 text-primary';
      case 'VERIFIED':
        return 'bg-success/10 text-success';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
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
        return 100;
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
    return formatDateVN(dateStr);
  };

  const isOverdue = (deadline: string | null) => {
    return isDeadlineOverdue(deadline);
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !isLeaderInGroup) return;

    const taskId = result.draggableId;
    const newStageId = result.destination.droppableId === 'unstaged' ? null : result.destination.droppableId;

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ stage_id: newStageId })
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: 'Đã di chuyển task',
        description: 'Task đã được chuyển sang giai đoạn mới',
      });
      onRefresh();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể di chuyển task',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);

    try {
      // Delete task assignments first
      await supabase
        .from('task_assignments')
        .delete()
        .eq('task_id', taskToDelete.id);

      // Delete task scores
      await supabase
        .from('task_scores')
        .delete()
        .eq('task_id', taskToDelete.id);

      // Delete submission history
      await supabase
        .from('submission_history')
        .delete()
        .eq('task_id', taskToDelete.id);

      // Finally delete the task
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskToDelete.id);

      if (error) throw error;

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

  const TaskCard = ({ task, index }: { task: Task; index: number }) => {
    const stageName = stages.find(s => s.id === task.stage_id)?.name || 'Chưa phân giai đoạn';
    const progress = getProgressPercent(task.status);

    return (
      <Draggable draggableId={task.id} index={index} isDragDisabled={!isLeaderInGroup}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`mb-3 ${snapshot.isDragging ? 'opacity-70' : ''}`}
          >
            <Card className="hover:shadow-md transition-shadow bg-card">
              <CardContent className="p-4">
                {/* Header: Title + Actions */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isLeaderInGroup && (
                      <div {...provided.dragHandleProps} className="cursor-grab">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <h3 
                      className="font-semibold text-sm truncate cursor-pointer hover:text-primary"
                      onClick={() => onEditTask(task)}
                    >
                      {task.title}
                    </h3>
                  </div>
                  {isLeaderInGroup && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditTask(task)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Chỉnh sửa
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setTaskToDelete(task)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Xóa task
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Status + Stage */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge className={`${getStatusColor(task.status)} text-xs`}>
                    {getStatusLabel(task.status)}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {stageName}
                  </Badge>
                </div>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Tiến độ</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>

                {/* Deadline */}
                {task.deadline && (
                  <div className={`flex items-center gap-1 text-xs mb-3 ${
                    isOverdue(task.deadline) && task.status !== 'DONE' && task.status !== 'VERIFIED'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }`}>
                    <Calendar className="w-3 h-3" />
                    <span>
                      {isOverdue(task.deadline) && task.status !== 'DONE' && task.status !== 'VERIFIED'
                        ? 'Quá hạn: '
                        : 'Deadline: '}
                      {formatDate(task.deadline)}
                    </span>
                  </div>
                )}

                {/* Assignees */}
                {task.task_assignments && task.task_assignments.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <div className="flex -space-x-2">
                      {task.task_assignments.slice(0, 3).map((assignment) => (
                        <UserAvatar 
                          key={assignment.id}
                          src={assignment.profiles?.avatar_url}
                          name={assignment.profiles?.full_name}
                          size="xs"
                          className="border-2 border-background"
                        />
                      ))}
                      {task.task_assignments.length > 3 && (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] border-2 border-background">
                          +{task.task_assignments.length - 3}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {task.task_assignments[0]?.profiles?.full_name}
                      {task.task_assignments.length > 1 && ` +${task.task_assignments.length - 1}`}
                    </span>
                  </div>
                )}

                {/* Submission Link */}
                {task.submission_link && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-xs h-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(task.submission_link!, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Mở link bài nộp
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </Draggable>
    );
  };

  const StageColumn = ({ stage, tasks }: { stage: Stage | null; tasks: Task[] }) => {
    const stageId = stage?.id || 'unstaged';
    const stageName = stage?.name || 'Chưa phân giai đoạn';
    const completedCount = tasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
    const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    return (
      <div className="w-80 flex-shrink-0">
        <Card className="bg-muted/30 h-full flex flex-col">
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm font-semibold truncate">
                  {stageName}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {tasks.length} task • {completedCount} hoàn thành
                </p>
              </div>
              {isLeaderInGroup && stage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditStage(stage)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Đổi tên
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onDeleteStage(stage)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Xóa giai đoạn
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {tasks.length > 0 && (
              <Progress value={progress} className="h-1 mt-2" />
            )}
          </CardHeader>
          <Droppable droppableId={stageId}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`flex-1 p-3 pt-0 overflow-y-auto min-h-[200px] ${
                  snapshot.isDraggingOver ? 'bg-primary/5' : ''
                }`}
              >
                {tasks.map((task, index) => (
                  <TaskCard key={task.id} task={task} index={index} />
                ))}
                {provided.placeholder}
                
                {isLeaderInGroup && stage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-foreground"
                    onClick={() => onCreateTask(stage.id)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Thêm task
                  </Button>
                )}
              </div>
            )}
          </Droppable>
        </Card>
      </div>
    );
  };

  const unstagedTasks = getTasksByStage(null);

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              tasks={getTasksByStage(stage.id)}
            />
          ))}
          
          {/* Unstaged tasks column */}
          {unstagedTasks.length > 0 && (
            <StageColumn stage={null} tasks={unstagedTasks} />
          )}

          {/* Empty state when no stages */}
          {stages.length === 0 && unstagedTasks.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-16 text-center">
              <div>
                <p className="text-muted-foreground mb-4">
                  Chưa có giai đoạn nào. Hãy tạo giai đoạn đầu tiên để bắt đầu.
                </p>
              </div>
            </div>
          )}
        </div>
      </DragDropContext>

      {/* Delete Task Confirmation */}
      <AlertDialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa task</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa task <span className="font-semibold">"{taskToDelete?.title}"</span>?
              <br />
              Hành động này không thể hoàn tác và sẽ xóa toàn bộ dữ liệu liên quan đến task này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Xóa task'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
