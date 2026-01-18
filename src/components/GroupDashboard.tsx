import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Clock,
  Users,
  AlertCircle,
} from 'lucide-react';
import type { Task, GroupMember, Stage, Profile } from '@/types/database';
import { formatDeadlineShortVN, isDeadlineOverdue, parseLocalDateTime } from '@/lib/datetime';
import UserAvatar from '@/components/UserAvatar';
import UserPresenceIndicator from '@/components/UserPresenceIndicator';
import ProfileViewDialog from '@/components/ProfileViewDialog';
import { useUserPresence } from '@/hooks/useUserPresence';

interface GroupDashboardProps {
  tasks: Task[];
  members: GroupMember[];
  stages: Stage[];
  groupId?: string;
}

export default function GroupDashboard({ tasks, members, stages, groupId }: GroupDashboardProps) {
  const { getPresenceStatus } = useUserPresence(groupId);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileRole, setProfileRole] = useState<'admin' | 'leader' | 'member'>('member');

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
    return isDeadlineOverdue(t.deadline);
  });

  // Get upcoming deadlines (within 3 days)
  const upcomingTasks = tasks.filter(t => {
    if (!t.deadline || t.status === 'DONE' || t.status === 'VERIFIED') return false;
    const deadline = parseLocalDateTime(t.deadline);
    if (!deadline) return false;
    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return deadline >= now && deadline <= threeDays;
  });

  // Count members by presence status
  const onlineMembers = members.filter(m => getPresenceStatus(m.user_id) === 'online').length;
  const idleMembers = members.filter(m => getPresenceStatus(m.user_id) === 'idle').length;

  const handleMemberClick = (member: GroupMember) => {
    if (member.profiles) {
      setSelectedProfile(member.profiles as Profile);
      setProfileRole(member.role as 'admin' | 'leader' | 'member');
      setProfileDialogOpen(true);
    }
  };

  const formatDate = (dateStr: string) => {
    return formatDeadlineShortVN(dateStr);
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

      {/* Online Members Quick View */}
      {members.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Thành viên ({members.length})
              </div>
              <div className="flex items-center gap-3 text-sm font-normal">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-muted-foreground">{onlineMembers} online</span>
                </span>
                {idleMembers > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span className="text-muted-foreground">{idleMembers} idle</span>
                  </span>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {members.slice(0, 12).map((member) => {
                const status = getPresenceStatus(member.user_id);
                return (
                  <div 
                    key={member.id}
                    onClick={() => handleMemberClick(member)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div className="relative">
                      <UserAvatar 
                        src={member.profiles?.avatar_url}
                        name={member.profiles?.full_name}
                        size="sm"
                      />
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <UserPresenceIndicator status={status} size="xs" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate max-w-24">
                        {member.profiles?.full_name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {member.role === 'leader' ? 'Leader' : 'Member'}
                      </p>
                    </div>
                  </div>
                );
              })}
              {members.length > 12 && (
                <div className="flex items-center justify-center px-3 py-2 rounded-lg bg-muted/20 text-xs text-muted-foreground">
                  +{members.length - 12} khác
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile View Dialog */}
      <ProfileViewDialog
        profile={selectedProfile}
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        role={profileRole}
      />
    </div>
  );
}
