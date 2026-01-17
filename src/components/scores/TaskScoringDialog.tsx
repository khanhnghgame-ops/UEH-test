import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import UserAvatar from '@/components/UserAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Target,
  Users,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Edit2,
  UserCheck,
  UsersRound,
  Award,
  Percent,
} from 'lucide-react';
import type { Task, GroupMember } from '@/types/database';
import type { TaskScore } from '@/types/processScores';

interface TaskScoringDialogProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  members: GroupMember[];
  taskScores: TaskScore[];
  onScoreUpdated: () => void;
}

interface MemberScoreEdit {
  userId: string;
  scoreId: string | null;
  adjustment: number;
  reason: string;
  currentScore: number;
  isScored: boolean; // Whether this member has been explicitly scored
  isEditing: boolean;
}

export default function TaskScoringDialog({
  isOpen,
  onClose,
  task,
  members,
  taskScores,
  onScoreUpdated,
}: TaskScoringDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [memberEdits, setMemberEdits] = useState<MemberScoreEdit[]>([]);
  const [scoringMode, setScoringMode] = useState<'group' | 'individual'>('group');
  
  // Group scoring state
  const [groupAdjustment, setGroupAdjustment] = useState(0);
  const [groupReason, setGroupReason] = useState('');

  // Get task assignees
  const taskAssigneeIds = task?.task_assignments?.map((a: any) => a.user_id) || [];
  const assignedMembers = members.filter(m => taskAssigneeIds.includes(m.user_id));

  useEffect(() => {
    if (isOpen && task) {
      // Initialize member edit states
      const edits: MemberScoreEdit[] = assignedMembers.map(member => {
        const existingScore = taskScores.find(
          ts => ts.task_id === task.id && ts.user_id === member.user_id
        );
        
        // Check if this score was explicitly set (has adjusted_by or adjustment is not 0)
        const isExplicitlyScored = existingScore ? 
          (existingScore.adjusted_by !== null || existingScore.adjustment !== 0 || existingScore.adjustment !== null) : 
          false;
        
        return {
          userId: member.user_id,
          scoreId: existingScore?.id || null,
          adjustment: existingScore?.adjustment || 0,
          reason: existingScore?.adjustment_reason || '',
          currentScore: existingScore?.final_score || 100,
          isScored: isExplicitlyScored && existingScore?.adjusted_by !== null,
          isEditing: false,
        };
      });
      setMemberEdits(edits);
      
      // Reset group scoring
      setGroupAdjustment(0);
      setGroupReason('');
    }
  }, [isOpen, task, taskScores, assignedMembers.length]);


  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-primary';
    if (score >= 50) return 'text-yellow-600';
    return 'text-destructive';
  };

  const getAdjustmentIcon = (adjustment: number) => {
    if (adjustment > 0) return <TrendingUp className="w-3 h-3 text-green-500" />;
    if (adjustment < 0) return <TrendingDown className="w-3 h-3 text-destructive" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const toggleEditing = (userId: string) => {
    setMemberEdits(prev =>
      prev.map(e =>
        e.userId === userId ? { ...e, isEditing: !e.isEditing } : e
      )
    );
  };

  const updateMemberScore = (userId: string, field: 'adjustment' | 'reason', value: any) => {
    setMemberEdits(prev =>
      prev.map(e => {
        if (e.userId === userId) {
          const updated = { ...e, [field]: value };
          if (field === 'adjustment') {
            updated.currentScore = 100 + Number(value);
          }
          return updated;
        }
        return e;
      })
    );
  };

  // Save individual member score
  const handleSaveScore = async (edit: MemberScoreEdit) => {
    if (!task || !user) return;

    setIsLoading(true);
    try {
      const newScore = 100 + edit.adjustment;

      if (edit.scoreId) {
        // Update existing score
        const existingScore = taskScores.find(ts => ts.id === edit.scoreId);
        const previousScore = existingScore?.final_score || 100;

        await supabase
          .from('task_scores')
          .update({
            adjustment: edit.adjustment,
            adjustment_reason: edit.reason || null,
            adjusted_by: user.id,
            adjusted_at: new Date().toISOString(),
            final_score: newScore,
          })
          .eq('id', edit.scoreId);

        // Log history
        await supabase.from('score_adjustment_history').insert({
          adjustment_type: 'task',
          task_score_id: edit.scoreId,
          user_id: edit.userId,
          previous_score: previousScore,
          new_score: newScore,
          adjustment: edit.adjustment,
          reason: edit.reason || 'Chấm điểm task',
          adjusted_by: user.id,
        });
      } else {
        // Create new score
        const { data: newScoreData, error } = await supabase
          .from('task_scores')
          .insert({
            task_id: task.id,
            user_id: edit.userId,
            base_score: 100,
            adjustment: edit.adjustment,
            adjustment_reason: edit.reason || null,
            adjusted_by: user.id,
            adjusted_at: new Date().toISOString(),
            final_score: newScore,
          })
          .select()
          .single();

        if (error) throw error;

        // Log history
        await supabase.from('score_adjustment_history').insert({
          adjustment_type: 'task',
          task_score_id: newScoreData.id,
          user_id: edit.userId,
          previous_score: 100,
          new_score: newScore,
          adjustment: edit.adjustment,
          reason: edit.reason || 'Chấm điểm task',
          adjusted_by: user.id,
        });
      }

      toast({ title: 'Đã lưu điểm' });
      toggleEditing(edit.userId);
      onScoreUpdated();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Save group score (same score for all members)
  const handleSaveGroupScore = async () => {
    if (!task || !user || assignedMembers.length === 0) return;

    setIsLoading(true);
    try {
      const newScore = 100 + groupAdjustment;

      for (const member of assignedMembers) {
        const existingScore = taskScores.find(
          ts => ts.task_id === task.id && ts.user_id === member.user_id
        );

        if (existingScore) {
          const previousScore = existingScore.final_score || 100;

          await supabase
            .from('task_scores')
            .update({
              adjustment: groupAdjustment,
              adjustment_reason: groupReason || null,
              adjusted_by: user.id,
              adjusted_at: new Date().toISOString(),
              final_score: newScore,
            })
            .eq('id', existingScore.id);

          await supabase.from('score_adjustment_history').insert({
            adjustment_type: 'task',
            task_score_id: existingScore.id,
            user_id: member.user_id,
            previous_score: previousScore,
            new_score: newScore,
            adjustment: groupAdjustment,
            reason: groupReason || 'Chấm điểm task (nhóm)',
            adjusted_by: user.id,
          });
        } else {
          const { data: newScoreData, error } = await supabase
            .from('task_scores')
            .insert({
              task_id: task.id,
              user_id: member.user_id,
              base_score: 100,
              adjustment: groupAdjustment,
              adjustment_reason: groupReason || null,
              adjusted_by: user.id,
              adjusted_at: new Date().toISOString(),
              final_score: newScore,
            })
            .select()
            .single();

          if (!error && newScoreData) {
            await supabase.from('score_adjustment_history').insert({
              adjustment_type: 'task',
              task_score_id: newScoreData.id,
              user_id: member.user_id,
              previous_score: 100,
              new_score: newScore,
              adjustment: groupAdjustment,
              reason: groupReason || 'Chấm điểm task (nhóm)',
              adjusted_by: user.id,
            });
          }
        }
      }

      toast({ 
        title: 'Đã chấm điểm cho tất cả thành viên',
        description: `${assignedMembers.length} thành viên đã được chấm ${newScore} điểm`
      });
      onScoreUpdated();
      onClose();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const getScoredStatus = () => {
    const scoredCount = memberEdits.filter(e => e.isScored).length;
    const totalCount = memberEdits.length;
    return { scoredCount, totalCount };
  };

  const { scoredCount, totalCount } = getScoredStatus();

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[1280px] h-[720px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 p-6 pb-4 border-b">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold">Chấm điểm Task</DialogTitle>
              <DialogDescription className="mt-1">
                <span className="font-medium text-foreground text-base">{task.title}</span>
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="gap-1">
                  <Users className="w-3 h-3" />
                  {totalCount} thành viên
                </Badge>
                {scoredCount === totalCount && totalCount > 0 ? (
                  <Badge className="bg-green-500 gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Đã chấm đủ
                  </Badge>
                ) : scoredCount > 0 ? (
                  <Badge variant="secondary" className="gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {scoredCount}/{totalCount} đã chấm
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <AlertCircle className="w-3 h-3" />
                    Chưa chấm
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs for scoring mode */}
        <Tabs value={scoringMode} onValueChange={(v) => setScoringMode(v as 'group' | 'individual')} className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 px-6 pt-4">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="group" className="gap-2">
                <UsersRound className="w-4 h-4" />
                Chấm theo nhóm
              </TabsTrigger>
              <TabsTrigger value="individual" className="gap-2">
                <UserCheck className="w-4 h-4" />
                Chấm riêng lẻ
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Group Scoring Tab */}
          <TabsContent value="group" className="flex-1 overflow-auto px-6 pb-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="w-5 h-5 text-primary" />
                  Chấm điểm chung cho tất cả thành viên
                </CardTitle>
                <CardDescription>
                  Áp dụng cùng một mức điểm cho toàn bộ {totalCount} thành viên tham gia task này
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Score Preview */}
                <div className="flex items-center justify-center gap-8 p-6 bg-muted/50 rounded-xl">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Điểm gốc</p>
                    <span className="text-3xl font-bold">100</span>
                  </div>
                  <div className="text-center">
                    {getAdjustmentIcon(groupAdjustment)}
                    <p className="text-sm text-muted-foreground mb-1">Điều chỉnh</p>
                    <span className={`text-3xl font-bold ${groupAdjustment > 0 ? 'text-green-500' : groupAdjustment < 0 ? 'text-destructive' : ''}`}>
                      {groupAdjustment > 0 ? '+' : ''}{groupAdjustment}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Điểm cuối</p>
                    <span className={`text-4xl font-bold ${getScoreColor(100 + groupAdjustment)}`}>
                      {100 + groupAdjustment}
                    </span>
                  </div>
                </div>

                {/* Adjustment Input */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Điều chỉnh điểm</Label>
                    <Input
                      type="number"
                      value={groupAdjustment}
                      onChange={(e) => setGroupAdjustment(Number(e.target.value))}
                      min={-100}
                      max={100}
                      className="text-lg h-12"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nhập số âm để trừ điểm, số dương để cộng điểm
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Lý do {groupAdjustment !== 0 && <span className="text-destructive">*</span>}
                    </Label>
                    <Textarea
                      value={groupReason}
                      onChange={(e) => setGroupReason(e.target.value)}
                      placeholder="Nhập lý do chấm điểm..."
                      rows={3}
                    />
                  </div>
                </div>

                {/* Members Preview */}
                <div className="space-y-2">
                  <Label>Thành viên sẽ được chấm điểm:</Label>
                  <div className="flex flex-wrap gap-2">
                    {assignedMembers.map(member => (
                      <div key={member.user_id} className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full">
                        <UserAvatar 
                          src={member.profiles?.avatar_url}
                          name={member.profiles?.full_name}
                          size="xs"
                        />
                        <span className="text-sm">{member.profiles?.full_name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={handleSaveGroupScore}
                    disabled={isLoading || (groupAdjustment !== 0 && !groupReason.trim()) || totalCount === 0}
                    size="lg"
                    className="min-w-[200px]"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Chấm điểm cho {totalCount} thành viên
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Individual Scoring Tab */}
          <TabsContent value="individual" className="flex-1 overflow-hidden px-6 pb-6 mt-4">
            <ScrollArea className="h-full">
              <div className="space-y-3 pr-4">
                {memberEdits.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg">Chưa có thành viên nào được giao task này</p>
                  </div>
                ) : (
                  memberEdits.map(edit => {
                    const member = members.find(m => m.user_id === edit.userId);
                    const profile = member?.profiles;

                    return (
                      <Card
                        key={edit.userId}
                        className={`transition-all ${
                          edit.isEditing
                            ? 'border-primary/50 bg-primary/5 shadow-md'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <CardContent className="p-4">
                          {/* Member Header */}
                          <div className="flex items-center gap-4">
                            <UserAvatar 
                              src={profile?.avatar_url}
                              name={profile?.full_name}
                              size="lg"
                            />

                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-base truncate">{profile?.full_name}</p>
                              <p className="text-sm text-muted-foreground">{profile?.student_id}</p>
                            </div>

                            {!edit.isEditing && (
                              <>
                                {/* Score Display */}
                                <div className="flex items-center gap-3">
                                  {edit.isScored ? (
                                    <>
                                      {edit.adjustment !== 0 && (
                                        <Badge
                                          variant={edit.adjustment > 0 ? 'default' : 'destructive'}
                                          className={`text-sm ${edit.adjustment > 0 ? 'bg-green-500' : ''}`}
                                        >
                                          {edit.adjustment > 0 ? '+' : ''}
                                          {edit.adjustment}
                                        </Badge>
                                      )}
                                      <div className="flex items-center gap-1">
                                        <span className={`text-2xl font-bold ${getScoreColor(edit.currentScore)}`}>
                                          {edit.currentScore}
                                        </span>
                                        <Percent className="w-4 h-4 text-muted-foreground" />
                                      </div>
                                    </>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      Chưa chấm
                                    </Badge>
                                  )}
                                </div>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleEditing(edit.userId)}
                                  className="gap-1"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  {edit.isScored ? 'Sửa' : 'Chấm'}
                                </Button>
                              </>
                            )}
                          </div>

                          {/* Editing Form */}
                          {edit.isEditing && (
                            <div className="mt-4 space-y-4 pt-4 border-t">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-sm">Điều chỉnh điểm</Label>
                                  <div className="flex items-center gap-3">
                                    <Input
                                      type="number"
                                      value={edit.adjustment}
                                      onChange={e =>
                                        updateMemberScore(edit.userId, 'adjustment', Number(e.target.value))
                                      }
                                      className="h-10"
                                      min={-100}
                                      max={100}
                                    />
                                    <div className="flex items-center gap-2 shrink-0 px-3 py-2 bg-muted rounded-lg">
                                      {getAdjustmentIcon(edit.adjustment)}
                                      <span className={`text-lg font-bold ${getScoreColor(edit.currentScore)}`}>
                                        = {edit.currentScore}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm">
                                    Lý do {edit.adjustment !== 0 && <span className="text-destructive">*</span>}
                                  </Label>
                                  <Textarea
                                    value={edit.reason}
                                    onChange={e => updateMemberScore(edit.userId, 'reason', e.target.value)}
                                    placeholder="Nhập lý do điều chỉnh điểm..."
                                    rows={2}
                                  />
                                </div>
                              </div>

                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleEditing(edit.userId)}
                                  disabled={isLoading}
                                >
                                  Hủy
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveScore(edit)}
                                  disabled={isLoading || (edit.adjustment !== 0 && !edit.reason.trim())}
                                >
                                  {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                  ) : (
                                    <Save className="w-4 h-4 mr-1" />
                                  )}
                                  Lưu
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
