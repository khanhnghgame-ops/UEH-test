import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, Clock, AlertCircle, Layers, Users, Target, 
  BookOpen, User, Mail, ExternalLink, FileText
} from 'lucide-react';
import { parseLocalDateTime } from '@/lib/datetime';
import type { Group, Stage, Task, GroupMember } from '@/types/database';

interface ExtendedGroup extends Group {
  class_code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
  zalo_link: string | null;
  additional_info: string | null;
}

interface PublicGroupDashboardProps {
  group: ExtendedGroup;
  tasks: Task[];
  stages: Stage[];
  members: GroupMember[];
}

export default function PublicGroupDashboard({ group, tasks, stages, members }: PublicGroupDashboardProps) {
  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    const d = parseLocalDateTime(deadline);
    return d ? d.getTime() < Date.now() : false;
  };

  // Calculate stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const todoTasks = tasks.filter(t => t.status === 'TODO').length;
  const overdueTasks = tasks.filter(t => 
    isOverdue(t.deadline) && t.status !== 'DONE' && t.status !== 'VERIFIED'
  ).length;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats Grid - Mobile optimized */}
      <Card>
        <CardHeader className="p-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Tiến độ Project
            </CardTitle>
            <div className="flex items-center gap-2">
              <Progress value={progressPercent} className="h-2 w-24 sm:w-32" />
              <span className="text-xl sm:text-2xl font-bold text-primary">{progressPercent}%</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {/* 2x2 grid on mobile, 4 cols on desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="text-xl sm:text-2xl font-bold text-center">{totalTasks}</div>
              <div className="text-[11px] sm:text-xs text-muted-foreground text-center">Tổng task</div>
            </div>
            <div className="p-3 rounded-lg bg-success/10 border border-success/20">
              <div className="flex items-center justify-center gap-1">
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="text-xl sm:text-2xl font-bold text-success">{doneTasks}</span>
              </div>
              <div className="text-[11px] sm:text-xs text-muted-foreground text-center">Hoàn thành</div>
            </div>
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-center justify-center gap-1">
                <Clock className="w-4 h-4 text-warning" />
                <span className="text-xl sm:text-2xl font-bold text-warning">{inProgressTasks}</span>
              </div>
              <div className="text-[11px] sm:text-xs text-muted-foreground text-center">Đang làm</div>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-center justify-center gap-1">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-xl sm:text-2xl font-bold text-destructive">{overdueTasks}</span>
              </div>
              <div className="text-[11px] sm:text-xs text-muted-foreground text-center">Quá hạn</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Project Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Thông tin Project
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.class_code && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Mã lớp</span>
                <span className="font-medium">{group.class_code}</span>
              </div>
            )}
            {group.instructor_name && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Giảng viên</span>
                <span className="font-medium">{group.instructor_name}</span>
              </div>
            )}
            {group.instructor_email && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Email GV</span>
                <span className="font-medium">{group.instructor_email}</span>
              </div>
            )}
            {group.zalo_link && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Zalo Group</span>
                <a href={group.zalo_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                  Truy cập <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {group.additional_info && (
              <div className="pt-2">
                <span className="text-sm text-muted-foreground">Thông tin thêm:</span>
                <p className="text-sm mt-1">{group.additional_info}</p>
              </div>
            )}
            {!group.class_code && !group.instructor_name && !group.additional_info && (
              <p className="text-sm text-muted-foreground text-center py-4">Chưa có thông tin bổ sung</p>
            )}
          </CardContent>
        </Card>

        {/* Stages Progress */}
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
              <div className="space-y-4">
                {stages.map((stage, index) => {
                  const stageTasks = tasks.filter(t => t.stage_id === stage.id);
                  const completed = stageTasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
                  const stageProgress = stageTasks.length > 0 ? Math.round((completed / stageTasks.length) * 100) : 0;
                  
                  return (
                    <div key={stage.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm truncate">{stage.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{completed}/{stageTasks.length}</span>
                        </div>
                        <Progress value={stageProgress} className="h-1.5 mt-1.5" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row - Simplified for mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="border-primary/20">
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="text-center sm:text-left">
              <div className="text-lg sm:text-2xl font-bold">{stages.length}</div>
              <div className="text-[10px] sm:text-sm text-muted-foreground">Giai đoạn</div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-success/20">
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
            </div>
            <div className="text-center sm:text-left">
              <div className="text-lg sm:text-2xl font-bold">{members.length}</div>
              <div className="text-[10px] sm:text-sm text-muted-foreground">Thành viên</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Target className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
            </div>
            <div className="text-center sm:text-left">
              <div className="text-lg sm:text-2xl font-bold">{todoTasks}</div>
              <div className="text-[10px] sm:text-sm text-muted-foreground">Chờ làm</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
