import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Award, Scale, History, 
  AlertCircle, CheckCircle, Clock, Edit2, MessageSquare,
  TrendingUp, TrendingDown, Minus, FileText, Users, Loader2,
  ChevronRight, Info, Target, BarChart3, Star, Eye
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

interface AdjustmentDetailDialog {
  isOpen: boolean;
  type: 'task' | 'stage' | 'final';
  title: string;
  score: number;
  baseScore: number;
  adjustment: number;
  reason: string | null;
  adjustedAt: string | null;
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
  
  // Adjustment detail dialog for viewing reasons
  const [adjustmentDetailDialog, setAdjustmentDetailDialog] = useState<AdjustmentDetailDialog | null>(null);

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

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-green-100 border-green-200';
    if (score >= 70) return 'bg-blue-100 border-blue-200';
    if (score >= 50) return 'bg-yellow-100 border-yellow-200';
    return 'bg-red-100 border-red-200';
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

  const pendingAppealsCount = appeals.filter(a => a.status === 'pending').length;
  
  // Get current user data for member view
  const currentUserMember = members.find(m => m.user_id === user?.id);
  const currentUserProfile = currentUserMember?.profiles;
  const currentUserFinalScore = finalScores.find(fs => fs.user_id === user?.id);
  const currentUserStageScores = stageScores.filter(ss => ss.user_id === user?.id);
  const currentUserTaskScores = taskScores.filter(ts => ts.user_id === user?.id);
  const currentUserAppeals = appeals.filter(a => a.user_id === user?.id);

  // Get visible members (leader sees all, member sees only self)
  const visibleMembers = isLeader ? members : members.filter(m => m.user_id === user?.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Render Member Overview (Beautiful personal dashboard)
  const renderMemberOverview = () => {
    const finalScore = currentUserFinalScore?.final_score ?? 100;
    const calculatedScore = currentUserFinalScore?.calculated_score ?? 100;
    const adjustment = currentUserFinalScore?.adjustment ?? 0;
    
    return (
      <div className="space-y-6">
        {/* Personal Score Card */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-4 border-background shadow-lg">
                <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                  {getInitials(currentUserProfile?.full_name || '')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{currentUserProfile?.full_name}</h2>
                <p className="text-muted-foreground">{currentUserProfile?.student_id}</p>
              </div>
              
              {/* Final Score Display */}
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Điểm quá trình</p>
                <div className={`text-4xl font-bold ${getScoreColor(finalScore)}`}>
                  {finalScore.toFixed(1)}
                </div>
                {adjustment !== 0 && (
                  <div 
                    className="flex items-center justify-end gap-1 mt-1 cursor-pointer hover:opacity-80"
                    onClick={() => setAdjustmentDetailDialog({
                      isOpen: true,
                      type: 'final',
                      title: 'Chi tiết điểm quá trình',
                      score: finalScore,
                      baseScore: calculatedScore,
                      adjustment,
                      reason: currentUserFinalScore?.adjustment_reason || null,
                      adjustedAt: currentUserFinalScore?.adjusted_at || null,
                    })}
                  >
                    {getAdjustmentBadge(adjustment)}
                    <Info className="w-3 h-3 text-muted-foreground ml-1" />
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <CardContent className="pt-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mức độ hoàn thành</span>
                <span className="font-medium">{finalScore.toFixed(0)}%</span>
              </div>
              <Progress value={Math.min(finalScore, 100)} className="h-2" />
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <Target className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-2xl font-bold">{currentUserTaskScores.length}</p>
                <p className="text-xs text-muted-foreground">Task</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <BarChart3 className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-2xl font-bold">{currentUserStageScores.length}</p>
                <p className="text-xs text-muted-foreground">Giai đoạn</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <MessageSquare className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-2xl font-bold">{currentUserAppeals.length}</p>
                <p className="text-xs text-muted-foreground">Phúc khảo</p>
              </div>
            </div>

            {/* Appeal Button for Final Score */}
            {currentUserFinalScore && (
              <div className="mt-4 pt-4 border-t flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAppealDialog({
                    isOpen: true,
                    type: 'final',
                    scoreId: currentUserFinalScore.id,
                    currentScore: finalScore,
                    adjustment,
                    adjustmentReason: currentUserFinalScore.adjustment_reason,
                  })}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Phúc khảo điểm tổng
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stage Scores Detail */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Điểm theo giai đoạn
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stages.sort((a, b) => a.order_index - b.order_index).map(stage => {
              const stageScore = currentUserStageScores.find(ss => ss.stage_id === stage.id);
              const weight = stageWeights.find(w => w.stage_id === stage.id)?.weight ?? 1;
              const score = stageScore?.final_stage_score ?? 100;
              const baseScore = stageScore?.average_score ?? 100;
              const adjustment = stageScore?.adjustment ?? 0;
              const stageTasks = tasks.filter(t => t.stage_id === stage.id);
              const stageTaskScores = currentUserTaskScores.filter(
                ts => stageTasks.some(t => t.id === ts.task_id)
              );

              return (
                <div 
                  key={stage.id} 
                  className={`p-4 rounded-lg border ${getScoreBgColor(score)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-background">
                          GĐ {stage.order_index + 1}
                        </Badge>
                        <span className="font-medium">{stage.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          x{weight}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {stageTaskScores.length} task đã chấm điểm
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {adjustment !== 0 && (
                        <div 
                          className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                          onClick={() => setAdjustmentDetailDialog({
                            isOpen: true,
                            type: 'stage',
                            title: `Chi tiết điểm ${stage.name}`,
                            score,
                            baseScore,
                            adjustment,
                            reason: stageScore?.adjustment_reason || null,
                            adjustedAt: stageScore?.adjusted_at || null,
                          })}
                        >
                          {getAdjustmentBadge(adjustment)}
                          <Info className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                      
                      <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
                        {score.toFixed(1)}
                      </span>
                      
                      {stageScore && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAppealDialog({
                            isOpen: true,
                            type: 'stage',
                            scoreId: stageScore.id,
                            currentScore: score,
                            adjustment,
                            adjustmentReason: stageScore.adjustment_reason,
                          })}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {stages.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                Chưa có giai đoạn nào
              </p>
            )}
          </CardContent>
        </Card>

        {/* Task Scores Detail */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Điểm theo task
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentUserTaskScores.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Chưa có điểm task nào
              </p>
            ) : (
              currentUserTaskScores.map(taskScore => {
                const task = tasks.find(t => t.id === taskScore.task_id);
                const stage = stages.find(s => s.id === task?.stage_id);
                const adjustment = taskScore.adjustment ?? 0;
                
                return (
                  <div 
                    key={taskScore.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{task?.title || 'Task không xác định'}</p>
                      {stage && (
                        <p className="text-xs text-muted-foreground">
                          {stage.name}
                        </p>
                      )}
                    </div>
                    
                    {adjustment !== 0 && (
                      <div 
                        className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                        onClick={() => setAdjustmentDetailDialog({
                          isOpen: true,
                          type: 'task',
                          title: `Chi tiết điểm: ${task?.title || 'Task'}`,
                          score: taskScore.final_score,
                          baseScore: 100,
                          adjustment,
                          reason: taskScore.adjustment_reason || null,
                          adjustedAt: taskScore.adjusted_at || null,
                        })}
                      >
                        {getAdjustmentBadge(adjustment)}
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </div>
                    )}
                    
                    <span className={`text-lg font-bold ${getScoreColor(taskScore.final_score)}`}>
                      {taskScore.final_score.toFixed(1)}
                    </span>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAppealDialog({
                        isOpen: true,
                        type: 'task',
                        scoreId: taskScore.id,
                        currentScore: taskScore.final_score,
                        adjustment,
                        adjustmentReason: taskScore.adjustment_reason,
                      })}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render Leader Overview (All members table)
  const renderLeaderOverview = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Điểm quá trình thành viên
        </CardTitle>
        <CardDescription>
          Tổng quan điểm của tất cả thành viên trong nhóm
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {members.map(member => {
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
                className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${getScoreBgColor(score)}`}
              >
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(profile?.full_name || '')}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{profile?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{profile?.student_id}</p>
                </div>

                {/* Task & Stage counts */}
                <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Target className="w-4 h-4" />
                    {memberTaskScores.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-4 h-4" />
                    {memberStageScores.length}
                  </span>
                </div>

                {/* Pending appeals */}
                {memberAppeals.length > 0 && (
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                    <Clock className="w-3 h-3 mr-1" />
                    {memberAppeals.length} phúc khảo
                  </Badge>
                )}

                {/* Score display with adjustment */}
                <div className="flex items-center gap-2">
                  {adjustment !== 0 && (
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                      onClick={() => setAdjustmentDetailDialog({
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
                  <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
                    {score.toFixed(1)}
                  </span>
                </div>

                {/* Actions */}
                {finalScore && (
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
              </div>
            );
          })}

          {members.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              Chưa có thành viên nào
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Render Detail Tab for Leader (Stage -> Task -> Assignees structure)
  const renderLeaderDetail = () => (
    <div className="space-y-4">
      {stages.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Chưa có giai đoạn nào</p>
          </CardContent>
        </Card>
      ) : (
        stages.sort((a, b) => a.order_index - b.order_index).map(stage => {
          const stageTasks = tasks.filter(t => t.stage_id === stage.id);
          const weight = stageWeights.find(w => w.stage_id === stage.id)?.weight ?? 1;

          return (
            <Card key={stage.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary">{stage.order_index + 1}</Badge>
                    <div>
                      <CardTitle className="text-lg">{stage.name}</CardTitle>
                      <CardDescription>
                        {stageTasks.length} task • Trọng số: x{weight}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stageTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Chưa có task nào trong giai đoạn này
                    </p>
                  ) : (
                    stageTasks.map(task => {
                      // Get all scores for this task
                      const taskScoresForTask = taskScores.filter(ts => ts.task_id === task.id);
                      
                      return (
                        <div key={task.id} className="border rounded-lg overflow-hidden">
                          {/* Task Header */}
                          <div className="flex items-center gap-3 p-3 bg-muted/50">
                            <Target className="w-4 h-4 text-primary" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{task.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {taskScoresForTask.length} người được giao
                              </p>
                            </div>
                            {task.status === 'DONE' && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Hoàn thành
                              </Badge>
                            )}
                            {task.status === 'VERIFIED' && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                <Star className="w-3 h-3 mr-1" />
                                Đã duyệt
                              </Badge>
                            )}
                          </div>
                          
                          {/* Assignees with their scores */}
                          {taskScoresForTask.length > 0 ? (
                            <div className="divide-y">
                              {taskScoresForTask.map(taskScore => {
                                const member = members.find(m => m.user_id === taskScore.user_id);
                                const profile = member?.profiles;
                                const adjustment = taskScore.adjustment ?? 0;
                                
                                return (
                                  <div 
                                    key={taskScore.id}
                                    className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                                  >
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                        {getInitials(profile?.full_name || '')}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{profile?.full_name}</p>
                                      <p className="text-xs text-muted-foreground">{profile?.student_id}</p>
                                    </div>
                                    
                                    {/* Adjustment badge with click to view detail */}
                                    {adjustment !== 0 && (
                                      <div 
                                        className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                                        onClick={() => setAdjustmentDetailDialog({
                                          isOpen: true,
                                          type: 'task',
                                          title: `Chi tiết điểm: ${profile?.full_name} - ${task.title}`,
                                          score: taskScore.final_score,
                                          baseScore: 100,
                                          adjustment,
                                          reason: taskScore.adjustment_reason || null,
                                          adjustedAt: taskScore.adjusted_at || null,
                                        })}
                                      >
                                        {getAdjustmentBadge(adjustment)}
                                        <Eye className="w-3 h-3 text-muted-foreground" />
                                      </div>
                                    )}
                                    
                                    {/* Score display */}
                                    <span className={`text-lg font-bold ${getScoreColor(taskScore.final_score)}`}>
                                      {taskScore.final_score.toFixed(1)}
                                    </span>
                                    
                                    {/* Edit button for leader */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => setAdjustmentDialog({
                                        isOpen: true,
                                        type: 'task',
                                        targetId: taskScore.id,
                                        memberId: taskScore.user_id,
                                        memberName: profile?.full_name || '',
                                        currentScore: taskScore.final_score,
                                      })}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                              Chưa có điểm cho task này
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );

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
            {isLeader ? 'Đánh giá mức độ đóng góp của thành viên' : 'Theo dõi điểm quá trình của bạn'}
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

      {/* Main Content */}
      {isLeader ? (
        // Leader view with tabs
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

          <TabsContent value="overview" className="mt-6">
            {renderLeaderOverview()}
          </TabsContent>

          <TabsContent value="stages" className="mt-6">
            {renderLeaderDetail()}
          </TabsContent>

          <TabsContent value="appeals" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Phúc khảo</CardTitle>
                <CardDescription>
                  Quản lý các yêu cầu phúc khảo từ thành viên
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

          <TabsContent value="history" className="mt-6">
            <ScoreHistoryPanel 
              history={history} 
              members={members}
              isLeader={isLeader}
            />
          </TabsContent>
        </Tabs>
      ) : (
        // Member view - Personal dashboard
        renderMemberOverview()
      )}

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

      {/* Adjustment Detail Dialog */}
      {adjustmentDetailDialog && (
        <Dialog 
          open={adjustmentDetailDialog.isOpen} 
          onOpenChange={(open) => !open && setAdjustmentDetailDialog(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                {adjustmentDetailDialog.title}
              </DialogTitle>
              <DialogDescription>
                Chi tiết về điểm và điều chỉnh
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Điểm gốc</p>
                  <p className="text-2xl font-bold">{adjustmentDetailDialog.baseScore.toFixed(1)}</p>
                </div>
                <div className={`p-4 rounded-lg text-center ${getScoreBgColor(adjustmentDetailDialog.score)}`}>
                  <p className="text-sm text-muted-foreground mb-1">Điểm hiện tại</p>
                  <p className={`text-2xl font-bold ${getScoreColor(adjustmentDetailDialog.score)}`}>
                    {adjustmentDetailDialog.score.toFixed(1)}
                  </p>
                </div>
              </div>

              {adjustmentDetailDialog.adjustment !== 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Điều chỉnh:</span>
                      {getAdjustmentBadge(adjustmentDetailDialog.adjustment)}
                    </div>
                    
                    {adjustmentDetailDialog.reason && (
                      <div className={`p-4 rounded-lg ${adjustmentDetailDialog.adjustment < 0 ? 'bg-destructive/10 border border-destructive/20' : 'bg-green-50 border border-green-200'}`}>
                        <p className="text-sm font-medium mb-1">
                          {adjustmentDetailDialog.adjustment < 0 ? 'Lý do trừ điểm:' : 'Lý do cộng điểm:'}
                        </p>
                        <p className="text-sm">{adjustmentDetailDialog.reason}</p>
                      </div>
                    )}
                    
                    {adjustmentDetailDialog.adjustedAt && (
                      <p className="text-xs text-muted-foreground text-right">
                        Điều chỉnh lúc: {new Date(adjustmentDetailDialog.adjustedAt).toLocaleString('vi-VN')}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
