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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
        return {
          userId: member.user_id,
          scoreId: existingScore?.id || null,
          adjustment: existingScore?.adjustment || 0,
          reason: existingScore?.adjustment_reason || '',
          currentScore: existingScore?.final_score || 100,
          isEditing: false,
        };
      });
      setMemberEdits(edits);
    }
  }, [isOpen, task, taskScores, assignedMembers.length]);

  const getInitials = (name: string) =>
    name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

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

  const getScoredStatus = () => {
    const scoredCount = memberEdits.filter(e => e.scoreId !== null).length;
    const totalCount = memberEdits.length;
    return { scoredCount, totalCount };
  };

  const { scoredCount, totalCount } = getScoredStatus();

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Chấm điểm Task
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block font-medium text-foreground">{task.title}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Users className="w-3 h-3" />
                {totalCount} thành viên
              </Badge>
              {scoredCount === totalCount ? (
                <Badge className="bg-green-500 gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Đã chấm đủ
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {scoredCount}/{totalCount} đã chấm
                </Badge>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 py-2">
            {memberEdits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Chưa có thành viên nào được giao task này</p>
              </div>
            ) : (
              memberEdits.map(edit => {
                const member = members.find(m => m.user_id === edit.userId);
                const profile = member?.profiles;

                return (
                  <div
                    key={edit.userId}
                    className={`p-4 rounded-lg border transition-all ${
                      edit.isEditing
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/50'
                    }`}
                  >
                    {/* Member Header */}
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(profile?.full_name || '')}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{profile?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{profile?.student_id}</p>
                      </div>

                      {!edit.isEditing && (
                        <>
                          {/* Score Display */}
                          <div className="flex items-center gap-2">
                            {edit.adjustment !== 0 && (
                              <Badge
                                variant={edit.adjustment > 0 ? 'default' : 'destructive'}
                                className={`text-xs ${edit.adjustment > 0 ? 'bg-green-500' : ''}`}
                              >
                                {edit.adjustment > 0 ? '+' : ''}
                                {edit.adjustment}
                              </Badge>
                            )}
                            <span className={`text-xl font-bold ${getScoreColor(edit.currentScore)}`}>
                              {edit.currentScore}
                            </span>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleEditing(edit.userId)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Editing Form */}
                    {edit.isEditing && (
                      <div className="mt-4 space-y-3 pt-3 border-t">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Điều chỉnh điểm</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={edit.adjustment}
                                onChange={e =>
                                  updateMemberScore(edit.userId, 'adjustment', Number(e.target.value))
                                }
                                className="h-9"
                                min={-100}
                                max={100}
                              />
                              <div className="flex items-center gap-1 shrink-0">
                                {getAdjustmentIcon(edit.adjustment)}
                                <span className={`font-bold ${getScoreColor(edit.currentScore)}`}>
                                  = {edit.currentScore}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">
                            Lý do {edit.adjustment !== 0 && <span className="text-destructive">*</span>}
                          </Label>
                          <Textarea
                            value={edit.reason}
                            onChange={e => updateMemberScore(edit.userId, 'reason', e.target.value)}
                            placeholder="Nhập lý do điều chỉnh điểm..."
                            rows={2}
                            className="text-sm"
                          />
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
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
