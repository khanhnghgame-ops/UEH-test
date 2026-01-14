import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Calendar, Clock, CheckCircle, Circle, AlertCircle, 
  ChevronDown, ChevronRight, ExternalLink, Eye, File,
  List, LayoutGrid, Layers
} from 'lucide-react';
import { formatDeadlineVN, parseLocalDateTime } from '@/lib/datetime';
import type { Stage, Task, TaskAssignment } from '@/types/database';

interface PublicTaskListViewProps {
  stages: Stage[];
  tasks: Task[];
  groupId?: string;
}

type ViewMode = 'compact' | 'detailed';

export default function PublicTaskListView({ stages, tasks, groupId }: PublicTaskListViewProps) {
  const navigate = useNavigate();
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(stages.map(s => s.id)));
  const [viewMode, setViewMode] = useState<ViewMode>('compact');

  // Sort stages by created_at to match internal numbering
  const sortedStages = [...stages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Get task code consistent with internal system
  const getTaskCode = (task: Task, stageId: string | null) => {
    if (!stageId) return null;
    
    // Find stage order (1-indexed, based on created order)
    const stageOrder = sortedStages.findIndex(s => s.id === stageId) + 1;
    if (stageOrder === 0) return null;
    
    // Find task order within stage (1-indexed, based on created order)
    const stageTasks = tasks
      .filter(t => t.stage_id === stageId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const taskOrder = stageTasks.findIndex(t => t.id === task.id) + 1;
    
    return `${stageOrder}.${taskOrder}`;
  };

  // Get sorted tasks for a stage
  const getSortedStageTasks = (stageId: string) => {
    return tasks
      .filter(t => t.stage_id === stageId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  };

  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    const d = parseLocalDateTime(deadline);
    return d ? d.getTime() < Date.now() : false;
  };

  const getStatusConfig = (status: string, deadline: string | null) => {
    const overdue = isOverdue(deadline) && status !== 'DONE' && status !== 'VERIFIED';
    
    if (overdue) {
      return { label: 'Quá hạn', color: 'bg-destructive text-destructive-foreground', icon: AlertCircle, iconColor: 'text-destructive' };
    }
    
    switch (status) {
      case 'TODO':
        return { label: 'Chưa làm', color: 'bg-muted text-muted-foreground', icon: Circle, iconColor: 'text-muted-foreground' };
      case 'IN_PROGRESS':
        return { label: 'Đang làm', color: 'bg-warning text-warning-foreground', icon: Clock, iconColor: 'text-warning' };
      case 'DONE':
        return { label: 'Hoàn thành', color: 'bg-primary text-primary-foreground', icon: CheckCircle, iconColor: 'text-primary' };
      case 'VERIFIED':
        return { label: 'Đã duyệt', color: 'bg-success text-success-foreground', icon: CheckCircle, iconColor: 'text-success' };
      default:
        return { label: status, color: 'bg-muted', icon: Circle, iconColor: 'text-muted-foreground' };
    }
  };

  const toggleTaskExpand = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const toggleStageExpand = (stageId: string) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId);
    } else {
      newExpanded.add(stageId);
    }
    setExpandedStages(newExpanded);
  };

  const parseSubmissionLinks = (submissionLink: string | null) => {
    if (!submissionLink) return [];
    try {
      const parsed = JSON.parse(submissionLink);
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          ...item,
          type: item.file_path ? 'file' : 'link'
        }));
      }
      return [{ title: 'Bài nộp', url: submissionLink, type: 'link' }];
    } catch {
      return [{ title: 'Bài nộp', url: submissionLink, type: 'link' }];
    }
  };

  const handleOpenItem = (item: any, taskId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (item.type === 'file' && item.file_path) {
      const params = new URLSearchParams();
      params.set('path', item.file_path);
      params.set('name', item.file_name || 'file');
      params.set('size', (item.file_size || 0).toString());
      if (taskId) params.set('taskId', taskId);
      if (groupId) params.set('groupId', groupId);
      navigate(`/file-preview?${params.toString()}`);
    } else if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  const renderSubmissionButton = (submissionLink: string | null, taskId?: string) => {
    const items = parseSubmissionLinks(submissionLink);
    if (items.length === 0) return null;

    if (items.length === 1) {
      const item = items[0];
      const isFile = item.type === 'file';
      
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 text-primary shrink-0"
          onClick={(e) => handleOpenItem(item, taskId, e)}
        >
          {isFile ? <Eye className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isFile ? 'Xem file' : 'Xem bài'}</span>
        </Button>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 text-primary shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xem bài</span>
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{items.length}</Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover min-w-[180px]">
          {items.map((item: any, i: number) => {
            const isFile = item.type === 'file';
            return (
              <DropdownMenuItem 
                key={i}
                onClick={(e) => handleOpenItem(item, taskId, e)}
                className="text-xs cursor-pointer gap-2"
              >
                {isFile ? <File className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                <span className="truncate flex-1">{item.title || item.file_name || `Bài ${i + 1}`}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Compact task item - Mobile first, minimal
  const CompactTaskItem = ({ task, taskCode }: { task: Task; taskCode: string }) => {
    const config = getStatusConfig(task.status, task.deadline);
    const StatusIcon = config.icon;
    const isTaskExpanded = expandedTasks.has(task.id);
    const overdueStatus = isOverdue(task.deadline) && task.status !== 'DONE' && task.status !== 'VERIFIED';

    return (
      <Collapsible open={isTaskExpanded} onOpenChange={() => toggleTaskExpand(task.id)}>
        <CollapsibleTrigger asChild>
          <div
            className={`w-full rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
              overdueStatus ? 'border-destructive/40 bg-destructive/5' : 'bg-card'
            }`}
          >
            {/* Row 1: Status icon + Title + Expand arrow */}
            <div className="flex items-start gap-2 w-full">
              <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${config.iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-tight line-clamp-2">{task.title}</p>
              </div>
              <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${isTaskExpanded ? 'rotate-90' : ''}`} />
            </div>
            
            {/* Row 2: Task code + Deadline + Status badge - stacked vertically on small screens */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-6">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono bg-primary/5 border-primary/20 text-primary">
                {taskCode}
              </Badge>
              {task.deadline && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDeadlineVN(task.deadline)}
                </span>
              )}
              <Badge className={`${config.color} text-[10px] px-1.5 py-0 ml-auto`}>
                {config.label}
              </Badge>
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="mt-2 ml-4 p-3 rounded-lg bg-muted/40 border-l-2 border-primary/30 space-y-3">
            {task.description && (
              <p className="text-sm text-muted-foreground">{task.description}</p>
            )}
            
            {task.task_assignments && task.task_assignments.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Người phụ trách:</p>
                <div className="flex flex-wrap gap-1">
                  {task.task_assignments.map((a: TaskAssignment) => (
                    <Badge key={a.id} variant="secondary" className="text-xs">
                      {a.profiles?.full_name || 'Unknown'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {task.submission_link && (
              <div className="pt-1">
                {renderSubmissionButton(task.submission_link, task.id)}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  // Detailed task item - More info visible
  const DetailedTaskItem = ({ task, taskCode }: { task: Task; taskCode: string }) => {
    const config = getStatusConfig(task.status, task.deadline);
    const StatusIcon = config.icon;
    const overdueStatus = isOverdue(task.deadline) && task.status !== 'DONE' && task.status !== 'VERIFIED';

    return (
      <div className={`rounded-lg border p-4 space-y-3 ${
        overdueStatus ? 'border-destructive/40 bg-destructive/5' : 'bg-card'
      }`}>
        {/* Header: Code + Status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-mono bg-primary/5 border-primary/20 text-primary">
            {taskCode}
          </Badge>
          <Badge className={`${config.color} text-[10px] px-2 py-0.5`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {config.label}
          </Badge>
        </div>
        
        {/* Title */}
        <h4 className="font-medium text-sm leading-snug">{task.title}</h4>
        
        {/* Description */}
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}
        
        {/* Meta: Deadline + Assignees */}
        <div className="space-y-2">
          {task.deadline && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>{formatDeadlineVN(task.deadline)}</span>
            </div>
          )}
          
          {task.task_assignments && task.task_assignments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.task_assignments.slice(0, 3).map((a: TaskAssignment) => (
                <Badge key={a.id} variant="secondary" className="text-[10px] px-1.5">
                  {a.profiles?.full_name || '?'}
                </Badge>
              ))}
              {task.task_assignments.length > 3 && (
                <Badge variant="outline" className="text-[10px] px-1.5">
                  +{task.task_assignments.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
        
        {/* Action */}
        {task.submission_link && (
          <div className="pt-1 border-t">
            {renderSubmissionButton(task.submission_link, task.id)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Danh sách Task
        </h2>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setViewMode('compact')}
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Gọn</span>
          </Button>
          <Button
            variant={viewMode === 'detailed' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setViewMode('detailed')}
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Chi tiết</span>
          </Button>
        </div>
      </div>

      {/* Stages */}
      {sortedStages.map((stage, stageIndex) => {
        const stageTasks = getSortedStageTasks(stage.id);
        const completedTasks = stageTasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
        const stageProgress = stageTasks.length > 0 ? Math.round((completedTasks / stageTasks.length) * 100) : 0;
        const isExpanded = expandedStages.has(stage.id);

        return (
          <Card key={stage.id} className="overflow-hidden">
            {/* Stage Header - Simplified, no overlap */}
            <Collapsible open={isExpanded} onOpenChange={() => toggleStageExpand(stage.id)}>
              <CollapsibleTrigger asChild>
                <CardHeader className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                  {/* Row 1: Expand arrow + Stage number + Stage name */}
                  <div className="flex items-center gap-2">
                    <ChevronRight className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {stageIndex + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold truncate">{stage.name}</CardTitle>
                    </div>
                  </div>
                  
                  {/* Row 2: Progress bar + Stats - always on new row for mobile */}
                  <div className="flex items-center gap-3 mt-3 pl-9">
                    <Progress value={stageProgress} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {completedTasks}/{stageTasks.length}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                      {stageProgress}%
                    </Badge>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <CardContent className="pt-0 pb-4 px-4">
                  {stageTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6 bg-muted/30 rounded-lg">
                      Chưa có task trong giai đoạn này
                    </p>
                  ) : viewMode === 'compact' ? (
                    <div className="space-y-2">
                      {stageTasks.map((task) => (
                        <CompactTaskItem 
                          key={task.id} 
                          task={task} 
                          taskCode={getTaskCode(task, task.stage_id) || `${stageIndex + 1}.?`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {stageTasks.map((task) => (
                        <DetailedTaskItem 
                          key={task.id} 
                          task={task} 
                          taskCode={getTaskCode(task, task.stage_id) || `${stageIndex + 1}.?`}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      {/* Unstaged Tasks */}
      {tasks.filter(t => !t.stage_id).length > 0 && (
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-base text-muted-foreground">Chưa phân giai đoạn</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4 px-4">
            {(() => {
              const unstagedTasks = tasks
                .filter(t => !t.stage_id)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              
              return viewMode === 'compact' ? (
                <div className="space-y-2">
                  {unstagedTasks.map((task, index) => (
                    <CompactTaskItem 
                      key={task.id} 
                      task={task} 
                      taskCode={`?.${index + 1}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {unstagedTasks.map((task, index) => (
                    <DetailedTaskItem 
                      key={task.id} 
                      task={task} 
                      taskCode={`?.${index + 1}`}
                    />
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {stages.length === 0 && tasks.length === 0 && (
        <Card className="p-8 text-center">
          <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Chưa có task hoặc giai đoạn nào</p>
        </Card>
      )}
    </div>
  );
}
