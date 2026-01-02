import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TaskListView from '@/components/TaskListView';
import GroupDashboard from '@/components/GroupDashboard';
import GroupInfoCard from '@/components/GroupInfoCard';
import MemberManagementCard from '@/components/MemberManagementCard';
import TaskEditDialog from '@/components/TaskEditDialog';
import StageEditDialog from '@/components/StageEditDialog';
import ProjectActivityLog from '@/components/ProjectActivityLog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, Loader2, ArrowLeft, Layers, LayoutDashboard, Trash2, Settings, Activity } from 'lucide-react';
import type { Group, GroupMember, Task, Profile, Stage } from '@/types/database';
import { DeadlineHourPicker } from '@/components/DeadlineHourPicker';

interface ExtendedGroup extends Group {
  class_code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
  zalo_link: string | null;
  additional_info: string | null;
}

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const [group, setGroup] = useState<ExtendedGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLeaderInGroup, setIsLeaderInGroup] = useState(false);
  const [isGroupCreator, setIsGroupCreator] = useState(false);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  // Dialogs
  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [isCreatingStage, setIsCreatingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageDescription, setNewStageDescription] = useState('');

  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskAssignees, setNewTaskAssignees] = useState<string[]>([]);
  const [newTaskStageId, setNewTaskStageId] = useState<string>('');

  const [isDeleteGroupDialogOpen, setIsDeleteGroupDialogOpen] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [stageToDelete, setStageToDelete] = useState<Stage | null>(null);

  useEffect(() => { if (groupId) fetchGroupData(); }, [groupId]);

  const fetchGroupData = async () => {
    try {
      const { data: groupData } = await supabase.from('groups').select('*').eq('id', groupId).single();
      if (groupData) setGroup(groupData as ExtendedGroup);

      const { data: stagesData } = await supabase.from('stages').select('*').eq('group_id', groupId).order('order_index');
      if (stagesData) setStages(stagesData);

      const { data: membersData } = await supabase.from('group_members').select('*').eq('group_id', groupId);
      if (membersData) {
        const userIds = membersData.map(m => m.user_id);
        const { data: profilesData } = await supabase.from('profiles').select('*').in('id', userIds);
        const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        setMembers(membersData.map(m => ({ ...m, profiles: profilesMap.get(m.user_id) })) as GroupMember[]);
        const myMembership = membersData.find(m => m.user_id === user?.id);
        setIsLeaderInGroup(myMembership?.role === 'leader' || myMembership?.role === 'admin' || isAdmin);
        // Check if current user is the group creator (Trưởng nhóm)
        setIsGroupCreator(groupData?.created_by === user?.id || isAdmin);
      }

      const { data: tasksData } = await supabase.from('tasks').select('*').eq('group_id', groupId).order('created_at', { ascending: false });
      if (tasksData) {
        const taskIds = tasksData.map(t => t.id);
        const { data: assignmentsData } = await supabase.from('task_assignments').select('*').in('task_id', taskIds);
        const assigneeIds = [...new Set(assignmentsData?.map(a => a.user_id) || [])];
        const { data: assigneeProfiles } = await supabase.from('profiles').select('*').in('id', assigneeIds);
        const profilesMap = new Map(assigneeProfiles?.map(p => [p.id, p]) || []);
        setTasks(tasksData.map(task => ({
          ...task,
          task_assignments: assignmentsData?.filter(a => a.task_id === task.id).map(a => ({ ...a, profiles: profilesMap.get(a.user_id) })) || [],
        })) as Task[]);
      }

      const { data: profilesData } = await supabase.from('profiles').select('*').eq('is_approved', true);
      if (profilesData) setAllProfiles(profilesData);
    } catch (error: any) {
      toast({ title: 'Lỗi', description: 'Không thể tải thông tin', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return;
    setIsCreatingStage(true);
    try {
      await supabase.from('stages').insert({ group_id: groupId, name: newStageName.trim(), description: newStageDescription.trim() || null, order_index: stages.length });
      toast({ title: 'Thành công', description: 'Đã tạo giai đoạn mới' });
      setIsStageDialogOpen(false);
      setNewStageName('');
      setNewStageDescription('');
      fetchGroupData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsCreatingStage(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || (stages.length > 0 && !newTaskStageId)) return;
    setIsCreatingTask(true);
    try {
      const { data: newTask } = await supabase.from('tasks').insert({ group_id: groupId, title: newTaskTitle.trim(), description: newTaskDescription.trim() || null, deadline: newTaskDeadline || null, stage_id: newTaskStageId || null, created_by: user!.id }).select().single();
      if (newTask && newTaskAssignees.length > 0) {
        await supabase.from('task_assignments').insert(newTaskAssignees.map(userId => ({ task_id: newTask.id, user_id: userId })));
      }
      toast({ title: 'Thành công', description: 'Đã tạo task mới' });
      setIsTaskDialogOpen(false);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDeadline('');
      setNewTaskAssignees([]);
      setNewTaskStageId('');
      fetchGroupData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (deleteConfirmText !== group?.name) return;
    setIsDeletingGroup(true);
    try {
      const taskIds = tasks.map(t => t.id);
      if (taskIds.length > 0) {
        await supabase.from('task_assignments').delete().in('task_id', taskIds);
        await supabase.from('task_scores').delete().in('task_id', taskIds);
        await supabase.from('submission_history').delete().in('task_id', taskIds);
      }
      await supabase.from('tasks').delete().eq('group_id', groupId);
      const stageIds = stages.map(s => s.id);
      if (stageIds.length > 0) await supabase.from('member_stage_scores').delete().in('stage_id', stageIds);
      await supabase.from('stages').delete().eq('group_id', groupId);
      await supabase.from('pending_approvals').delete().eq('group_id', groupId);
      await supabase.from('group_members').delete().eq('group_id', groupId);
      await supabase.from('activity_logs').delete().eq('group_id', groupId);
      await supabase.from('groups').delete().eq('id', groupId);
      toast({ title: 'Thành công', description: 'Đã xóa project' });
      navigate('/groups');
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleDeleteStage = async () => {
    if (!stageToDelete) return;
    try {
      await supabase.from('tasks').update({ stage_id: null }).eq('stage_id', stageToDelete.id);
      await supabase.from('member_stage_scores').delete().eq('stage_id', stageToDelete.id);
      await supabase.from('stages').delete().eq('id', stageToDelete.id);
      toast({ title: 'Thành công', description: 'Đã xóa giai đoạn' });
      setStageToDelete(null);
      fetchGroupData();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    }
  };

  const availableProfiles = allProfiles.filter(p => !members.some(m => m.user_id === p.id));

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!group) return <DashboardLayout><div className="text-center py-16"><h1 className="text-2xl font-bold mb-2">Không tìm thấy project</h1><Link to="/groups"><Button>Quay lại</Button></Link></div></DashboardLayout>;


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link to="/groups" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"><ArrowLeft className="w-4 h-4 mr-1" />Quay lại</Link>
            <h1 className="text-3xl font-bold">{group.name}</h1>
            {group.description && <p className="text-muted-foreground mt-1">{group.description}</p>}
          </div>
        </div>

        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <TabsList>
              <TabsTrigger value="overview" className="gap-2"><LayoutDashboard className="w-4 h-4" />Tổng quan</TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2"><Layers className="w-4 h-4" />Task & Giai đoạn</TabsTrigger>
              <TabsTrigger value="members" className="gap-2"><Users className="w-4 h-4" />Thành viên ({members.length})</TabsTrigger>
              <TabsTrigger value="logs" className="gap-2"><Activity className="w-4 h-4" />Nhật ký</TabsTrigger>
              {isLeaderInGroup && group.created_by === user?.id && <TabsTrigger value="settings" className="gap-2"><Settings className="w-4 h-4" />Cài đặt</TabsTrigger>}
            </TabsList>

            {/* Contextual Action Buttons for Leader */}
            {isLeaderInGroup && (
              <div className="flex gap-2">
                {activeTab === 'tasks' && (
                  <>
                    <Dialog open={isStageDialogOpen} onOpenChange={setIsStageDialogOpen}>
                      <DialogTrigger asChild><Button variant="outline" size="sm"><Layers className="w-4 h-4 mr-2" />Tạo giai đoạn</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Tạo giai đoạn mới</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2"><Label>Tên giai đoạn</Label><Input value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="VD: Giai đoạn 1" /></div>
                          <div className="space-y-2"><Label>Mô tả</Label><Textarea value={newStageDescription} onChange={e => setNewStageDescription(e.target.value)} /></div>
                        </div>
                        <DialogFooter><Button variant="outline" onClick={() => setIsStageDialogOpen(false)}>Hủy</Button><Button onClick={handleCreateStage} disabled={isCreatingStage}>{isCreatingStage ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tạo'}</Button></DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Dialog open={isTaskDialogOpen} onOpenChange={(open) => { 
                      setIsTaskDialogOpen(open); 
                      // Auto-select the latest (most recently created) stage
                      if (open && stages.length > 0) {
                        const latestStage = [...stages].sort((a, b) => 
                          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        )[0];
                        setNewTaskStageId(latestStage.id);
                      }
                    }}>
                      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Tạo task</Button></DialogTrigger>
                      <DialogContent className="max-w-[95vw] w-[1400px] h-[85vh] max-h-[800px] p-0 overflow-hidden flex flex-col">
                        {/* Header */}
                        <DialogHeader className="px-6 py-3 border-b bg-gradient-to-r from-primary/10 to-transparent shrink-0">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30">
                              <Plus className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <DialogTitle className="text-lg font-bold">Tạo task mới</DialogTitle>
                              <DialogDescription className="text-xs mt-0.5">Điền thông tin để tạo task cho project</DialogDescription>
                            </div>
                          </div>
                        </DialogHeader>
                        
                        {/* Content - No scroll needed */}
                        <div className="flex-1 p-5 overflow-hidden">
                          <div className="grid grid-cols-3 gap-5 h-full">
                            {/* Left Column - Basic Info (2/3 width) */}
                            <div className="col-span-2 flex flex-col gap-4">
                              {/* Task Title & Description Card */}
                              <div className="p-5 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent flex-1 flex flex-col">
                                <h3 className="text-sm font-bold text-primary flex items-center gap-2 mb-4 uppercase tracking-wide">
                                  <div className="w-2 h-2 rounded-full bg-primary" />
                                  Thông tin cơ bản
                                </h3>
                                <div className="space-y-4 flex-1 flex flex-col">
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Tên task <span className="text-destructive">*</span></Label>
                                    <Input 
                                      value={newTaskTitle} 
                                      onChange={e => setNewTaskTitle(e.target.value)} 
                                      placeholder="VD: Hoàn thành báo cáo chương 1"
                                      className="h-10"
                                    />
                                  </div>
                                  <div className="space-y-2 flex-1 flex flex-col">
                                    <Label className="text-sm font-medium">Mô tả chi tiết</Label>
                                    <Textarea 
                                      value={newTaskDescription} 
                                      onChange={e => setNewTaskDescription(e.target.value)} 
                                      placeholder="Mô tả công việc cần thực hiện, yêu cầu cụ thể, tài liệu tham khảo..."
                                      className="resize-none flex-1 min-h-[120px]"
                                    />
                                  </div>
                                </div>
                              </div>
                              
                              {/* Stage & Deadline Card */}
                              <div className="p-5 rounded-xl border-2 border-warning/20 bg-gradient-to-br from-warning/5 to-transparent">
                                <h3 className="text-sm font-bold text-warning flex items-center gap-2 mb-4 uppercase tracking-wide">
                                  <div className="w-2 h-2 rounded-full bg-warning" />
                                  Thời gian & Giai đoạn
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                  {stages.length > 0 && (
                                    <div className="space-y-2">
                                      <Label className="text-sm font-medium">Giai đoạn <span className="text-destructive">*</span></Label>
                                      <Select value={newTaskStageId} onValueChange={setNewTaskStageId}>
                                        <SelectTrigger className="h-10">
                                          <SelectValue placeholder="Chọn giai đoạn" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Deadline</Label>
                                    <DeadlineHourPicker
                                      value={newTaskDeadline}
                                      onChange={setNewTaskDeadline}
                                      placeholder="Chọn ngày..."
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Right Column - Assignees (1/3 width) */}
                            <div className="col-span-1">
                              <div className="p-5 rounded-xl border-2 border-success/20 bg-gradient-to-br from-success/5 to-transparent h-full flex flex-col">
                                <h3 className="text-sm font-bold text-success flex items-center gap-2 mb-4 uppercase tracking-wide">
                                  <div className="w-2 h-2 rounded-full bg-success" />
                                  Người phụ trách
                                </h3>
                                <div className="border rounded-xl bg-background/50 p-2 flex-1 overflow-y-auto">
                                  {members.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground text-sm">
                                      Chưa có thành viên trong project
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      {members.map(m => (
                                        <div 
                                          key={m.id} 
                                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                                            newTaskAssignees.includes(m.user_id) 
                                              ? 'bg-success/10 border-2 border-success/40 shadow-sm' 
                                              : 'hover:bg-muted/50 border-2 border-transparent'
                                          }`}
                                          onClick={() => {
                                            if (newTaskAssignees.includes(m.user_id)) {
                                              setNewTaskAssignees(newTaskAssignees.filter(id => id !== m.user_id));
                                            } else {
                                              setNewTaskAssignees([...newTaskAssignees, m.user_id]);
                                            }
                                          }}
                                        >
                                          <Checkbox 
                                            id={`a-${m.user_id}`} 
                                            checked={newTaskAssignees.includes(m.user_id)} 
                                            onCheckedChange={c => c ? setNewTaskAssignees([...newTaskAssignees, m.user_id]) : setNewTaskAssignees(newTaskAssignees.filter(id => id !== m.user_id))} 
                                            className="h-5 w-5"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <label htmlFor={`a-${m.user_id}`} className="text-sm font-medium cursor-pointer block truncate">
                                              {m.profiles?.full_name}
                                            </label>
                                            <p className="text-xs text-muted-foreground">{m.profiles?.student_id}</p>
                                          </div>
                                          {m.role === 'leader' && (
                                            <span className="text-xs px-2 py-1 rounded-full bg-warning/20 text-warning font-medium shrink-0">
                                              Leader
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {newTaskAssignees.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-3 text-center">
                                    Đã chọn <span className="font-bold text-success">{newTaskAssignees.length}</span> thành viên
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Footer */}
                        <DialogFooter className="px-5 py-3 border-t bg-muted/30 gap-2 shrink-0">
                          <Button variant="outline" onClick={() => setIsTaskDialogOpen(false)} className="h-10 min-w-24">
                            Hủy
                          </Button>
                          <Button onClick={handleCreateTask} disabled={isCreatingTask} className="h-10 min-w-32 gap-2">
                            {isCreatingTask ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Đang tạo...
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                Tạo task
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </div>
            )}
          </div>

          <TabsContent value="overview" className="mt-6">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2"><GroupDashboard tasks={tasks} members={members} stages={stages} /></div>
              <div><GroupInfoCard group={group} canEdit={isLeaderInGroup} onUpdate={fetchGroupData} /></div>
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="mt-6">
            <TaskListView stages={stages} tasks={tasks} members={members} isLeaderInGroup={isLeaderInGroup} groupId={groupId!} onRefresh={fetchGroupData} onEditTask={setEditingTask} onCreateTask={(stageId) => { setNewTaskStageId(stageId); setIsTaskDialogOpen(true); }} onEditStage={setEditingStage} onDeleteStage={setStageToDelete} />
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <MemberManagementCard members={members} availableProfiles={availableProfiles} isLeaderInGroup={isLeaderInGroup} isGroupCreator={isGroupCreator} groupId={groupId!} currentUserId={user?.id || ''} groupCreatorId={group.created_by} onRefresh={fetchGroupData} />
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <ProjectActivityLog groupId={groupId!} />
          </TabsContent>

          {isLeaderInGroup && group.created_by === user?.id && (
            <TabsContent value="settings" className="mt-6">
              <Card>
                <CardHeader><CardTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />Xóa project</CardTitle><CardDescription>Hành động này không thể hoàn tác.</CardDescription></CardHeader>
                <CardContent><Button variant="destructive" onClick={() => setIsDeleteGroupDialogOpen(true)}><Trash2 className="w-4 h-4 mr-2" />Xóa project này</Button></CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <TaskEditDialog task={editingTask} stages={stages} members={members} isOpen={!!editingTask} onClose={() => setEditingTask(null)} onSave={fetchGroupData} canEdit={isLeaderInGroup} />
      
      <StageEditDialog stage={editingStage} isOpen={!!editingStage} onClose={() => setEditingStage(null)} onSave={fetchGroupData} groupId={groupId!} />
      
      <AlertDialog open={!!stageToDelete} onOpenChange={() => setStageToDelete(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xác nhận xóa giai đoạn</AlertDialogTitle><AlertDialogDescription>Task trong giai đoạn này sẽ trở thành "Chưa phân giai đoạn".</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction onClick={handleDeleteStage} className="bg-destructive text-destructive-foreground">Xóa</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteGroupDialogOpen} onOpenChange={setIsDeleteGroupDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xác nhận xóa project</AlertDialogTitle><AlertDialogDescription>Nhập tên project <span className="font-bold">"{group.name}"</span> để xác nhận:<Input className="mt-2" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} /></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Hủy</AlertDialogCancel><AlertDialogAction onClick={handleDeleteGroup} className="bg-destructive text-destructive-foreground" disabled={isDeletingGroup || deleteConfirmText !== group.name}>{isDeletingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xóa vĩnh viễn'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
