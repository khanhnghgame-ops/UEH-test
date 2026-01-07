import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Award, ChevronDown, ChevronRight, Scale, History, 
  AlertCircle, CheckCircle, Clock, Edit2, MessageSquare,
  TrendingUp, TrendingDown, Minus, FileText, Users, Loader2
} from 'lucide-react';
import ScoreAdjustmentDialog from './ScoreAdjustmentDialog';
import AppealDialog from './AppealDialog';
import AppealReviewDialog from './AppealReviewDialog';
import StageWeightDialog from './StageWeightDialog';
import ScoreHistoryPanel from './ScoreHistoryPanel';
import type { Stage, Task, GroupMember, Profile } from '@/types/database';
import type { 
  TaskScore, MemberStageScore, MemberFinalScore, 
  ScoreAppeal, StageWeight, ScoreAdjustmentHistory 
} from '@/types/processScores';

interface ProcessScoresProps {
  groupId: string;
  stages: Stage[];
  tasks: Task[];
  members: GroupMember[];
  isLeader: boolean;
}

export default function ProcessScores({
  groupId,
  stages,
  tasks,
  members,
  isLeader,
}: ProcessScoresProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  
  // Data states
  const [taskScores, setTaskScores] = useState<TaskScore[]>([]);
  const [stageScores, setStageScores] = useState<MemberStageScore[]>([]);
  const [finalScores, setFinalScores] = useState<MemberFinalScore[]>([]);
  const [stageWeights, setStageWeights] = useState<StageWeight[]>([]);
  const [appeals, setAppeals] = useState<ScoreAppeal[]>([]);
  const [history, setHistory] = useState<ScoreAdjustmentHistory[]>([]);
  
  // Dialog states
  const [adjustmentDialog, setAdjustmentDialog] = useState<{
    isOpen: boolean;
    type: 'task' | 'stage' | 'final';
    targetId: string;
    memberId: string;
    memberName: string;
    currentScore: number;
  } | null>(null);
  
  const [appealDialog, setAppealDialog] = useState<{
    isOpen: boolean;
    type: 'task' | 'stage' | 'final';
    scoreId: string;
    currentScore: number;
    adjustment: number;
    adjustmentReason: string | null;
  } | null>(null);
  
  const [reviewDialog, setReviewDialog] = useState<{
    isOpen: boolean;
    appeal: ScoreAppeal | null;
  }>({ isOpen: false, appeal: null });
  
  const [weightDialog, setWeightDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch all score data
  useEffect(() => {
    if (groupId) fetchScoreData();
  }, [groupId]);

  const fetchScoreData = async () => {
    setIsLoading(true);
    try {
      // Fetch task scores for this group's tasks
      const taskIds = tasks.map(t => t.id);
      if (taskIds.length > 0) {
        const { data: taskScoresData } = await supabase
          .from('task_scores')
          .select('*')
          .in('task_id', taskIds);
        setTaskScores((taskScoresData || []) as unknown as TaskScore[]);
      }

      // Fetch stage scores
      const stageIds = stages.map(s => s.id);
      if (stageIds.length > 0) {
        const { data: stageScoresData } = await supabase
          .from('member_stage_scores')
          .select('*')
          .in('stage_id', stageIds);
        setStageScores((stageScoresData || []) as unknown as MemberStageScore[]);

        // Fetch stage weights
        const { data: weightsData } = await supabase
          .from('stage_weights')
          .select('*')
          .in('stage_id', stageIds);
        setStageWeights((weightsData || []) as unknown as StageWeight[]);
      }

      // Fetch final scores
      const { data: finalScoresData } = await supabase
        .from('member_final_scores')
        .select('*')
        .eq('group_id', groupId);
      setFinalScores((finalScoresData || []) as unknown as MemberFinalScore[]);

      // Fetch appeals (leader sees all, members see own)
      let appealsQuery = supabase.from('score_appeals').select('*');
      if (!isLeader) {
        appealsQuery = appealsQuery.eq('user_id', user?.id);
      }
      const { data: appealsData } = await appealsQuery;
      
      // Fetch attachments for appeals
      if (appealsData && appealsData.length > 0) {
        const appealIds = appealsData.map(a => a.id);
        const { data: attachmentsData } = await supabase
          .from('appeal_attachments')
          .select('*')
          .in('appeal_id', appealIds);
        
        const appealsWithAttachments = appealsData.map(appeal => ({
          ...appeal,
          attachments: attachmentsData?.filter(a => a.appeal_id === appeal.id) || []
        }));
        setAppeals(appealsWithAttachments as unknown as ScoreAppeal[]);
      } else {
        setAppeals([]);
      }

      // Fetch history (leader sees all, members see own)
      let historyQuery = supabase.from('score_adjustment_history').select('*').order('created_at', { ascending: false }).limit(100);
      if (!isLeader) {
        historyQuery = historyQuery.eq('user_id', user?.id);
      }
      const { data: historyData } = await historyQuery;
      setHistory((historyData || []) as unknown as ScoreAdjustmentHistory[]);

    } catch (error: any) {
      toast({ title: 'Lỗi', description: 'Không thể tải dữ liệu điểm', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize task scores for assigned members
  const initializeTaskScores = async () => {
    setIsProcessing(true);
    try {
      for (const task of tasks) {
        const assignments = task.task_assignments || [];
        for (const assignment of assignments) {
          // Check if score exists
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
      toast({ title: 'Thành công', description: 'Đã khởi tạo điểm cho các task' });
      fetchScoreData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate and update stage scores
  const calculateStageScores = async () => {
    setIsProcessing(true);
    try {
      for (const stage of stages) {
        const stageTasks = tasks.filter(t => t.stage_id === stage.id);
        const stageTaskIds = stageTasks.map(t => t.id);
        
        // Get unique assignees for this stage
        const assigneeIds = new Set<string>();
        stageTasks.forEach(task => {
          task.task_assignments?.forEach(a => assigneeIds.add(a.user_id));
        });

        for (const userId of assigneeIds) {
          // Get task scores for this user in this stage
          const userTaskScores = taskScores.filter(
            ts => stageTaskIds.includes(ts.task_id) && ts.user_id === userId
          );

          if (userTaskScores.length > 0) {
            const avgScore = userTaskScores.reduce((sum, ts) => sum + (ts.final_score || 100), 0) / userTaskScores.length;
            
            // Check if stage score exists
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
      toast({ title: 'Thành công', description: 'Đã tính toán điểm giai đoạn' });
      fetchScoreData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate final scores
  const calculateFinalScores = async () => {
    setIsProcessing(true);
    try {
      const memberIds = members.map(m => m.user_id);
      
      for (const memberId of memberIds) {
        const memberStageScores = stageScores.filter(ss => ss.user_id === memberId);
        
        if (memberStageScores.length > 0) {
          // Calculate weighted average
          let totalWeight = 0;
          let weightedSum = 0;
          
          memberStageScores.forEach(ss => {
            const weight = stageWeights.find(w => w.stage_id === ss.stage_id)?.weight ?? 1;
            weightedSum += (ss.final_stage_score || 100) * weight;
            totalWeight += weight;
          });

          const calculatedScore = totalWeight > 0 ? weightedSum / totalWeight : 100;
          
          // Check if final score exists
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
      toast({ title: 'Thành công', description: 'Đã tính toán điểm quá trình cuối cùng' });
      fetchScoreData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle score adjustment
  const handleAdjustScore = async (adjustment: number, reason: string) => {
    if (!adjustmentDialog) return;
    setIsProcessing(true);
    
    try {
      const { type, targetId, memberId } = adjustmentDialog;
      
      if (type === 'task') {
        const existing = taskScores.find(ts => ts.id === targetId);
        const previousScore = existing?.final_score || 100;
        const newScore = 100 + adjustment;
        
        await supabase.from('task_scores')
          .update({
            adjustment,
            adjustment_reason: reason,
            adjusted_by: user?.id,
            adjusted_at: new Date().toISOString(),
            final_score: newScore,
          })
          .eq('id', targetId);

        // Log history
        await supabase.from('score_adjustment_history').insert({
          adjustment_type: 'task',
          task_score_id: targetId,
          user_id: memberId,
          previous_score: previousScore,
          new_score: newScore,
          adjustment,
          reason,
          adjusted_by: user?.id,
        });

      } else if (type === 'stage') {
        const existing = stageScores.find(ss => ss.id === targetId);
        const previousScore = existing?.final_stage_score || 100;
        const newScore = (existing?.average_score || 100) + adjustment;
        
        await supabase.from('member_stage_scores')
          .update({
            adjustment,
            adjustment_reason: reason,
            adjusted_by: user?.id,
            adjusted_at: new Date().toISOString(),
            final_stage_score: newScore,
          })
          .eq('id', targetId);

        await supabase.from('score_adjustment_history').insert({
          adjustment_type: 'stage',
          stage_score_id: targetId,
          user_id: memberId,
          previous_score: previousScore,
          new_score: newScore,
          adjustment,
          reason,
          adjusted_by: user?.id,
        });

      } else if (type === 'final') {
        const existing = finalScores.find(fs => fs.id === targetId);
        const previousScore = existing?.final_score || 100;
        const newScore = (existing?.calculated_score || 100) + adjustment;
        
        await supabase.from('member_final_scores')
          .update({
            adjustment,
            adjustment_reason: reason,
            adjusted_by: user?.id,
            adjusted_at: new Date().toISOString(),
            final_score: newScore,
          })
          .eq('id', targetId);

        await supabase.from('score_adjustment_history').insert({
          adjustment_type: 'final',
          final_score_id: targetId,
          user_id: memberId,
          previous_score: previousScore,
          new_score: newScore,
          adjustment,
          reason,
          adjusted_by: user?.id,
        });
      }

      toast({ title: 'Thành công', description: 'Đã điều chỉnh điểm' });
      setAdjustmentDialog(null);
      fetchScoreData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle appeal submission
  const handleSubmitAppeal = async (content: string, files: File[]) => {
    if (!appealDialog) return;
    setIsProcessing(true);
    
    try {
      // Create appeal
      const { data: appealData, error: appealError } = await supabase
        .from('score_appeals')
        .insert({
          user_id: user?.id,
          appeal_type: appealDialog.type,
          task_score_id: appealDialog.type === 'task' ? appealDialog.scoreId : null,
          stage_score_id: appealDialog.type === 'stage' ? appealDialog.scoreId : null,
          final_score_id: appealDialog.type === 'final' ? appealDialog.scoreId : null,
          content,
        })
        .select()
        .single();

      if (appealError) throw appealError;

      // Upload attachments
      for (const file of files) {
        const filePath = `${user?.id}/${appealData.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('appeal-attachments')
          .upload(filePath, file);

        if (!uploadError) {
          await supabase.from('appeal_attachments').insert({
            appeal_id: appealData.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type,
          });
        }
      }

      toast({ title: 'Thành công', description: 'Đã gửi phúc khảo' });
      setAppealDialog(null);
      fetchScoreData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle appeal response
  const handleAppealResponse = async (approved: boolean, response: string) => {
    if (!reviewDialog.appeal) return;
    setIsProcessing(true);
    
    try {
      await supabase.from('score_appeals')
        .update({
          status: approved ? 'approved' : 'rejected',
          response,
          responded_by: user?.id,
          responded_at: new Date().toISOString(),
        })
        .eq('id', reviewDialog.appeal.id);

      toast({ 
        title: 'Thành công', 
        description: approved ? 'Đã chấp nhận phúc khảo' : 'Đã từ chối phúc khảo' 
      });
      setReviewDialog({ isOpen: false, appeal: null });
      fetchScoreData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle stage weights save
  const handleSaveWeights = async (weights: { stageId: string; weight: number }[]) => {
    setIsProcessing(true);
    try {
      for (const { stageId, weight } of weights) {
        const existing = stageWeights.find(w => w.stage_id === stageId);
        if (existing) {
          await supabase.from('stage_weights')
            .update({ weight })
            .eq('id', existing.id);
        } else {
          await supabase.from('stage_weights').insert({
            stage_id: stageId,
            weight,
          });
        }
      }
      toast({ title: 'Thành công', description: 'Đã lưu trọng số giai đoạn' });
      setWeightDialog(false);
      fetchScoreData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper functions
  const getMemberProfile = (userId: string) => members.find(m => m.user_id === userId)?.profiles;
  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-primary';
    if (score >= 50) return 'text-yellow-600';
    return 'text-destructive';
  };

  const getAdjustmentIcon = (adjustment: number) => {
    if (adjustment > 0) return <TrendingUp className="w-3 h-3 text-green-600" />;
    if (adjustment < 0) return <TrendingDown className="w-3 h-3 text-destructive" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const pendingAppealsCount = appeals.filter(a => a.status === 'pending').length;

  // Get visible members (leader sees all, member sees only self)
  const visibleMembers = isLeader ? members : members.filter(m => m.user_id === user?.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" />
            Điểm quá trình
          </h2>
          <p className="text-muted-foreground mt-1">
            Đánh giá mức độ đóng góp của thành viên
          </p>
        </div>

        {isLeader && (
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setWeightDialog(true)}
            >
              <Scale className="w-4 h-4 mr-2" />
              Trọng số
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={initializeTaskScores}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Khởi tạo điểm
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={calculateStageScores}
              disabled={isProcessing}
            >
              Tính điểm GĐ
            </Button>
            <Button 
              size="sm"
              onClick={calculateFinalScores}
              disabled={isProcessing}
            >
              Tính điểm cuối
            </Button>
          </div>
        )}
      </div>

      {/* Pending Appeals Alert */}
      {isLeader && pendingAppealsCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              Có <strong>{pendingAppealsCount}</strong> phúc khảo đang chờ xử lý
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-auto"
              onClick={() => setActiveTab('appeals')}
            >
              Xem ngay
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Tổng quan
          </TabsTrigger>
          <TabsTrigger value="stages" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Chi tiết
          </TabsTrigger>
          <TabsTrigger value="appeals" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Phúc khảo
            {pendingAppealsCount > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-xs">
                {pendingAppealsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Lịch sử
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Điểm quá trình thành viên</CardTitle>
              <CardDescription>
                {isLeader ? 'Tổng quan điểm của tất cả thành viên' : 'Điểm quá trình của bạn'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {visibleMembers.map(member => {
                  const profile = member.profiles;
                  const finalScore = finalScores.find(fs => fs.user_id === member.user_id);
                  const memberStageScores = stageScores.filter(ss => ss.user_id === member.user_id);
                  const memberTaskScores = taskScores.filter(ts => ts.user_id === member.user_id);
                  const memberAppeals = appeals.filter(a => a.user_id === member.user_id && a.status === 'pending');
                  
                  const score = finalScore?.final_score ?? 100;
                  const adjustment = finalScore?.adjustment ?? 0;

                  return (
                    <div 
                      key={member.id}
                      className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(profile?.full_name || '')}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{profile?.full_name}</p>
                        <p className="text-sm text-muted-foreground">{profile?.student_id}</p>
                      </div>

                      {/* Task & Stage counts */}
                      <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{memberTaskScores.length} task</span>
                        <span>{memberStageScores.length} GĐ</span>
                      </div>

                      {/* Pending appeals */}
                      {memberAppeals.length > 0 && (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          <Clock className="w-3 h-3 mr-1" />
                          {memberAppeals.length}
                        </Badge>
                      )}

                      {/* Score display */}
                      <div className="flex items-center gap-2">
                        {adjustment !== 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="flex items-center gap-1">
                                  {getAdjustmentIcon(adjustment)}
                                  <span className={`text-xs ${adjustment > 0 ? 'text-green-600' : 'text-destructive'}`}>
                                    {adjustment > 0 ? '+' : ''}{adjustment}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{finalScore?.adjustment_reason || 'Điều chỉnh điểm'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <span className={`text-xl font-bold ${getScoreColor(score)}`}>
                          {score.toFixed(1)}
                        </span>
                      </div>

                      {/* Actions */}
                      {isLeader && finalScore && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAdjustmentDialog({
                            isOpen: true,
                            type: 'final',
                            targetId: finalScore.id,
                            memberId: member.user_id,
                            memberName: profile?.full_name || '',
                            currentScore: score,
                          })}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}

                      {/* Appeal button for member */}
                      {!isLeader && member.user_id === user?.id && adjustment < 0 && finalScore && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAppealDialog({
                            isOpen: true,
                            type: 'final',
                            scoreId: finalScore.id,
                            currentScore: score,
                            adjustment,
                            adjustmentReason: finalScore.adjustment_reason,
                          })}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Phúc khảo
                        </Button>
                      )}
                    </div>
                  );
                })}

                {visibleMembers.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Chưa có dữ liệu điểm
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stages Detail Tab */}
        <TabsContent value="stages" className="mt-6 space-y-4">
          {stages.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">Chưa có giai đoạn nào</p>
              </CardContent>
            </Card>
          ) : (
            stages.sort((a, b) => a.order_index - b.order_index).map(stage => {
              const stageTasks = tasks.filter(t => t.stage_id === stage.id);
              const isExpanded = expandedStages.has(stage.id);
              const weight = stageWeights.find(w => w.stage_id === stage.id)?.weight ?? 1;

              return (
                <Card key={stage.id}>
                  <Collapsible open={isExpanded} onOpenChange={(open) => {
                    setExpandedStages(prev => {
                      const next = new Set(prev);
                      if (open) next.add(stage.id);
                      else next.delete(stage.id);
                      return next;
                    });
                  }}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            <div>
                              <CardTitle className="text-lg">{stage.name}</CardTitle>
                              <CardDescription>
                                {stageTasks.length} task • Trọng số: {weight}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary">GĐ {stage.order_index + 1}</Badge>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="space-y-4">
                          {/* Stage scores for each member */}
                          {visibleMembers.map(member => {
                            const profile = member.profiles;
                            const stageScore = stageScores.find(
                              ss => ss.stage_id === stage.id && ss.user_id === member.user_id
                            );
                            const memberTaskScores = taskScores.filter(
                              ts => stageTasks.some(t => t.id === ts.task_id) && ts.user_id === member.user_id
                            );

                            if (memberTaskScores.length === 0) return null;

                            const isMemberExpanded = expandedMembers.has(`${stage.id}-${member.user_id}`);

                            return (
                              <Collapsible 
                                key={`${stage.id}-${member.user_id}`}
                                open={isMemberExpanded}
                                onOpenChange={(open) => {
                                  setExpandedMembers(prev => {
                                    const next = new Set(prev);
                                    const key = `${stage.id}-${member.user_id}`;
                                    if (open) next.add(key);
                                    else next.delete(key);
                                    return next;
                                  });
                                }}
                              >
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                                    {isMemberExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                        {getInitials(profile?.full_name || '')}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">{profile?.full_name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {memberTaskScores.length} task
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {stageScore?.adjustment !== 0 && stageScore?.adjustment && (
                                        <span className={`text-xs ${stageScore.adjustment > 0 ? 'text-green-600' : 'text-destructive'}`}>
                                          {stageScore.adjustment > 0 ? '+' : ''}{stageScore.adjustment}
                                        </span>
                                      )}
                                      <span className={`font-bold ${getScoreColor(stageScore?.final_stage_score ?? 100)}`}>
                                        {(stageScore?.final_stage_score ?? 100).toFixed(1)}
                                      </span>
                                    </div>
                                    {isLeader && stageScore && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAdjustmentDialog({
                                            isOpen: true,
                                            type: 'stage',
                                            targetId: stageScore.id,
                                            memberId: member.user_id,
                                            memberName: profile?.full_name || '',
                                            currentScore: stageScore.final_stage_score ?? 100,
                                          });
                                        }}
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </CollapsibleTrigger>
                                
                                <CollapsibleContent>
                                  <div className="ml-8 mt-2 space-y-2">
                                    {memberTaskScores.map(taskScore => {
                                      const task = stageTasks.find(t => t.id === taskScore.task_id);
                                      return (
                                        <div 
                                          key={taskScore.id}
                                          className="flex items-center gap-3 p-2 rounded bg-background border text-sm"
                                        >
                                          <span className="flex-1 truncate">{task?.title}</span>
                                          {taskScore.adjustment !== 0 && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <span className={`text-xs ${taskScore.adjustment > 0 ? 'text-green-600' : 'text-destructive'}`}>
                                                    {taskScore.adjustment > 0 ? '+' : ''}{taskScore.adjustment}
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>{taskScore.adjustment_reason}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                          <span className={`font-medium ${getScoreColor(taskScore.final_score)}`}>
                                            {taskScore.final_score.toFixed(1)}
                                          </span>
                                          {isLeader && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 w-6 p-0"
                                              onClick={() => setAdjustmentDialog({
                                                isOpen: true,
                                                type: 'task',
                                                targetId: taskScore.id,
                                                memberId: member.user_id,
                                                memberName: profile?.full_name || '',
                                                currentScore: taskScore.final_score,
                                              })}
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </Button>
                                          )}
                                          {!isLeader && member.user_id === user?.id && taskScore.adjustment < 0 && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6"
                                              onClick={() => setAppealDialog({
                                                isOpen: true,
                                                type: 'task',
                                                scoreId: taskScore.id,
                                                currentScore: taskScore.final_score,
                                                adjustment: taskScore.adjustment,
                                                adjustmentReason: taskScore.adjustment_reason,
                                              })}
                                            >
                                              <MessageSquare className="w-3 h-3" />
                                            </Button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Appeals Tab */}
        <TabsContent value="appeals" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Phúc khảo</CardTitle>
              <CardDescription>
                {isLeader ? 'Quản lý các yêu cầu phúc khảo từ thành viên' : 'Các yêu cầu phúc khảo của bạn'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {appeals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Chưa có phúc khảo nào
                </p>
              ) : (
                <div className="space-y-3">
                  {appeals.map(appeal => {
                    const profile = getMemberProfile(appeal.user_id);
                    const typeLabel = appeal.appeal_type === 'task' ? 'Task' : 
                                      appeal.appeal_type === 'stage' ? 'Giai đoạn' : 'Điểm cuối';
                    
                    return (
                      <div 
                        key={appeal.id}
                        className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setReviewDialog({ isOpen: true, appeal })}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(profile?.full_name || '')}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{profile?.full_name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {appeal.content}
                          </p>
                        </div>

                        <Badge variant="outline">{typeLabel}</Badge>
                        
                        {appeal.attachments && appeal.attachments.length > 0 && (
                          <Badge variant="secondary">
                            <FileText className="w-3 h-3 mr-1" />
                            {appeal.attachments.length}
                          </Badge>
                        )}

                        {appeal.status === 'pending' && (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                            <Clock className="w-3 h-3 mr-1" />
                            Chờ xử lý
                          </Badge>
                        )}
                        {appeal.status === 'approved' && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Chấp nhận
                          </Badge>
                        )}
                        {appeal.status === 'rejected' && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Từ chối
                          </Badge>
                        )}

                        <span className="text-xs text-muted-foreground">
                          {new Date(appeal.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <ScoreHistoryPanel 
            history={history} 
            members={members}
            isLeader={isLeader}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {adjustmentDialog?.isOpen && (
        <ScoreAdjustmentDialog
          isOpen={true}
          onClose={() => setAdjustmentDialog(null)}
          onSave={handleAdjustScore}
          title={
            adjustmentDialog.type === 'task' ? 'Điều chỉnh điểm Task' :
            adjustmentDialog.type === 'stage' ? 'Điều chỉnh điểm Giai đoạn' :
            'Điều chỉnh điểm Quá trình'
          }
          currentScore={adjustmentDialog.currentScore}
          memberName={adjustmentDialog.memberName}
          isLoading={isProcessing}
        />
      )}

      {appealDialog?.isOpen && (
        <AppealDialog
          isOpen={true}
          onClose={() => setAppealDialog(null)}
          onSubmit={handleSubmitAppeal}
          title="Gửi phúc khảo"
          description="Trình bày lý do và đính kèm minh chứng để phúc khảo điểm"
          currentScore={appealDialog.currentScore}
          adjustment={appealDialog.adjustment}
          adjustmentReason={appealDialog.adjustmentReason}
          isLoading={isProcessing}
        />
      )}

      {reviewDialog.isOpen && (
        <AppealReviewDialog
          isOpen={true}
          onClose={() => setReviewDialog({ isOpen: false, appeal: null })}
          appeal={reviewDialog.appeal}
          onApprove={(response) => handleAppealResponse(true, response)}
          onReject={(response) => handleAppealResponse(false, response)}
          isLoading={isProcessing}
        />
      )}

      <StageWeightDialog
        isOpen={weightDialog}
        onClose={() => setWeightDialog(false)}
        onSave={handleSaveWeights}
        stages={stages}
        currentWeights={stageWeights}
        isLoading={isProcessing}
      />
    </div>
  );
}
