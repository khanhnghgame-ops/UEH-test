import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import UserAvatar from '@/components/UserAvatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDeadlineVN } from '@/lib/datetime';
import { ArrowLeft, Loader2, ExternalLink, Calendar, Clock, Save } from 'lucide-react';
import type { Task, TaskAssignment, Profile, TaskStatus } from '@/types/database';

export default function TaskDetail() {
  const { groupId, taskId } = useParams<{ groupId: string; taskId: string }>();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [assignees, setAssignees] = useState<(TaskAssignment & { profiles?: Profile })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaderInGroup, setIsLeaderInGroup] = useState(false);
  const [isAssignee, setIsAssignee] = useState(false);

  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [submissionLink, setSubmissionLink] = useState('');

  useEffect(() => {
    if (taskId && groupId) fetchTaskData();
  }, [taskId, groupId]);

  const fetchTaskData = async () => {
    try {
      const { data: taskData } = await supabase.from('tasks').select('*').eq('id', taskId).single();
      if (taskData) {
        setTask(taskData);
        setStatus(taskData.status as TaskStatus);
        setSubmissionLink(taskData.submission_link || '');
      }

      const { data: assignmentsData } = await supabase.from('task_assignments').select('*').eq('task_id', taskId);
      if (assignmentsData) {
        const userIds = assignmentsData.map(a => a.user_id);
        const { data: profilesData } = await supabase.from('profiles').select('*').in('id', userIds);
        const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        const assigneesWithProfiles = assignmentsData.map(a => ({ ...a, profiles: profilesMap.get(a.user_id) }));
        setAssignees(assigneesWithProfiles);
        setIsAssignee(assignmentsData.some(a => a.user_id === user?.id));
      }

      const { data: memberData } = await supabase.from('group_members').select('role').eq('group_id', groupId).eq('user_id', user?.id).maybeSingle();
      setIsLeaderInGroup(memberData?.role === 'leader' || memberData?.role === 'admin' || isAdmin);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates: any = {};
      if (isAssignee || isLeaderInGroup) updates.status = status;
      if (isAssignee) updates.submission_link = submissionLink || null;
      if (isLeaderInGroup && status === 'VERIFIED') updates.status = 'VERIFIED';

      const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
      if (error) throw error;
      toast({ title: 'Đã lưu', description: 'Cập nhật task thành công' });
      fetchTaskData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'TODO': return 'bg-muted text-muted-foreground';
      case 'IN_PROGRESS': return 'bg-warning/10 text-warning';
      case 'DONE': return 'bg-primary/10 text-primary';
      case 'VERIFIED': return 'bg-success/10 text-success';
      default: return 'bg-muted';
    }
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!task) return <DashboardLayout><div className="text-center py-16"><h1 className="text-2xl font-bold mb-2">Không tìm thấy task</h1><Link to={`/groups/${groupId}`}><Button>Quay lại</Button></Link></div></DashboardLayout>;

  const canEdit = isAssignee || isLeaderInGroup;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to={`/groups/${groupId}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" />Quay lại nhóm
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">{task.title}</CardTitle>
                {task.description && <p className="text-muted-foreground mt-2">{task.description}</p>}
              </div>
              <Badge className={getStatusColor(task.status)}>{task.status === 'TODO' ? 'Chờ làm' : task.status === 'IN_PROGRESS' ? 'Đang làm' : task.status === 'DONE' ? 'Hoàn thành' : 'Đã duyệt'}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {task.deadline && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>Deadline: {formatDeadlineVN(task.deadline)}</span>
              </div>
            )}

            <div>
              <Label className="mb-2 block">Người được giao</Label>
              <div className="flex flex-wrap gap-2">
                {assignees.map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full">
                    <UserAvatar src={a.profiles?.avatar_url} name={a.profiles?.full_name} size="xs" />
                    <span className="text-sm">{a.profiles?.full_name}</span>
                  </div>
                ))}
              </div>
            </div>

            {canEdit && (
              <>
                <div className="space-y-2">
                  <Label>Trạng thái</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)} disabled={!canEdit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODO">Chờ làm</SelectItem>
                      <SelectItem value="IN_PROGRESS">Đang làm</SelectItem>
                      <SelectItem value="DONE">Hoàn thành</SelectItem>
                      {isLeaderInGroup && <SelectItem value="VERIFIED">Đã duyệt</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>

                {isAssignee && (
                  <div className="space-y-2">
                    <Label>Link nộp bài</Label>
                    <Input placeholder="https://drive.google.com/..." value={submissionLink} onChange={(e) => setSubmissionLink(e.target.value)} />
                  </div>
                )}

                <Button onClick={handleSave} disabled={isSaving} className="w-full">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}Lưu thay đổi
                </Button>
              </>
            )}

            {task.submission_link && (
              <div className="p-4 bg-muted rounded-lg">
                <Label className="mb-2 block">Bài nộp</Label>
                <a href={task.submission_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />{task.submission_link}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}