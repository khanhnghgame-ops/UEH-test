import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import UserAvatar from '@/components/UserAvatar';
import { 
  Award, Scale, History, 
  AlertCircle, CheckCircle, Clock, Edit2, MessageSquare,
  TrendingUp, TrendingDown, Minus, FileText, Users, Loader2,
  ChevronRight, Info, Target, BarChart3, Star, Eye, MoreHorizontal,
  RefreshCw, ArrowUp, ArrowDown, Percent, Activity
} from 'lucide-react';
import ScoreAdjustmentDialog from './ScoreAdjustmentDialog';
import AppealDialog from './AppealDialog';
import AppealReviewDialog from './AppealReviewDialog';
import StageWeightDialog from './StageWeightDialog';
import ScoreHistoryPanel from './ScoreHistoryPanel';
import TaskScoringDialog from './TaskScoringDialog';
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
  const [memberTab, setMemberTab] = useState('scores'); // For member view: scores | appeals
  
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
  
  // Task scoring dialog for Leader
  const [taskScoringDialog, setTaskScoringDialog] = useState<{
    isOpen: boolean;
    task: Task | null;
  }>({ isOpen: false, task: null });
  
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
      let fetchedTaskScores: TaskScore[] = [];
      if (taskIds.length > 0) {
        const { data: taskScoresData } = await supabase
          .from('task_scores')
          .select('*')
          .in('task_id', taskIds);
        fetchedTaskScores = (taskScoresData || []) as unknown as TaskScore[];
        setTaskScores(fetchedTaskScores);
      }

      // Fetch stage scores
      const stageIds = stages.map(s => s.id);
      let fetchedStageScores: MemberStageScore[] = [];
      if (stageIds.length > 0) {
        const { data: stageScoresData } = await supabase
          .from('member_stage_scores')
          .select('*')
          .in('stage_id', stageIds);
        fetchedStageScores = (stageScoresData || []) as unknown as MemberStageScore[];
        setStageScores(fetchedStageScores);

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

      // AUTO-SYNC: Ensure all assigned members have task scores & update calculations
      await autoSyncScores(fetchedTaskScores, fetchedStageScores);

    } catch (error: any) {
      toast({ title: 'Lỗi', description: 'Không thể tải dữ liệu điểm', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // AUTO-SYNC: Initialize missing scores and recalculate everything
  const autoSyncScores = async (currentTaskScores: TaskScore[], currentStageScores: MemberStageScore[]) => {
    try {
      // 1. Ensure all assigned members have task scores (auto-initialize)
      for (const task of tasks) {
        const assignments = task.task_assignments || [];
        for (const assignment of assignments) {
          const existing = currentTaskScores.find(
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

      // 2. Recalculate stage scores
      for (const stage of stages) {
        const stageTasks = tasks.filter(t => t.stage_id === stage.id);
        const stageTaskIds = stageTasks.map(t => t.id);
        
        const assigneeIds = new Set<string>();
        stageTasks.forEach(task => {
          task.task_assignments?.forEach(a => assigneeIds.add(a.user_id));
        });

        for (const userId of assigneeIds) {
          const userTaskScores = currentTaskScores.filter(
            ts => stageTaskIds.includes(ts.task_id) && ts.user_id === userId
          );

          if (userTaskScores.length > 0) {
            const avgScore = userTaskScores.reduce((sum, ts) => sum + (ts.final_score || 100), 0) / userTaskScores.length;
            
            const existing = currentStageScores.find(
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

      // 3. Recalculate final scores
      const memberIds = members.map(m => m.user_id);
      const { data: latestStageScores } = await supabase
        .from('member_stage_scores')
        .select('*')
        .in('stage_id', stages.map(s => s.id));
      
      const { data: latestWeights } = await supabase
        .from('stage_weights')
        .select('*')
        .in('stage_id', stages.map(s => s.id));
      
      const { data: latestFinalScores } = await supabase
        .from('member_final_scores')
        .select('*')
        .eq('group_id', groupId);
      
      for (const memberId of memberIds) {
        const memberStageScores = (latestStageScores || []).filter(ss => ss.user_id === memberId);
        
        if (memberStageScores.length > 0) {
          let totalWeight = 0;
          let weightedSum = 0;
          
          memberStageScores.forEach(ss => {
            const weight = (latestWeights || []).find(w => w.stage_id === ss.stage_id)?.weight ?? 1;
            weightedSum += (ss.final_stage_score || 100) * weight;
            totalWeight += weight;
          });

          const calculatedScore = totalWeight > 0 ? weightedSum / totalWeight : 100;
          
          const existing = (latestFinalScores || []).find(
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

      // Refresh data after sync
      const taskIds = tasks.map(t => t.id);
      if (taskIds.length > 0) {
        const { data: refreshedTaskScores } = await supabase
          .from('task_scores')
          .select('*')
          .in('task_id', taskIds);
        setTaskScores((refreshedTaskScores || []) as unknown as TaskScore[]);
      }
      
      const stageIds = stages.map(s => s.id);
      if (stageIds.length > 0) {
        const { data: refreshedStageScores } = await supabase
          .from('member_stage_scores')
          .select('*')
          .in('stage_id', stageIds);
        setStageScores((refreshedStageScores || []) as unknown as MemberStageScore[]);
      }
      
      const { data: refreshedFinalScores } = await supabase
        .from('member_final_scores')
        .select('*')
        .eq('group_id', groupId);
      setFinalScores((refreshedFinalScores || []) as unknown as MemberFinalScore[]);

    } catch (error) {
      console.error('Auto-sync error:', error);
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

  // Calculate real-time stats for Leader Dashboard
  const leaderStats = useMemo(() => {
    const avgFinalScore = finalScores.length > 0 
      ? finalScores.reduce((sum, fs) => sum + (fs.final_score || 100), 0) / finalScores.length 
      : 100;
    const scoredTasksCount = taskScores.length;
    const totalAssignments = tasks.reduce((sum, t) => sum + (t.task_assignments?.length || 0), 0);
    const completedTasks = tasks.filter(t => t.status === 'DONE' || t.status === 'VERIFIED').length;
    const adjustedCount = taskScores.filter(ts => (ts.adjustment ?? 0) !== 0).length;
    const highPerformers = finalScores.filter(fs => (fs.final_score || 100) >= 90).length;
    const lowPerformers = finalScores.filter(fs => (fs.final_score || 100) < 70).length;
    
    return {
      avgFinalScore,
      scoredTasksCount,
      totalAssignments,
      completedTasks,
      adjustedCount,
      highPerformers,
      lowPerformers,
      totalTasks: tasks.length,
      totalMembers: members.length,
    };
  }, [finalScores, taskScores, tasks, members]);

  // Helper to get task code - sync with TaskListView
  const getTaskCode = (task: Task, stageId: string | null) => {
    if (!stageId) return null;
    
    const sortedStages = [...stages].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const stageOrder = sortedStages.findIndex(s => s.id === stageId) + 1;
    if (stageOrder === 0) return null;
    
    const stageTasks = tasks
      .filter(t => t.stage_id === stageId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const taskOrder = stageTasks.findIndex(t => t.id === task.id) + 1;
    
    return `${stageOrder}.${taskOrder}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // =============================================
  // LEADER DASHBOARD - Visual Overview
  // =============================================
  const renderLeaderOverview = () => (
    <div className="space-y-6">
      {/* Real-time Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Điểm TB nhóm</p>
                <p className={`text-2xl font-bold ${getScoreColor(leaderStats.avgFinalScore)}`}>
                  {leaderStats.avgFinalScore.toFixed(1)}
                </p>
              </div>
              <div className="p-2 bg-primary/20 rounded-lg">
                <Percent className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Xuất sắc (≥90)</p>
                <p className="text-2xl font-bold text-green-600">
                  {leaderStats.highPerformers}
                </p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cần cải thiện (&lt;70)</p>
                <p className="text-2xl font-bold text-destructive">
                  {leaderStats.lowPerformers}
                </p>
              </div>
              <div className="p-2 bg-destructive/10 rounded-lg">
                <TrendingDown className="w-5 h-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Đã điều chỉnh</p>
                <p className="text-2xl font-bold text-primary">
                  {leaderStats.adjustedCount}
                </p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Edit2 className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Member Scores Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Điểm thành viên</CardTitle>
              <CardDescription>
                Cập nhật tự động theo thời gian thực
              </CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              <Activity className="w-3 h-3" />
              Live
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.map(member => {
              const profile = member.profiles;
              const finalScore = finalScores.find(fs => fs.user_id === member.user_id);
              const score = finalScore?.final_score ?? 100;
              const adjustment = finalScore?.adjustment ?? 0;
              const memberAppeals = appeals.filter(
                a => a.user_id === member.user_id && a.status === 'pending'
              );
              const memberTaskScores = taskScores.filter(ts => ts.user_id === member.user_id);
              const memberStageScores = stageScores.filter(ss => ss.user_id === member.user_id);

              return (
                <div 
                  key={member.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-sm ${
                    getScoreBgColor(score)
                  }`}
                >
                  <UserAvatar 
                    src={profile?.avatar_url} 
                    name={profile?.full_name}
                    size="md"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{profile?.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{memberTaskScores.length} task</span>
                      <span>•</span>
                      <span>{memberStageScores.length} giai đoạn</span>
                    </div>
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
    </div>
  );

  // =============================================
  // LEADER DETAIL VIEW - Stage/Task scoring
  // =============================================
  const renderLeaderDetail = () => {
    const sortedStages = [...stages].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return (
      <div className="space-y-4">
        {sortedStages.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">Chưa có giai đoạn nào</p>
            </CardContent>
          </Card>
        ) : (
          sortedStages.map((stage, stageIndex) => {
            const stageTasks = tasks
              .filter(t => t.stage_id === stage.id)
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const weight = stageWeights.find(w => w.stage_id === stage.id)?.weight ?? 1;
            const stageNumber = stageIndex + 1;

            return (
              <Card key={stage.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-primary">{stageNumber}</Badge>
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
                  <div className="space-y-2">
                    {stageTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Chưa có task nào trong giai đoạn này
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
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => setTaskScoringDialog({ isOpen: true, task })}
                          >
                            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0.5 font-mono font-semibold bg-primary/5 border-primary/20 text-primary">
                              {taskCode}
                            </Badge>
                            
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{task.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground">
                                  {totalCount} người thực hiện
                                </span>
                              </div>
                            </div>

                            {task.status === 'DONE' && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 shrink-0">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Xong
                              </Badge>
                            )}
                            {task.status === 'VERIFIED' && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 shrink-0">
                                <Star className="w-3 h-3 mr-1" />
                                Duyệt
                              </Badge>
                            )}

                            {totalCount > 0 && (
                              isFullyScored ? (
                                <Badge className="bg-green-500 shrink-0 gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Đã chấm
                                  {hasAdjustments && <span className="ml-0.5">•</span>}
                                </Badge>
                              ) : scoredCount > 0 ? (
                                <Badge variant="secondary" className="shrink-0 gap-1">
                                  <Clock className="w-3 h-3" />
                                  {scoredCount}/{totalCount}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                                  <AlertCircle className="w-3 h-3" />
                                  Chưa chấm
                                </Badge>
                              )
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTaskScoringDialog({ isOpen: true, task });
                              }}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
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
  };

  // =============================================
  // LEADER APPEALS VIEW
  // =============================================
  const renderLeaderAppeals = () => (
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
                  <UserAvatar 
                    src={profile?.avatar_url} 
                    name={profile?.full_name}
                    size="md"
                  />
                  
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
  );

  // =============================================
  // MEMBER SCORES VIEW (Compact)
  // =============================================
  const renderMemberScoresView = () => {
    const finalScore = currentUserFinalScore?.final_score ?? 100;
    const calculatedScore = currentUserFinalScore?.calculated_score ?? 100;
    const adjustment = currentUserFinalScore?.adjustment ?? 0;

    return (
      <div className="space-y-4">
        {/* Compact Score Summary */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
            <div className="flex items-center gap-4">
              <UserAvatar 
                src={currentUserProfile?.avatar_url} 
                name={currentUserProfile?.full_name}
                size="lg"
                className="border-2 border-background shadow"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{currentUserProfile?.full_name}</h3>
                <p className="text-sm text-muted-foreground">{currentUserProfile?.student_id}</p>
              </div>
              
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Điểm quá trình</p>
                <div className="flex items-center gap-2">
                  {adjustment !== 0 && (
                    <div 
                      className="flex items-center gap-1 cursor-pointer"
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
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className={`text-3xl font-bold ${getScoreColor(finalScore)}`}>
                    {finalScore.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-primary" />
                <span>{currentUserTaskScores.length} task</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span>{currentUserStageScores.length} giai đoạn</span>
              </div>
              {currentUserFinalScore && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7"
                  onClick={() => setAppealDialog({
                    isOpen: true,
                    type: 'final',
                    scoreId: currentUserFinalScore.id,
                    currentScore: finalScore,
                    adjustment,
                    adjustmentReason: currentUserFinalScore.adjustment_reason,
                  })}
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Phúc khảo
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stage Scores - Compact List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Điểm theo giai đoạn
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stages.sort((a, b) => a.order_index - b.order_index).map(stage => {
              const stageScore = currentUserStageScores.find(ss => ss.stage_id === stage.id);
              const weight = stageWeights.find(w => w.stage_id === stage.id)?.weight ?? 1;
              const score = stageScore?.final_stage_score ?? 100;
              const adjustment = stageScore?.adjustment ?? 0;

              return (
                <div 
                  key={stage.id} 
                  className={`flex items-center gap-3 p-3 rounded-lg border ${getScoreBgColor(score)}`}
                >
                  <Badge variant="outline" className="bg-background shrink-0">
                    GĐ {stage.order_index + 1}
                  </Badge>
                  <span className="flex-1 font-medium truncate">{stage.name}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">x{weight}</Badge>
                  {adjustment !== 0 && getAdjustmentBadge(adjustment)}
                  <span className={`text-lg font-bold ${getScoreColor(score)}`}>
                    {score.toFixed(1)}
                  </span>
                  {stageScore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setAppealDialog({
                        isOpen: true,
                        type: 'stage',
                        scoreId: stageScore.id,
                        currentScore: score,
                        adjustment,
                        adjustmentReason: stageScore.adjustment_reason,
                      })}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </Button>
                  )}
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

        {/* Task Scores - Compact List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Điểm theo task
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {currentUserTaskScores.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Chưa có điểm task nào
              </p>
            ) : (
              currentUserTaskScores.map(taskScore => {
                const task = tasks.find(t => t.id === taskScore.task_id);
                const stage = stages.find(s => s.id === task?.stage_id);
                const adjustment = taskScore.adjustment ?? 0;
                const taskCode = task ? getTaskCode(task, task.stage_id) : null;
                
                return (
                  <div 
                    key={taskScore.id}
                    className="flex items-center gap-2 p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    {taskCode && (
                      <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0.5 font-mono bg-primary/5 border-primary/20 text-primary">
                        {taskCode}
                      </Badge>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task?.title || 'Task không xác định'}</p>
                    </div>
                    {adjustment !== 0 && getAdjustmentBadge(adjustment)}
                    <span className={`font-bold ${getScoreColor(taskScore.final_score)}`}>
                      {taskScore.final_score.toFixed(0)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setAppealDialog({
                        isOpen: true,
                        type: 'task',
                        scoreId: taskScore.id,
                        currentScore: taskScore.final_score,
                        adjustment,
                        adjustmentReason: taskScore.adjustment_reason,
                      })}
                    >
                      <MessageSquare className="w-3 h-3" />
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

  // =============================================
  // MEMBER APPEALS VIEW (Separate Section)
  // =============================================
  const renderMemberAppealsView = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Phúc khảo của tôi
          </CardTitle>
          <CardDescription>
            Theo dõi trạng thái các yêu cầu phúc khảo đã gửi
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentUserAppeals.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Bạn chưa gửi phúc khảo nào</p>
              <p className="text-sm text-muted-foreground mt-1">
                Bấm vào nút phúc khảo bên cạnh điểm để gửi yêu cầu
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentUserAppeals.map(appeal => {
                const typeLabel = appeal.appeal_type === 'task' ? 'Task' : 
                                  appeal.appeal_type === 'stage' ? 'Giai đoạn' : 'Điểm cuối';
                
                return (
                  <div 
                    key={appeal.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      appeal.status === 'pending' 
                        ? 'border-yellow-200 bg-yellow-50/50' 
                        : appeal.status === 'approved'
                          ? 'border-green-200 bg-green-50/50'
                          : 'border-red-200 bg-red-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{typeLabel}</Badge>
                        {appeal.status === 'pending' && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">
                            <Clock className="w-3 h-3 mr-1" />
                            Chờ xử lý
                          </Badge>
                        )}
                        {appeal.status === 'approved' && (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Đã chấp nhận
                          </Badge>
                        )}
                        {appeal.status === 'rejected' && (
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Đã từ chối
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(appeal.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                    
                    <p className="text-sm">{appeal.content}</p>
                    
                    {appeal.attachments && appeal.attachments.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <FileText className="w-3 h-3" />
                        {appeal.attachments.length} tệp đính kèm
                      </div>
                    )}
                    
                    {appeal.response && (
                      <div className={`mt-3 p-3 rounded-lg ${
                        appeal.status === 'approved' 
                          ? 'bg-green-100/50' 
                          : 'bg-red-100/50'
                      }`}>
                        <p className="text-xs font-medium mb-1">Phản hồi từ Leader:</p>
                        <p className="text-sm">{appeal.response}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // =============================================
  // MAIN RENDER
  // =============================================
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
            {isLeader ? 'Điểm được cập nhật tự động theo thời gian thực' : 'Theo dõi điểm quá trình của bạn'}
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
              onClick={fetchScoreData}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Làm mới
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
              <span className="hidden sm:inline">Tổng quan</span>
            </TabsTrigger>
            <TabsTrigger value="stages" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Chi tiết</span>
            </TabsTrigger>
            <TabsTrigger value="appeals" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Phúc khảo</span>
              {pendingAppealsCount > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-xs">
                  {pendingAppealsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Lịch sử</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            {renderLeaderOverview()}
          </TabsContent>

          <TabsContent value="stages" className="mt-6">
            {renderLeaderDetail()}
          </TabsContent>

          <TabsContent value="appeals" className="mt-6">
            {renderLeaderAppeals()}
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
        // Member view - Tabbed layout with separate sections
        <Tabs value={memberTab} onValueChange={setMemberTab}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="scores" className="flex items-center gap-2">
              <Award className="w-4 h-4" />
              Điểm của tôi
            </TabsTrigger>
            <TabsTrigger value="appeals" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Phúc khảo
              {currentUserAppeals.filter(a => a.status === 'pending').length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                  {currentUserAppeals.filter(a => a.status === 'pending').length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scores" className="mt-4">
            {renderMemberScoresView()}
          </TabsContent>

          <TabsContent value="appeals" className="mt-4">
            {renderMemberAppealsView()}
          </TabsContent>
        </Tabs>
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

      {/* Task Scoring Dialog for Leader */}
      <TaskScoringDialog
        isOpen={taskScoringDialog.isOpen}
        onClose={() => setTaskScoringDialog({ isOpen: false, task: null })}
        task={taskScoringDialog.task}
        members={members}
        taskScores={taskScores}
        onScoreUpdated={fetchScoreData}
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
