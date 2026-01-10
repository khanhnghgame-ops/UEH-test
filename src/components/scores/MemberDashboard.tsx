import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserAvatar from '@/components/UserAvatar';
import { 
  Award, Target, BarChart3, MessageSquare, Info, 
  CheckCircle, Clock, AlertCircle, TrendingUp
} from 'lucide-react';
import type { Stage, Task, GroupMember } from '@/types/database';
import type { 
  TaskScore, MemberStageScore, MemberFinalScore, 
  ScoreAppeal, StageWeight 
} from '@/types/processScores';

interface MemberDashboardProps {
  profile: any;
  finalScore: MemberFinalScore | null;
  stageScores: MemberStageScore[];
  taskScores: TaskScore[];
  appeals: ScoreAppeal[];
  stages: Stage[];
  tasks: Task[];
  stageWeights: StageWeight[];
  onAppeal: (type: 'task' | 'stage' | 'final', scoreId: string, currentScore: number, adjustment: number, adjustmentReason: string | null) => void;
  onViewAdjustmentDetail: (detail: any) => void;
}

export default function MemberDashboard({
  profile,
  finalScore,
  stageScores,
  taskScores,
  appeals,
  stages,
  tasks,
  stageWeights,
  onAppeal,
  onViewAdjustmentDetail,
}: MemberDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const score = finalScore?.final_score ?? 100;
  const calculatedScore = finalScore?.calculated_score ?? 100;
  const adjustment = finalScore?.adjustment ?? 0;

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-primary';
    if (score >= 50) return 'text-yellow-600';
    return 'text-destructive';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-green-100 border-green-200';
    if (score >= 70) return 'bg-blue-100 border-blue-200';
    if (score >= 50) return 'bg-yellow-100 border-yellow-200';
    return 'bg-red-100 border-red-200';
  };

  const getAdjustmentBadge = (adj: number | null) => {
    if (!adj || adj === 0) return null;
    return (
      <Badge 
        variant={adj > 0 ? 'default' : 'destructive'} 
        className={`text-xs font-semibold ${adj > 0 ? 'bg-green-500 hover:bg-green-600' : ''}`}
      >
        {adj > 0 ? '+' : ''}{adj}
      </Badge>
    );
  };

  const pendingAppeals = appeals.filter(a => a.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Compact Score Header */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
          <div className="flex items-center gap-4">
            <UserAvatar 
              avatarUrl={profile?.avatar_url}
              fullName={profile?.full_name}
              size="lg"
              className="border-4 border-background shadow-lg"
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{profile?.full_name}</h2>
              <p className="text-sm text-muted-foreground">{profile?.student_id}</p>
            </div>
            
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">Điểm quá trình</p>
              <div className={`text-3xl font-bold ${getScoreColor(score)}`}>
                {score.toFixed(1)}
              </div>
              {adjustment !== 0 && (
                <div 
                  className="flex items-center justify-end gap-1 mt-0.5 cursor-pointer hover:opacity-80"
                  onClick={() => onViewAdjustmentDetail({
                    isOpen: true,
                    type: 'final',
                    title: 'Chi tiết điểm quá trình',
                    score,
                    baseScore: calculatedScore,
                    adjustment,
                    reason: finalScore?.adjustment_reason || null,
                    adjustedAt: finalScore?.adjusted_at || null,
                  })}
                >
                  {getAdjustmentBadge(adjustment)}
                  <Info className="w-3 h-3 text-muted-foreground ml-1" />
                </div>
              )}
            </div>
          </div>
          
          <Progress value={Math.min(score, 100)} className="h-2 mt-3" />
        </div>
        
        {/* Compact stats row */}
        <CardContent className="py-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-primary" />
                <span className="font-medium">{taskScores.length}</span>
                <span className="text-muted-foreground">task</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="font-medium">{stageScores.length}</span>
                <span className="text-muted-foreground">giai đoạn</span>
              </div>
            </div>
            
            {finalScore && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onAppeal(
                  'final',
                  finalScore.id,
                  score,
                  adjustment,
                  finalScore.adjustment_reason
                )}
              >
                <MessageSquare className="w-3 h-3 mr-1.5" />
                Phúc khảo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="text-xs">
            <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
            Giai đoạn
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs">
            <Target className="w-3.5 h-3.5 mr-1.5" />
            Task
          </TabsTrigger>
          <TabsTrigger value="appeals" className="text-xs">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Phúc khảo
            {pendingAppeals > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 h-4 text-[10px]">
                {pendingAppeals}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Stage Scores Tab */}
        <TabsContent value="overview" className="mt-3 space-y-2">
          {stages.sort((a, b) => a.order_index - b.order_index).map(stage => {
            const stageScore = stageScores.find(ss => ss.stage_id === stage.id);
            const weight = stageWeights.find(w => w.stage_id === stage.id)?.weight ?? 1;
            const stageValue = stageScore?.final_stage_score ?? 100;
            const baseScore = stageScore?.average_score ?? 100;
            const adj = stageScore?.adjustment ?? 0;
            const stageTasks = tasks.filter(t => t.stage_id === stage.id);
            const stageTaskScores = taskScores.filter(
              ts => stageTasks.some(t => t.id === ts.task_id)
            );

            return (
              <div 
                key={stage.id} 
                className={`p-3 rounded-lg border ${getScoreBgColor(stageValue)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-background text-[10px]">
                        GĐ {stage.order_index + 1}
                      </Badge>
                      <span className="font-medium text-sm truncate">{stage.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        x{weight}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stageTaskScores.length} task đã chấm điểm
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    {adj !== 0 && (
                      <div 
                        className="flex items-center gap-0.5 cursor-pointer hover:opacity-80"
                        onClick={() => onViewAdjustmentDetail({
                          isOpen: true,
                          type: 'stage',
                          title: `Chi tiết điểm ${stage.name}`,
                          score: stageValue,
                          baseScore,
                          adjustment: adj,
                          reason: stageScore?.adjustment_reason || null,
                          adjustedAt: stageScore?.adjusted_at || null,
                        })}
                      >
                        {getAdjustmentBadge(adj)}
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </div>
                    )}
                    
                    <span className={`text-xl font-bold ${getScoreColor(stageValue)}`}>
                      {stageValue.toFixed(1)}
                    </span>
                    
                    {stageScore && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => onAppeal(
                          'stage',
                          stageScore.id,
                          stageValue,
                          adj,
                          stageScore.adjustment_reason
                        )}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {stages.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Chưa có giai đoạn nào
            </p>
          )}
        </TabsContent>

        {/* Task Scores Tab */}
        <TabsContent value="tasks" className="mt-3 space-y-2">
          {taskScores.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Chưa có điểm task nào
            </p>
          ) : (
            taskScores.map(taskScore => {
              const task = tasks.find(t => t.id === taskScore.task_id);
              const stage = stages.find(s => s.id === task?.stage_id);
              const adj = taskScore.adjustment ?? 0;
              
              return (
                <div 
                  key={taskScore.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{task?.title || 'Task không xác định'}</p>
                    {stage && (
                      <p className="text-xs text-muted-foreground">
                        {stage.name}
                      </p>
                    )}
                  </div>
                  
                  {adj !== 0 && (
                    <div 
                      className="flex items-center gap-0.5 cursor-pointer hover:opacity-80"
                      onClick={() => onViewAdjustmentDetail({
                        isOpen: true,
                        type: 'task',
                        title: `Chi tiết điểm: ${task?.title || 'Task'}`,
                        score: taskScore.final_score,
                        baseScore: 100,
                        adjustment: adj,
                        reason: taskScore.adjustment_reason || null,
                        adjustedAt: taskScore.adjusted_at || null,
                      })}
                    >
                      {getAdjustmentBadge(adj)}
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                  
                  <span className={`text-lg font-bold ${getScoreColor(taskScore.final_score)}`}>
                    {taskScore.final_score.toFixed(1)}
                  </span>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onAppeal(
                      'task',
                      taskScore.id,
                      taskScore.final_score,
                      adj,
                      taskScore.adjustment_reason
                    )}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* Appeals Tab - SEPARATE from scores */}
        <TabsContent value="appeals" className="mt-3 space-y-2">
          {appeals.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">Chưa có phúc khảo nào</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Bấm nút phúc khảo bên cạnh điểm để gửi yêu cầu
              </p>
            </div>
          ) : (
            appeals.map(appeal => {
              const typeLabel = appeal.appeal_type === 'task' ? 'Task' : 
                                appeal.appeal_type === 'stage' ? 'Giai đoạn' : 'Điểm cuối';
              
              return (
                <div 
                  key={appeal.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    appeal.status === 'pending' 
                      ? 'border-yellow-200 bg-yellow-50/50' 
                      : appeal.status === 'approved'
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-red-200 bg-red-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{typeLabel}</Badge>
                        {appeal.status === 'pending' && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300 text-[10px]">
                            <Clock className="w-2.5 h-2.5 mr-0.5" />
                            Chờ xử lý
                          </Badge>
                        )}
                        {appeal.status === 'approved' && (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                            <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                            Đã chấp nhận
                          </Badge>
                        )}
                        {appeal.status === 'rejected' && (
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-[10px]">
                            <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                            Đã từ chối
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{appeal.content}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {new Date(appeal.created_at).toLocaleDateString('vi-VN')}
                      </p>
                    </div>
                  </div>
                  
                  {appeal.response && (
                    <div className="mt-2 pt-2 border-t text-xs">
                      <p className="font-medium mb-0.5">Phản hồi từ Leader:</p>
                      <p className="text-muted-foreground">{appeal.response}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
