import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { UEHLogo } from '@/components/UEHLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Loader2, Eye, Calendar, Clock, Users, Activity, 
  CheckCircle, Circle, AlertCircle, Layers, 
  ChevronDown, ChevronRight, User, BookOpen, Mail, Link as LinkIcon,
  ExternalLink, LogIn, BarChart3, FileText
} from 'lucide-react';
import { formatDistanceToNow, isPast } from 'date-fns';
import { vi } from 'date-fns/locale';
import { parseLocalDateTime, formatDeadlineVN } from '@/lib/datetime';
import type { Group, Stage, Task, TaskAssignment, Profile, GroupMember } from '@/types/database';

interface ExtendedGroup extends Group {
  class_code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
  zalo_link: string | null;
  additional_info: string | null;
  is_public: boolean;
  share_token: string | null;
  show_members_public: boolean;
  show_activity_public: boolean;
}

interface ActivityLog {
  id: string;
  action: string;
  action_type: string;
  description: string | null;
  user_name: string;
  created_at: string;
}

export default function PublicProjectView() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [group, setGroup] = useState<ExtendedGroup | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (shareToken) fetchPublicData();
  }, [shareToken]);

  const fetchPublicData = async () => {
    try {
      // Fetch group by share token
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('share_token', shareToken)
        .eq('is_public', true)
        .single();

      if (groupError || !groupData) {
        setError('Link không hợp lệ hoặc đã bị vô hiệu hóa');
        setIsLoading(false);
        return;
      }

      setGroup(groupData as ExtendedGroup);

      // Fetch stages
      const { data: stagesData } = await supabase
        .from('stages')
        .select('*')
        .eq('group_id', groupData.id)
        .order('order_index');
      if (stagesData) setStages(stagesData);

      // Fetch tasks with assignments
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .eq('group_id', groupData.id)
        .order('created_at', { ascending: false });

      if (tasksData) {
        const taskIds = tasksData.map(t => t.id);
        const { data: assignmentsData } = await supabase
          .from('task_assignments')
          .select('*')
          .in('task_id', taskIds);
        
        const assigneeIds = [...new Set(assignmentsData?.map(a => a.user_id) || [])];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', assigneeIds);
        
        const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        
        setTasks(tasksData.map(task => ({
          ...task,
          task_assignments: assignmentsData?.filter(a => a.task_id === task.id)
            .map(a => ({ ...a, profiles: profilesMap.get(a.user_id) })) || [],
        })) as Task[]);
      }

      // Fetch members if allowed
      if (groupData.show_members_public) {
        const { data: membersData } = await supabase
          .from('group_members')
          .select('*')
          .eq('group_id', groupData.id);
        
        if (membersData) {
          const userIds = membersData.map(m => m.user_id);
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds);
          const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
          setMembers(membersData.map(m => ({ ...m, profiles: profilesMap.get(m.user_id) })) as GroupMember[]);
        }
      }

      // Fetch activity logs if allowed
      if (groupData.show_activity_public) {
        const { data: logsData } = await supabase
          .from('activity_logs')
          .select('*')
          .eq('group_id', groupData.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (logsData) setActivityLogs(logsData);
      }
    } catch (err: any) {
      setError('Có lỗi xảy ra khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Use parseLocalDateTime for proper timezone handling
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
        return { label: 'Đang làm', color: 'bg-primary text-primary-foreground', icon: Clock };
      case 'DONE':
        return { label: 'Hoàn thành', color: 'bg-success text-success-foreground', icon: CheckCircle };
      case 'VERIFIED':
        return { label: 'Đã duyệt', color: 'bg-success text-success-foreground', icon: CheckCircle };
      default:
        return { label: status, color: 'bg-muted', icon: Circle };
    }
  };

  const getProgressStats = () => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
    const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    const overdue = tasks.filter(t => 
      isOverdue(t.deadline) && t.status !== 'DONE' && t.status !== 'VERIFIED'
    ).length;
    
    return { total, done, inProgress, overdue, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
  };

  const stats = getProgressStats();

  const toggleTaskExpand = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  // Parse and render submission links properly
  const renderSubmissionLinks = (submissionLink: string | null) => {
    if (!submissionLink) return null;

    try {
      const links = JSON.parse(submissionLink);
      if (Array.isArray(links) && links.length > 0) {
        if (links.length === 1) {
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2 gap-1 text-primary"
              onClick={(e) => {
                e.stopPropagation();
                window.open(links[0].url, '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Xem bài nộp
            </Button>
          );
        } else {
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
                  Xem bài ({links.length} link)
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover min-w-[200px]">
                {links.map((link: { title: string; url: string }, i: number) => (
                  <DropdownMenuItem 
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(link.url, '_blank', 'noopener,noreferrer');
                    }}
                    className="text-xs cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3 mr-2" />
                    {link.title || `Link ${i + 1}`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
      }
    } catch {
      // Not JSON, treat as plain URL
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 text-primary"
          onClick={(e) => {
            e.stopPropagation();
            window.open(submissionLink, '_blank', 'noopener,noreferrer');
          }}
        >
          <ExternalLink className="w-3 h-3" />
          Xem bài nộp
        </Button>
      );
    }

    return null;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <div className="text-center space-y-4">
          <div className="p-4 rounded-full bg-destructive/10 w-fit mx-auto">
            <AlertCircle className="w-12 h-12 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Không thể truy cập</h1>
          <p className="text-muted-foreground max-w-md">{error}</p>
          <Link to="/" className="text-primary hover:underline">
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UEHLogo width={100} />
            <div className="h-6 w-px bg-border" />
            <span className="font-medium text-sm hidden sm:block">Xem Project</span>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 bg-warning/10 text-warning border-warning/30">
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chỉ xem – không chỉnh sửa</span>
              <span className="sm:hidden">Read-only</span>
            </Badge>
            
            {/* Login button */}
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/auth">
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Đăng nhập chỉnh sửa</span>
                <span className="sm:hidden">Đăng nhập</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Project Header Card */}
        <Card className="border-2 border-primary/20 overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />
          <CardHeader className="pb-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="space-y-2">
                <CardTitle className="text-2xl lg:text-3xl">{group.name}</CardTitle>
                {group.description && (
                  <CardDescription className="text-base max-w-2xl">
                    {group.description}
                  </CardDescription>
                )}
                <div className="flex flex-wrap gap-3 pt-2">
                  {group.class_code && (
                    <Badge variant="secondary" className="gap-1.5">
                      <BookOpen className="w-3 h-3" />
                      {group.class_code}
                    </Badge>
                  )}
                  {group.instructor_name && (
                    <Badge variant="secondary" className="gap-1.5">
                      <User className="w-3 h-3" />
                      GV: {group.instructor_name}
                    </Badge>
                  )}
                  {group.instructor_email && (
                    <Badge variant="outline" className="gap-1.5">
                      <Mail className="w-3 h-3" />
                      {group.instructor_email}
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Progress Summary */}
              <div className="lg:text-right space-y-2 shrink-0">
                <div className="text-4xl font-bold text-primary">{stats.percent}%</div>
                <div className="text-sm text-muted-foreground">Tiến độ hoàn thành</div>
                <Progress value={stats.percent} className="h-2 w-48" />
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-muted/50 text-center">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Tổng task</div>
              </div>
              <div className="p-4 rounded-xl bg-success/10 text-center">
                <div className="text-2xl font-bold text-success">{stats.done}</div>
                <div className="text-sm text-muted-foreground">Hoàn thành</div>
              </div>
              <div className="p-4 rounded-xl bg-primary/10 text-center">
                <div className="text-2xl font-bold text-primary">{stats.inProgress}</div>
                <div className="text-sm text-muted-foreground">Đang làm</div>
              </div>
              <div className="p-4 rounded-xl bg-destructive/10 text-center">
                <div className="text-2xl font-bold text-destructive">{stats.overdue}</div>
                <div className="text-sm text-muted-foreground">Quá hạn</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs - Reordered as requested */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid lg:grid-cols-4">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Tổng quan
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <Layers className="w-4 h-4" />
              Task & Giai đoạn
            </TabsTrigger>
            {group.show_members_public && (
              <TabsTrigger value="members" className="gap-2">
                <Users className="w-4 h-4" />
                Thành viên ({members.length})
              </TabsTrigger>
            )}
            {group.show_activity_public && (
              <TabsTrigger value="activity" className="gap-2">
                <Activity className="w-4 h-4" />
                Nhật ký
              </TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Thông tin Project
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.class_code && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mã lớp</span>
                      <span className="font-medium">{group.class_code}</span>
                    </div>
                  )}
                  {group.instructor_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Giảng viên</span>
                      <span className="font-medium">{group.instructor_name}</span>
                    </div>
                  )}
                  {group.instructor_email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email GV</span>
                      <span className="font-medium">{group.instructor_email}</span>
                    </div>
                  )}
                  {group.zalo_link && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Zalo Group</span>
                      <a href={group.zalo_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                        Truy cập <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {group.additional_info && (
                    <div className="pt-2 border-t">
                      <span className="text-sm text-muted-foreground">Thông tin thêm:</span>
                      <p className="text-sm mt-1">{group.additional_info}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Giai đoạn ({stages.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Chưa có giai đoạn</p>
                  ) : (
                    <div className="space-y-3">
                      {stages.map((stage, index) => {
                        const stageTasks = tasks.filter(t => t.stage_id === stage.id);
                        const completed = stageTasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
                        
                        return (
                          <div key={stage.id} className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-sm">{stage.name}</div>
                              <div className="text-xs text-muted-foreground">{completed}/{stageTasks.length} task</div>
                            </div>
                            <Progress value={stageTasks.length > 0 ? (completed / stageTasks.length) * 100 : 0} className="h-1.5 w-16" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-6">
            {stages.map((stage, stageIndex) => {
              const stageTasks = tasks.filter(t => t.stage_id === stage.id);
              const completedTasks = stageTasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
              const stageProgress = stageTasks.length > 0 ? Math.round((completedTasks / stageTasks.length) * 100) : 0;

              return (
                <Card key={stage.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {stageIndex + 1}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{stage.name}</CardTitle>
                          {stage.description && (
                            <CardDescription>{stage.description}</CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{completedTasks}/{stageTasks.length} task</div>
                        <Progress value={stageProgress} className="h-1.5 w-24 mt-1" />
                      </div>
                    </div>
                  </CardHeader>
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
                          const isExpanded = expandedTasks.has(task.id);
                          const taskCode = `${stageIndex + 1}.${taskIndex + 1}`;
                          
                          return (
                            <div key={task.id} className="space-y-2">
                              <div
                                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={() => toggleTaskExpand(task.id)}
                              >
                                {/* Task code */}
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-mono font-semibold bg-primary/5 border-primary/20 text-primary shrink-0">
                                  {taskCode}
                                </Badge>
                                
                                <StatusIcon className={`w-5 h-5 shrink-0 ${
                                  config.label === 'Quá hạn' ? 'text-destructive' :
                                  config.label === 'Hoàn thành' || config.label === 'Đã duyệt' ? 'text-success' :
                                  config.label === 'Đang làm' ? 'text-primary' : 'text-muted-foreground'
                                }`} />
                                
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{task.title}</div>
                                  {task.deadline && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Calendar className="w-3 h-3" />
                                      {formatDeadlineVN(task.deadline)}
                                    </div>
                                  )}
                                </div>

                                {/* Submission link button */}
                                {task.submission_link && renderSubmissionLinks(task.submission_link)}

                                <Badge className={config.color}>{config.label}</Badge>

                                {task.task_assignments && task.task_assignments.length > 0 && (
                                  <div className="flex -space-x-2">
                                    {task.task_assignments.slice(0, 3).map((assignment: TaskAssignment) => (
                                      <Avatar key={assignment.id} className="w-7 h-7 border-2 border-background">
                                        <AvatarFallback className="text-xs bg-primary/10">
                                          {assignment.profiles?.full_name?.charAt(0) || '?'}
                                        </AvatarFallback>
                                      </Avatar>
                                    ))}
                                    {task.task_assignments.length > 3 && (
                                      <Avatar className="w-7 h-7 border-2 border-background">
                                        <AvatarFallback className="text-xs bg-muted">
                                          +{task.task_assignments.length - 3}
                                        </AvatarFallback>
                                      </Avatar>
                                    )}
                                  </div>
                                )}

                                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${
                                  isExpanded ? 'rotate-90' : ''
                                }`} />
                              </div>

                              {/* Expanded Task Detail */}
                              {isExpanded && (
                                <Card className="ml-4 border-l-4 border-l-primary/30 bg-muted/30">
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
                                          {parseLocalDateTime(task.deadline) && (
                                            <span className="text-muted-foreground ml-2">
                                              ({formatDistanceToNow(parseLocalDateTime(task.deadline)!, { addSuffix: true, locale: vi })})
                                            </span>
                                          )}
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
                      const isExpanded = expandedTasks.has(task.id);
                      
                      return (
                        <div key={task.id} className="space-y-2">
                          <div
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => toggleTaskExpand(task.id)}
                          >
                            <StatusIcon className={`w-5 h-5 shrink-0 ${
                              config.label === 'Quá hạn' ? 'text-destructive' :
                              config.label === 'Hoàn thành' || config.label === 'Đã duyệt' ? 'text-success' :
                              config.label === 'Đang làm' ? 'text-primary' : 'text-muted-foreground'
                            }`} />
                            
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{task.title}</div>
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
                              isExpanded ? 'rotate-90' : ''
                            }`} />
                          </div>

                          {isExpanded && (
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
          </TabsContent>

          {/* Members Tab */}
          {group.show_members_public && (
            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Thành viên Project ({members.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Chưa có thành viên</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {members.map(member => (
                        <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {member.profiles?.full_name?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{member.profiles?.full_name || 'Unknown'}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {member.profiles?.student_id}
                            </div>
                          </div>
                          <Badge variant={member.role === 'leader' ? 'default' : 'secondary'} className="shrink-0">
                            {member.role === 'leader' ? 'Leader' : 'Thành viên'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Activity Tab */}
          {group.show_activity_public && (
            <TabsContent value="activity">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Nhật ký hoạt động
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {activityLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Chưa có hoạt động</p>
                  ) : (
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {activityLogs.map(log => (
                          <div key={log.id} className="flex gap-3 pb-4 border-b last:border-0">
                            <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm">
                                <span className="font-medium">{log.user_name}</span>
                                {' '}
                                <span className="text-muted-foreground">{log.action}</span>
                              </div>
                              {log.description && (
                                <p className="text-sm text-muted-foreground mt-0.5">{log.description}</p>
                              )}
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: vi })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} UEH Project Management System</p>
          <p className="mt-1">Đây là trang xem công khai – chỉ xem, không chỉnh sửa</p>
        </div>
      </footer>
    </div>
  );
}
