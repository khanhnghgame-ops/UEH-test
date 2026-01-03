import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Calendar, Clock, CheckCircle, Circle, AlertCircle, Layers, 
  ChevronDown, ChevronRight, Link as LinkIcon, ExternalLink, Eye, File, FileText
} from 'lucide-react';
import { formatDeadlineVN, parseLocalDateTime } from '@/lib/datetime';
import type { Stage, Task, TaskAssignment } from '@/types/database';

interface PublicTaskListViewProps {
  stages: Stage[];
  tasks: Task[];
}

export default function PublicTaskListView({ stages, tasks }: PublicTaskListViewProps) {
  const navigate = useNavigate();
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(stages.map(s => s.id)));

  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    const d = parseLocalDateTime(deadline);
    return d ? d.getTime() < Date.now() : false;
  };

  const getStatusConfig = (status: string, deadline: string | null) => {
    const overdue = isOverdue(deadline) && status !== 'DONE' && status !== 'VERIFIED';
    
    if (overdue) {
      return { label: 'Quá hạn', color: 'bg-destructive text-destructive-foreground', icon: AlertCircle };
    }
    
    switch (status) {
      case 'TODO':
        return { label: 'Chưa làm', color: 'bg-muted text-muted-foreground', icon: Circle };
      case 'IN_PROGRESS':
        return { label: 'Đang làm', color: 'bg-warning text-warning-foreground', icon: Clock };
      case 'DONE':
        return { label: 'Hoàn thành', color: 'bg-primary text-primary-foreground', icon: CheckCircle };
      case 'VERIFIED':
        return { label: 'Đã duyệt', color: 'bg-success text-success-foreground', icon: CheckCircle };
      default:
        return { label: status, color: 'bg-muted', icon: Circle };
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

  const handleOpenItem = (item: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (item.type === 'file' && item.file_path) {
      const params = new URLSearchParams({
        path: item.file_path,
        name: item.file_name || 'file',
        size: (item.file_size || 0).toString()
      });
      navigate(`/file-preview?${params.toString()}`);
    } else if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  const renderSubmissionLinks = (submissionLink: string | null) => {
    const items = parseSubmissionLinks(submissionLink);
    if (items.length === 0) return null;

    if (items.length === 1) {
      const item = items[0];
      const isFile = item.type === 'file';
      
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 text-primary"
          onClick={(e) => handleOpenItem(item, e)}
        >
          {isFile ? (
            <>
              <Eye className="w-3 h-3" />
              Xem file
            </>
          ) : (
            <>
              <ExternalLink className="w-3 h-3" />
              Xem bài nộp
            </>
          )}
        </Button>
      );
    }

    // Multiple items
    const hasFiles = items.some(i => i.type === 'file');
    const label = hasFiles ? `Xem bài (${items.length})` : `Xem bài (${items.length} link)`;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 gap-1 text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
            {label}
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover min-w-[200px]">
          {items.map((item: any, i: number) => {
            const isFile = item.type === 'file';
            return (
              <DropdownMenuItem 
                key={i}
                onClick={(e) => handleOpenItem(item, e)}
                className="text-xs cursor-pointer"
              >
                {isFile ? (
                  <>
                    <File className="w-3 h-3 mr-2" />
                    <span className="truncate">{item.title || item.file_name || 'File'}</span>
                    <Eye className="w-3 h-3 ml-auto opacity-50" />
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-3 h-3 mr-2" />
                    <span className="truncate">{item.title || `Link ${i + 1}`}</span>
                  </>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-4">
      {stages.map((stage, stageIndex) => {
        const stageTasks = tasks.filter(t => t.stage_id === stage.id);
        const completedTasks = stageTasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
        const stageProgress = stageTasks.length > 0 ? Math.round((completedTasks / stageTasks.length) * 100) : 0;
        const isExpanded = expandedStages.has(stage.id);

        return (
          <Card key={stage.id}>
            <CardHeader 
              className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg"
              onClick={() => toggleStageExpand(stage.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {stageIndex + 1}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{stage.name}</CardTitle>
                    {stage.description && (
                      <CardDescription className="text-sm">{stage.description}</CardDescription>
                    )}
                  </div>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div>
                    <div className="text-sm font-medium">{completedTasks}/{stageTasks.length} task</div>
                    <Progress value={stageProgress} className="h-1.5 w-24 mt-1" />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {stageProgress}%
                  </Badge>
                </div>
              </div>
            </CardHeader>
            
            {isExpanded && (
              <CardContent>
                {stageTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Chưa có task trong giai đoạn này
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stageTasks.map((task, taskIndex) => {
                      const config = getStatusConfig(task.status, task.deadline);
                      const StatusIcon = config.icon;
                      const isTaskExpanded = expandedTasks.has(task.id);
                      const taskCode = `${stageIndex + 1}.${taskIndex + 1}`;
                      const overdueStatus = isOverdue(task.deadline) && task.status !== 'DONE' && task.status !== 'VERIFIED';
                      
                      return (
                        <div key={task.id} className="space-y-2">
                          <div
                            className={`flex items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                              overdueStatus ? 'border-destructive/40 bg-destructive/5' : 'bg-card'
                            }`}
                            onClick={() => toggleTaskExpand(task.id)}
                          >
                            {/* Status indicator bar */}
                            <div className={`w-1 h-10 rounded-full shrink-0 ${
                              overdueStatus ? 'bg-destructive' : 
                              task.status === 'VERIFIED' ? 'bg-success' :
                              task.status === 'DONE' ? 'bg-primary' :
                              task.status === 'IN_PROGRESS' ? 'bg-warning' : 'bg-muted-foreground/30'
                            }`} />
                            
                            {/* Task code */}
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-mono font-semibold bg-primary/5 border-primary/20 text-primary shrink-0">
                              {taskCode}
                            </Badge>
                            
                            <StatusIcon className={`w-4 h-4 shrink-0 ${
                              config.label === 'Quá hạn' ? 'text-destructive' :
                              config.label === 'Hoàn thành' || config.label === 'Đã duyệt' ? 'text-success' :
                              config.label === 'Đang làm' ? 'text-warning' : 'text-muted-foreground'
                            }`} />
                            
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{task.title}</div>
                              {task.deadline && (
                                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Calendar className="w-3 h-3" />
                                  {formatDeadlineVN(task.deadline)}
                                </div>
                              )}
                            </div>

                            {/* Submission link button */}
                            {task.submission_link && renderSubmissionLinks(task.submission_link)}

                            <Badge className={`${config.color} text-[10px] px-1.5 py-0.5 shrink-0`}>
                              {config.label}
                            </Badge>

                            {/* Assignees */}
                            {task.task_assignments && task.task_assignments.length > 0 && (
                              <div className="hidden md:flex -space-x-1.5">
                                {task.task_assignments.slice(0, 2).map((assignment: TaskAssignment) => (
                                  <Avatar key={assignment.id} className="w-6 h-6 border-2 border-background">
                                    <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                      {assignment.profiles ? getInitials(assignment.profiles.full_name) : '?'}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                                {task.task_assignments.length > 2 && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    +{task.task_assignments.length - 2}
                                  </span>
                                )}
                              </div>
                            )}

                            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${
                              isTaskExpanded ? 'rotate-90' : ''
                            }`} />
                          </div>

                          {/* Expanded Task Detail */}
                          {isTaskExpanded && (
                            <Card className="ml-6 border-l-4 border-l-primary/30 bg-muted/30">
                              <CardContent className="p-4 space-y-3">
                                {task.description && (
                                  <div>
                                    <span className="text-sm font-medium">Mô tả:</span>
                                    <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                                  </div>
                                )}
                                
                                {task.deadline && (
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">
                                      Deadline: {formatDeadlineVN(task.deadline)}
                                    </span>
                                  </div>
                                )}
                                
                                {task.submission_link && (
                                  <div className="flex items-center gap-2">
                                    <LinkIcon className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">Bài nộp:</span>
                                    {renderSubmissionLinks(task.submission_link)}
                                  </div>
                                )}

                                {task.task_assignments && task.task_assignments.length > 0 && (
                                  <div>
                                    <div className="text-sm font-medium mb-2">Người phụ trách:</div>
                                    <div className="flex flex-wrap gap-2">
                                      {task.task_assignments.map((assignment: TaskAssignment) => (
                                        <Badge key={assignment.id} variant="secondary" className="gap-1.5">
                                          <Avatar className="w-4 h-4">
                                            <AvatarFallback className="text-[10px]">
                                              {assignment.profiles?.full_name?.charAt(0) || '?'}
                                            </AvatarFallback>
                                          </Avatar>
                                          {assignment.profiles?.full_name || 'Unknown'}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Unstaged Tasks */}
      {tasks.filter(t => !t.stage_id).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-muted-foreground">Chưa phân giai đoạn</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tasks.filter(t => !t.stage_id).map(task => {
                const config = getStatusConfig(task.status, task.deadline);
                const StatusIcon = config.icon;
                const isTaskExpanded = expandedTasks.has(task.id);
                
                return (
                  <div key={task.id} className="space-y-2">
                    <div
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => toggleTaskExpand(task.id)}
                    >
                      <StatusIcon className={`w-4 h-4 shrink-0 ${
                        config.label === 'Quá hạn' ? 'text-destructive' :
                        config.label === 'Hoàn thành' || config.label === 'Đã duyệt' ? 'text-success' :
                        config.label === 'Đang làm' ? 'text-warning' : 'text-muted-foreground'
                      }`} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{task.title}</div>
                        {task.deadline && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {formatDeadlineVN(task.deadline)}
                          </div>
                        )}
                      </div>

                      {task.submission_link && renderSubmissionLinks(task.submission_link)}
                      <Badge className={config.color}>{config.label}</Badge>
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${
                        isTaskExpanded ? 'rotate-90' : ''
                      }`} />
                    </div>

                    {isTaskExpanded && (
                      <Card className="ml-4 border-l-4 border-l-muted bg-muted/30">
                        <CardContent className="p-4 space-y-3">
                          {task.description && (
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          )}
                          {task.deadline && (
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-4 h-4" />
                              Deadline: {formatDeadlineVN(task.deadline)}
                            </div>
                          )}
                          {task.submission_link && (
                            <div className="flex items-center gap-2">
                              <LinkIcon className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">Bài nộp:</span>
                              {renderSubmissionLinks(task.submission_link)}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {stages.length === 0 && tasks.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Chưa có giai đoạn hoặc task nào</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
