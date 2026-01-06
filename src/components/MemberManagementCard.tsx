import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Users, 
  MoreVertical, 
  Trash2, 
  Crown, 
  Loader2, 
  UserPlus, 
  Search,
  Shield,
  UserCheck,
  Download,
} from 'lucide-react';
import { exportMembersToExcel, getRoleDisplayName } from '@/lib/excelExport';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { GroupMember, Profile } from '@/types/database';

interface MemberManagementCardProps {
  members: GroupMember[];
  availableProfiles: Profile[];
  isLeaderInGroup: boolean;
  isGroupCreator: boolean; // true if current user is group creator or admin
  groupId: string;
  currentUserId: string;
  groupCreatorId: string;
  onRefresh: () => void;
}

export default function MemberManagementCard({
  members,
  availableProfiles,
  isLeaderInGroup,
  isGroupCreator,
  groupId,
  currentUserId,
  groupCreatorId,
  onRefresh,
}: MemberManagementCardProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [memberToDelete, setMemberToDelete] = useState<GroupMember | null>(null);
  const [memberToChangeRole, setMemberToChangeRole] = useState<GroupMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  
  // Add member dialog - Only select from system members
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'member' | 'leader'>('member');
  const [searchQuery, setSearchQuery] = useState('');

  // Create new member dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [newMemberFullName, setNewMemberFullName] = useState('');
  const [newMemberStudentId, setNewMemberStudentId] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');

  // New role for change role dialog
  const [newRole, setNewRole] = useState<'member' | 'leader'>('member');

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-destructive/10 text-destructive text-xs gap-1"><Shield className="w-3 h-3" />Admin</Badge>;
      case 'leader':
        return <Badge className="bg-warning/10 text-warning text-xs gap-1"><Crown className="w-3 h-3" />Phó nhóm</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs gap-1"><UserCheck className="w-3 h-3" />Thành viên</Badge>;
    }
  };

  const isMemberGroupCreator = (memberId: string) => memberId === groupCreatorId;

  const canDeleteMember = (member: GroupMember) => {
    if (member.user_id === currentUserId) return false;
    if (isMemberGroupCreator(member.user_id)) return false;
    return isLeaderInGroup;
  };

  const canChangeRole = (member: GroupMember) => {
    if (isMemberGroupCreator(member.user_id)) return false;
    // Only group creator (Trưởng nhóm) can change roles, not Phó nhóm
    return isGroupCreator;
  };

  const resetAddForm = () => {
    setSelectedUserId('');
    setSelectedRole('member');
    setSearchQuery('');
  };

  const resetCreateForm = () => {
    setNewMemberFullName('');
    setNewMemberStudentId('');
    setNewMemberEmail('');
  };

  // Filter available profiles that are not already in the group
  const memberUserIds = members.map(m => m.user_id);
  const filteredProfiles = availableProfiles.filter(p => {
    // Exclude already added members
    if (memberUserIds.includes(p.id)) return false;
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(query) ||
        p.student_id.toLowerCase().includes(query) ||
        p.email.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const handleAddMember = async () => {
    if (!selectedUserId) {
      toast({ title: 'Lỗi', description: 'Vui lòng chọn thành viên từ danh sách', variant: 'destructive' });
      return;
    }
    setIsAddingMember(true);

    // Phó nhóm can only add as 'member', Group Creator can choose role
    const finalRole = isGroupCreator ? selectedRole : 'member';

    try {
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId,
        user_id: selectedUserId,
        role: finalRole,
      });

      if (error) {
        if (error.code === '23505') throw new Error('Thành viên này đã có trong project');
        throw error;
      }

      // Get the selected profile name for logging
      const selectedProfile = availableProfiles.find(p => p.id === selectedUserId);

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: profile?.full_name || user?.email || 'Unknown',
        action: 'ADD_MEMBER_TO_PROJECT',
        action_type: 'member',
        description: `Thêm ${selectedProfile?.full_name || 'thành viên'} vào project với vai trò ${finalRole === 'leader' ? 'Phó nhóm' : 'Thành viên'}`,
        group_id: groupId,
        metadata: { 
          added_user_id: selectedUserId, 
          added_user_name: selectedProfile?.full_name,
          role: finalRole 
        }
      });

      toast({ title: 'Thành công', description: `Đã thêm ${selectedProfile?.full_name || 'thành viên'} vào project` });
      setIsAddDialogOpen(false);
      resetAddForm();
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsAddingMember(false);
    }
  };

  // Create new member and add to project
  const handleCreateMember = async () => {
    if (!newMemberFullName.trim() || !newMemberStudentId.trim() || !newMemberEmail.trim()) {
      toast({ title: 'Lỗi', description: 'Vui lòng điền đầy đủ thông tin', variant: 'destructive' });
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newMemberEmail.trim())) {
      toast({ title: 'Lỗi', description: 'Email không hợp lệ', variant: 'destructive' });
      return;
    }

    setIsCreatingMember(true);

    try {
      // Step 1: Create user in system via edge function
      const { data: createResult, error: createError } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'create_member',
          email: newMemberEmail.trim(),
          student_id: newMemberStudentId.trim(),
          full_name: newMemberFullName.trim(),
        }
      });

      if (createError) throw new Error(createError.message);
      if (createResult?.error) throw new Error(createResult.error);

      const newUserId = createResult?.user?.id;
      if (!newUserId) throw new Error('Không thể tạo tài khoản');

      // Step 2: Add to project with role = 'member'
      const { error: addError } = await supabase.from('group_members').insert({
        group_id: groupId,
        user_id: newUserId,
        role: 'member',
      });

      if (addError) {
        if (addError.code === '23505') throw new Error('Thành viên này đã có trong project');
        throw addError;
      }

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: profile?.full_name || user?.email || 'Unknown',
        action: 'CREATE_AND_ADD_MEMBER',
        action_type: 'member',
        description: `Tạo tài khoản và thêm ${newMemberFullName.trim()} vào project với vai trò Thành viên`,
        group_id: groupId,
        metadata: { 
          created_user_id: newUserId, 
          created_user_name: newMemberFullName.trim(),
          created_user_email: newMemberEmail.trim(),
          role: 'member'
        }
      });

      toast({ 
        title: 'Thành công', 
        description: `Đã tạo tài khoản và thêm ${newMemberFullName.trim()} vào project. Mật khẩu mặc định: 123456` 
      });
      setIsCreateDialogOpen(false);
      resetCreateForm();
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsCreatingMember(false);
    }
  };

  const handleChangeRole = async () => {
    if (!memberToChangeRole) return;
    setIsChangingRole(true);

    try {
      const { error } = await supabase
        .from('group_members')
        .update({ role: newRole })
        .eq('id', memberToChangeRole.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: profile?.full_name || user?.email || 'Unknown',
        action: 'CHANGE_MEMBER_ROLE',
        action_type: 'member',
        description: `Đổi vai trò của ${memberToChangeRole.profiles?.full_name} thành ${newRole === 'leader' ? 'Phó nhóm' : 'Thành viên'}`,
        group_id: groupId,
        metadata: { 
          member_id: memberToChangeRole.user_id,
          old_role: memberToChangeRole.role,
          new_role: newRole
        }
      });

      toast({ 
        title: 'Thành công', 
        description: `Đã đổi vai trò của ${memberToChangeRole.profiles?.full_name} thành ${newRole === 'leader' ? 'Phó nhóm' : 'Thành viên'}` 
      });
      setMemberToChangeRole(null);
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsChangingRole(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;
    setIsDeleting(true);

    try {
      // Remove from task assignments first
      const { data: tasksData } = await supabase.from('tasks').select('id').eq('group_id', groupId);
      if (tasksData && tasksData.length > 0) {
        await supabase.from('task_assignments').delete()
          .eq('user_id', memberToDelete.user_id)
          .in('task_id', tasksData.map(t => t.id));
      }

      // Remove from group
      const { error } = await supabase.from('group_members').delete().eq('id', memberToDelete.id);
      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: profile?.full_name || user?.email || 'Unknown',
        action: 'REMOVE_MEMBER_FROM_PROJECT',
        action_type: 'member',
        description: `Xóa ${memberToDelete.profiles?.full_name} khỏi project`,
        group_id: groupId,
        metadata: { removed_user_id: memberToDelete.user_id, removed_user_name: memberToDelete.profiles?.full_name }
      });

      toast({ title: 'Đã xóa', description: `${memberToDelete.profiles?.full_name} đã bị xóa khỏi project` });
      setMemberToDelete(null);
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const openChangeRoleDialog = (member: GroupMember) => {
    setMemberToChangeRole(member);
    setNewRole(member.role === 'leader' ? 'member' : 'leader');
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Thành viên Project ({members.length})
            </CardTitle>
            {isLeaderInGroup && (
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => {
                    const exportData = members.map(m => ({
                      fullName: m.profiles?.full_name || '',
                      studentId: m.profiles?.student_id || '',
                      email: m.profiles?.email || '',
                      role: getRoleDisplayName(m.role)
                    }));
                    exportMembersToExcel(exportData, `danh-sach-thanh-vien-project`);
                  }}
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Xuất Excel</span>
                </Button>
                <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" variant="outline" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Tạo mới
                </Button>
                <Button onClick={() => setIsAddDialogOpen(true)} size="sm" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Thêm từ hệ thống
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                <Avatar className="w-12 h-12 border-2 border-background">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {member.profiles ? getInitials(member.profiles.full_name) : '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{member.profiles?.full_name}</p>
                    {isMemberGroupCreator(member.user_id) && (
                      <span title="Trưởng nhóm"><Crown className="w-4 h-4 text-warning" /></span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{member.profiles?.student_id}</span>
                    <span>•</span>
                    <span className="truncate">{member.profiles?.email}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {getRoleBadge(member.role)}
                  
                  {(canChangeRole(member) || canDeleteMember(member)) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canChangeRole(member) && (
                          <DropdownMenuItem onClick={() => openChangeRoleDialog(member)}>
                            <Shield className="w-4 h-4 mr-2" />
                            Đổi vai trò
                          </DropdownMenuItem>
                        )}
                        {canDeleteMember(member) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setMemberToDelete(member)} className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Xóa khỏi project
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
            
            {members.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Chưa có thành viên nào</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Member Dialog - Simplified: Only from system members */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetAddForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Thêm thành viên vào Project
            </DialogTitle>
            <DialogDescription>
              Chọn thành viên từ danh sách thành viên hệ thống. Thành viên mới có thể được tạo tại trang "Thành viên hệ thống".
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-2">
            {/* Search */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tìm kiếm thành viên</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo tên, MSSV hoặc email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 pl-10"
                />
              </div>
            </div>

            {/* Member List */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Chọn thành viên <span className="text-destructive">*</span></Label>
              <ScrollArea className="h-64 border rounded-lg p-2">
                {filteredProfiles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {searchQuery ? 'Không tìm thấy thành viên phù hợp' : 'Tất cả thành viên đã được thêm vào project'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredProfiles.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedUserId === p.id 
                            ? 'bg-primary/10 border-2 border-primary' 
                            : 'bg-muted/30 hover:bg-muted/50 border-2 border-transparent'
                        }`}
                        onClick={() => setSelectedUserId(p.id)}
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm">
                            {getInitials(p.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{p.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.student_id} • {p.email}
                          </p>
                        </div>
                        {selectedUserId === p.id && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Role Selection - Only for Group Creator */}
            {isGroupCreator ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Vai trò trong Project <span className="text-destructive">*</span></Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as 'member' | 'leader')}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        Thành viên - Được giao task và nộp bài
                      </div>
                    </SelectItem>
                    <SelectItem value="leader">
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-warning" />
                        Phó nhóm - Quản lý task, thành viên và giai đoạn
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">Vai trò trong Project</Label>
                <div className="h-11 flex items-center px-3 bg-muted/50 rounded-md border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserCheck className="w-4 h-4" />
                    Thành viên
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Vai trò mặc định: Member (Phó nhóm không có quyền thay đổi)
                </p>
              </div>
            )}

            {/* Info box */}
            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <p>💡 Một tài khoản có thể có vai trò khác nhau ở các project khác nhau.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleAddMember} disabled={!selectedUserId || isAddingMember} className="min-w-28">
              {isAddingMember ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang thêm...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Thêm vào Project
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={!!memberToChangeRole} onOpenChange={() => setMemberToChangeRole(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Đổi vai trò thành viên
            </DialogTitle>
            <DialogDescription>
              Thay đổi vai trò của <span className="font-medium">{memberToChangeRole?.profiles?.full_name}</span> trong project này.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {memberToChangeRole?.profiles ? getInitials(memberToChangeRole.profiles.full_name) : '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{memberToChangeRole?.profiles?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{memberToChangeRole?.profiles?.email}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Vai trò mới</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as 'member' | 'leader')}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4" />
                      Thành viên
                    </div>
                  </SelectItem>
                  <SelectItem value="leader">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-warning" />
                      Phó nhóm
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToChangeRole(null)}>
              Hủy
            </Button>
            <Button onClick={handleChangeRole} disabled={isChangingRole} className="min-w-28">
              {isChangingRole ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                'Xác nhận'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirmation */}
      <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa thành viên</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa <span className="font-semibold">{memberToDelete?.profiles?.full_name}</span> khỏi project này?
              <br /><br />
              <span className="text-muted-foreground">
                Lưu ý: Thao tác này chỉ xóa thành viên khỏi project, không xóa tài khoản khỏi hệ thống.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xóa khỏi project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Create New Member Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { setIsCreateDialogOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Tạo thành viên mới
            </DialogTitle>
            <DialogDescription>
              Tạo tài khoản mới và thêm vào project. Thành viên sẽ được gán mật khẩu mặc định là <strong>123456</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Full Name */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Họ và tên <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Nguyễn Văn A"
                value={newMemberFullName}
                onChange={(e) => setNewMemberFullName(e.target.value)}
                className="h-11"
              />
            </div>

            {/* Student ID */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mã số sinh viên (MSSV) <span className="text-destructive">*</span></Label>
              <Input
                placeholder="31241234567"
                value={newMemberStudentId}
                onChange={(e) => setNewMemberStudentId(e.target.value)}
                className="h-11"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Email <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                placeholder="example@gmail.com"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                className="h-11"
              />
            </div>

            {/* Role info - fixed for Phó nhóm */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Vai trò trong Project</Label>
              <div className="h-11 flex items-center px-3 bg-muted/50 rounded-md border border-border">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserCheck className="w-4 h-4" />
                  Thành viên
                </div>
              </div>
              {!isGroupCreator && (
                <p className="text-xs text-muted-foreground italic">
                  Vai trò mặc định: Member (Phó nhóm không có quyền thay đổi)
                </p>
              )}
            </div>

            {/* Info box */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
              <p className="text-amber-800 dark:text-amber-200">
                ⚠️ Thành viên mới sẽ cần đổi mật khẩu khi đăng nhập lần đầu.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Hủy
            </Button>
            <Button 
              onClick={handleCreateMember} 
              disabled={!newMemberFullName.trim() || !newMemberStudentId.trim() || !newMemberEmail.trim() || isCreatingMember} 
              className="min-w-28"
            >
              {isCreatingMember ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Tạo & Thêm vào Project
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
