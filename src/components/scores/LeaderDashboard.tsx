import { useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/UserAvatar';
import { supabase } from '@/integrations/supabase/client';
import { 
  Award, Target, Users, TrendingUp, TrendingDown, 
  CheckCircle, Clock, AlertCircle, Edit2, Eye, BarChart3,
  Star, MoreHorizontal
} from 'lucide-react';
import type { Stage, Task, GroupMember } from '@/types/database';
import type { 
  TaskScore, MemberStageScore, MemberFinalScore, 
  StageWeight, ScoreAppeal 
} from '@/types/processScores';

interface LeaderDashboardProps {
  groupId: string;
  stages: Stage[];
  tasks: Task[];
  members: GroupMember[];
  taskScores: TaskScore[];
  stageScores: MemberStageScore[];
  finalScores: MemberFinalScore[];
  stageWeights: StageWeight[];
  appeals: ScoreAppeal[];
  onAdjustScore: (type: 'task' | 'stage' | 'final', targetId: string, memberId: string, memberName: string, currentScore: number) => void;
  onViewAdjustmentDetail: (detail: any) => void;
  onOpenTaskScoring: (task: Task) => void;
  onRefresh: () => void;
}

export default function LeaderDashboard({
  groupId,
  stages,
  tasks,
  members,
  taskScores,
  stageScores,
  finalScores,
  stageWeights,
  appeals,
  onAdjustScore,
  onViewAdjustmentDetail,
  onOpenTaskScoring,
  onRefresh,
}: LeaderDashboardProps) {
  // Real-time score calculation
  const calculateScores = useCallback(async () => {
    try {
      // Auto-initialize task scores for all assigned members
      for (const task of tasks) {
        const assignments = task.task_assignments || [];
        for (const assignment of assignments) {
          const existing = taskScores.find(
            ts => ts.task_id === task.id && ts.user_id === assignment.user_id
          );
          if (!existing) {
            await supabase.from('task_scores').insert({
              task_id: task.id,
              user_id: assignment.user_id,
              base_score: 100,
              final_score: 100,
            });
          }
        }
      }

      // Auto-calculate stage scores
      for (const stage of stages) {
        const stageTasks = tasks.filter(t => t.stage_id === stage.id);
        const stageTaskIds = stageTasks.map(t => t.id);
        
        const assigneeIds = new Set<string>();
        stageTasks.forEach(task => {
          task.task_assignments?.forEach((a: any) => assigneeIds.add(a.user_id));
        });

        for (const userId of assigneeIds) {
          const userTaskScores = taskScores.filter(
            ts => stageTaskIds.includes(ts.task_id) && ts.user_id === userId
          );

          if (userTaskScores.length > 0) {
            const avgScore = userTaskScores.reduce((sum, ts) => sum + (ts.final_score || 100), 0) / userTaskScores.length;
            
            const existing = stageScores.find(
              ss => ss.stage_id === stage.id && ss.user_id === userId
            );

            if (existing) {
              await supabase.from('member_stage_scores')
                .update({ 
                  average_score: avgScore,
                  final_stage_score: avgScore + (existing.adjustment || 0)
                })
                .eq('id', existing.id);
            } else {
              await supabase.from('member_stage_scores').insert({
                stage_id: stage.id,
                user_id: userId,
                average_score: avgScore,
                final_stage_score: avgScore,
              });
            }
          }
        }
      }

      // Auto-calculate final scores
      const memberIds = members.map(m => m.user_id);
      
      for (const memberId of memberIds) {
        const memberStageScores = stageScores.filter(ss => ss.user_id === memberId);
        
        if (memberStageScores.length > 0) {
          let totalWeight = 0;
          let weightedSum = 0;
          
          memberStageScores.forEach(ss => {
            const weight = stageWeights.find(w => w.stage_id === ss.stage_id)?.weight ?? 1;
            weightedSum += (ss.final_stage_score || 100) * weight;
            totalWeight += weight;
          });

          const calculatedScore = totalWeight > 0 ? weightedSum / totalWeight : 100;
          
          const existing = finalScores.find(
            fs => fs.group_id === groupId && fs.user_id === memberId
          );

          if (existing) {
            await supabase.from('member_final_scores')
              .update({ 
                calculated_score: calculatedScore,
                final_score: calculatedScore + (existing.adjustment || 0)
              })
              .eq('id', existing.id);
          } else {
            await supabase.from('member_final_scores').insert({
              group_id: groupId,
              user_id: memberId,
              calculated_score: calculatedScore,
              final_score: calculatedScore,
            });
          }
        }
      }

      onRefresh();
    } catch (error) {
      console.error('Error calculating scores:', error);
    }
  }, [tasks, taskScores, stages, stageScores, stageWeights, members, finalScores, groupId, onRefresh]);

  // Auto-calculate on data changes
  useEffect(() => {
    const timer = setTimeout(() => {
      calculateScores();
    }, 1000);
    return () => clearTimeout(timer);
  }, [tasks.length, taskScores.length]);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-primary';
    if (score >= 50) return 'text-yellow-600';
    return 'text-destructive';
  };

  const getAdjustmentBadge = (adjustment: number | null) => {
    if (!adjustment || adjustment === 0) return null;
    return (
      <Badge 
        variant={adjustment > 0 ? 'default' : 'destructive'} 
        className={`text-xs font-semibold ${adjustment > 0 ? 'bg-green-500 hover:bg-green-600' : ''}`}
      >
        {adjustment > 0 ? '+' : ''}{adjustment}
      </Badge>
    );
  };

  // Statistics
  const stats = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
    const verifiedTasks = tasks.filter(t => t.status === 'VERIFIED').length;
    const scoredTasks = new Set(taskScores.map(ts => ts.task_id)).size;
    const avgScore = finalScores.length > 0 
      ? finalScores.reduce((sum, fs) => sum + (fs.final_score || 100), 0) / finalScores.length 
      : 100;
    const pendingAppeals = appeals.filter(a => a.status === 'pending').length;

    return { totalTasks, completedTasks, verifiedTasks, scoredTasks, avgScore, pendingAppeals };
  }, [tasks, taskScores, finalScores, appeals]);

  // Sort stages by created_at
  const sortedStages = useMemo(() => {
    return [...stages].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [stages]);

  // Get task code
  const getTaskCode = (task: Task, stageId: string | null, stageNumber: number, taskIndex: number) => {
    if (!stageId) return null;
    return `${stageNumber}.${taskIndex + 1}`;
  };

  return (
    <div className="space-y-4">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{members.length}</p>
                <p className="text-xs text-muted-foreground">Thành viên</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.verifiedTasks}/{stats.totalTasks}</p>
                <p className="text-xs text-muted-foreground">Đã duyệt</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Award className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${getScoreColor(stats.avgScore)}`}>
                  {stats.avgScore.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">Điểm TB</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className={`bg-gradient-to-br ${stats.pendingAppeals > 0 ? 'from-yellow-500/10 to-transparent border-yellow-200' : 'from-muted/50 to-transparent'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stats.pendingAppeals > 0 ? 'bg-yellow-500/10' : 'bg-muted'}`}>
                <AlertCircle className={`w-5 h-5 ${stats.pendingAppeals > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingAppeals}</p>
                <p className="text-xs text-muted-foreground">Phúc khảo chờ</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members Score Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            Điểm thành viên
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map(member => {
            const profile = member.profiles;
            const finalScore = finalScores.find(fs => fs.user_id === member.user_id);
            const score = finalScore?.final_score ?? 100;
            const adjustment = finalScore?.adjustment ?? 0;
            const memberAppeals = appeals.filter(a => a.user_id === member.user_id && a.status === 'pending');

            return (
              <div 
                key={member.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <UserAvatar 
                  avatarUrl={profile?.avatar_url}
                  fullName={profile?.full_name}
                  size="sm"
                />
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{profile?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{profile?.student_id}</p>
                </div>

                {memberAppeals.length > 0 && (
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px]">
                    <Clock className="w-2.5 h-2.5 mr-0.5" />
                    {memberAppeals.length}
                  </Badge>
                )}

                <div className="flex items-center gap-2">
                  {adjustment !== 0 && (
                    <div 
                      className="flex items-center gap-0.5 cursor-pointer hover:opacity-80"
                      onClick={() => onViewAdjustmentDetail({
                        isOpen: true,
                        type: 'final',
                        title: `Chi tiết điểm: ${profile?.full_name}`,
                        score,
                        baseScore: finalScore?.calculated_score ?? 100,
                        adjustment,
                        reason: finalScore?.adjustment_reason || null,
                        adjustedAt: finalScore?.adjusted_at || null,
                      })}
                    >
                      {getAdjustmentBadge(adjustment)}
                      <Eye className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className={`text-xl font-bold min-w-[48px] text-right ${getScoreColor(score)}`}>
                    {score.toFixed(1)}
                  </span>
                </div>

                {finalScore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onAdjustScore(
                      'final',
                      finalScore.id,
                      member.user_id,
                      profile?.full_name || '',
                      score,
                    )}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            );
          })}

          {members.length === 0 && (
            <p className="text-center text-muted-foreground py-6 text-sm">
              Chưa có thành viên nào
            </p>
          )}
        </CardContent>
      </Card>

      {/* Task Scoring by Stage - Compact View */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Chấm điểm theo task
          </CardTitle>
          <CardDescription className="text-xs">
            Click vào task để chấm điểm cho thành viên
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedStages.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              Chưa có giai đoạn nào
            </p>
          ) : (
            sortedStages.map((stage, stageIndex) => {
              const stageTasks = tasks
                .filter(t => t.stage_id === stage.id)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              const weight = stageWeights.find(w => w.stage_id === stage.id)?.weight ?? 1;
              const stageNumber = stageIndex + 1;

              return (
                <div key={stage.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary">{stageNumber}</Badge>
                    <span className="font-medium text-sm">{stage.name}</span>
                    <Badge variant="secondary" className="text-[10px]">x{weight}</Badge>
                    <span className="text-xs text-muted-foreground">• {stageTasks.length} task</span>
                  </div>
                  
                  <div className="space-y-1.5 pl-6">
                    {stageTasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Chưa có task trong giai đoạn này
                      </p>
                    ) : (
                      stageTasks.map((task, taskIndex) => {
                        const assigneeIds = task.task_assignments?.map((a: any) => a.user_id) || [];
                        const taskScoresForTask = taskScores.filter(ts => ts.task_id === task.id);
                        const scoredCount = taskScoresForTask.length;
                        const totalCount = assigneeIds.length;
                        const isFullyScored = scoredCount === totalCount && totalCount > 0;
                        const hasAdjustments = taskScoresForTask.some(ts => (ts.adjustment ?? 0) !== 0);
                        const taskCode = `${stageNumber}.${taskIndex + 1}`;
                        
                        return (
                          <div 
                            key={task.id} 
                            className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => onOpenTaskScoring(task)}
                          >
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono font-semibold bg-primary/5 border-primary/20 text-primary shrink-0">
                              {taskCode}
                            </Badge>
                            
                            <span className="flex-1 text-sm truncate">{task.title}</span>

                            {task.status === 'VERIFIED' && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] shrink-0">
                                <Star className="w-2.5 h-2.5 mr-0.5" />
                                Duyệt
                              </Badge>
                            )}

                            {totalCount > 0 && (
                              isFullyScored ? (
                                <Badge className="bg-green-500 text-[10px] shrink-0 gap-0.5">
                                  <CheckCircle className="w-2.5 h-2.5" />
                                  Đã chấm
                                </Badge>
                              ) : scoredCount > 0 ? (
                                <Badge variant="secondary" className="text-[10px] shrink-0 gap-0.5">
                                  <Clock className="w-2.5 h-2.5" />
                                  {scoredCount}/{totalCount}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] shrink-0 gap-0.5 text-muted-foreground">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  Chưa chấm
                                </Badge>
                              )
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
