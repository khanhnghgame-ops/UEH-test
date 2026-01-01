import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  CheckCircle2,
  Clock,
  ListTodo,
  TrendingUp,
  Users,
  AlertCircle,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import type { Task, GroupMember, Stage } from '@/types/database';

interface GroupDashboardProps {
  tasks: Task[];
  members: GroupMember[];
  stages: Stage[];
}

export default function GroupDashboard({ tasks, members, stages }: GroupDashboardProps) {
  // Task statistics
  const totalTasks = tasks.length;
  const todoTasks = tasks.filter(t => t.status === 'TODO').length;
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const doneTasks = tasks.filter(t => t.status === 'DONE').length;
  const verifiedTasks = tasks.filter(t => t.status === 'VERIFIED').length;
  const completedTasks = doneTasks + verifiedTasks;
  
  // Progress calculation
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Get overdue tasks
  const overdueTasks = tasks.filter(t => {
    if (!t.deadline || t.status === 'DONE' || t.status === 'VERIFIED') return false;
    return new Date(t.deadline) < new Date();
  });

  // Get upcoming deadlines (within 3 days)
  const upcomingTasks = tasks.filter(t => {
    if (!t.deadline || t.status === 'DONE' || t.status === 'VERIFIED') return false;
    const deadline = new Date(t.deadline);
    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return deadline >= now && deadline <= threeDays;
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-destructive/10 text-destructive text-xs">Admin</Badge>;
      case 'leader':
        return <Badge className="bg-warning/10 text-warning text-xs">Leader</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Member</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Progress and Alerts - Combined with stats */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Overall Progress with Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Tiến độ dự án</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-4xl font-bold text-primary">{progressPercent}%</span>
                <p className="text-sm text-muted-foreground mt-1">
                  {completedTasks}/{totalTasks} task hoàn thành
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>{doneTasks} hoàn thành</p>
                <p>{verifiedTasks} đã duyệt</p>
              </div>
            </div>
            <Progress value={progressPercent} className="h-3" />
            
            {/* Combined stats grid */}
            <div className="grid grid-cols-4 gap-2 pt-2">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="w-3 h-3 rounded-full bg-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Chờ</p>
                <p className="text-lg font-bold">{todoTasks}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-warning/10">
                <div className="w-3 h-3 rounded-full bg-warning mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Đang làm</p>
                <p className="text-lg font-bold">{inProgressTasks}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <div className="w-3 h-3 rounded-full bg-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Xong</p>
                <p className="text-lg font-bold">{doneTasks}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-success/10">
                <div className="w-3 h-3 rounded-full bg-success mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Duyệt</p>
                <p className="text-lg font-bold">{verifiedTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts: Overdue & Upcoming */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Cảnh báo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overdueTasks.length === 0 && upcomingTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-success opacity-50" />
                <p>Không có task quá hạn hoặc sắp đến hạn</p>
              </div>
            ) : (
              <>
                {/* Overdue Tasks */}
                {overdueTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Task quá hạn ({overdueTasks.length})
                    </p>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {overdueTasks.slice(0, 3).map(task => (
                        <div key={task.id} className="p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
                          <p className="font-medium truncate">{task.title}</p>
                          <p className="text-xs text-destructive">{formatDate(task.deadline!)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Tasks */}
                {upcomingTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-warning flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Sắp đến hạn ({upcomingTasks.length})
                    </p>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {upcomingTasks.slice(0, 3).map(task => (
                        <div key={task.id} className="p-2 rounded-lg bg-warning/10 border border-warning/20 text-sm">
                          <p className="font-medium truncate">{task.title}</p>
                          <p className="text-xs text-warning">{formatDate(task.deadline!)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stages Progress */}
      {stages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Tiến độ theo giai đoạn</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stages.map((stage) => {
                const stageTasks = tasks.filter(t => t.stage_id === stage.id);
                const stageCompleted = stageTasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
                const stageProgress = stageTasks.length > 0 ? Math.round((stageCompleted / stageTasks.length) * 100) : 0;
                
                return (
                  <div key={stage.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{stage.name}</span>
                      <span className="text-sm text-muted-foreground">{stageCompleted}/{stageTasks.length}</span>
                    </div>
                    <Progress value={stageProgress} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
