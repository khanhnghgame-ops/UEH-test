import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import UserAvatar from '@/components/UserAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Loader2, 
  UserPlus, 
  Users, 
  Trash2, 
  Key, 
  Mail, 
  Hash, 
  User, 
  Pencil, 
  Search,
  MoreVertical,
  Shield,
  UserCheck,
  Info,
  Download
} from 'lucide-react';
import type { Profile } from '@/types/database';
import { exportMembersToExcel, getRoleDisplayName } from '@/lib/excelExport';

export default function MemberManagement() {
  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading, profile: currentProfile } = useAuth();
  const { toast } = useToast();
  
  const [members, setMembers] = useState<Profile[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form state - New member
  const [newEmail, setNewEmail] = useState('');
  const [newStudentId, setNewStudentId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  
  // Password dialog
  const [updatePassword, setUpdatePassword] = useState('');
  
  // Edit form state
  const [editFullName, setEditFullName] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Check if a member has admin role in system
  const isMemberAdmin = (memberId: string): boolean => {
    const roles = memberRoles[memberId] || [];
    return roles.includes('admin');
  };

  // Check if current user can manage the member (only admin can access this page)
  const canManageMember = (memberId: string): boolean => {
    if (memberId === user?.id) return false; // Cannot manage self
    return isAdmin; // Only admin can manage members
  };

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/dashboard');
      return;
    }
    if (isAdmin) {
      fetchMembers();
    }
  }, [authLoading, isAdmin, navigate]);

  const fetchMembers = async () => {
    setIsLoading(true);
    
    // Fetch all approved profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_approved', true)
      .order('created_at', { ascending: false });
    
    if (profilesError) {
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách thành viên',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }
    
    setMembers(profilesData || []);
    
    // Fetch user roles (only admin can access this page)
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role');
    
    if (rolesData) {
      const rolesMap: Record<string, string[]> = {};
      rolesData.forEach((r) => {
        if (!rolesMap[r.user_id]) {
          rolesMap[r.user_id] = [];
        }
        rolesMap[r.user_id].push(r.role);
      });
      setMemberRoles(rolesMap);
    }
    
    setIsLoading(false);
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEmail || !newStudentId || !newFullName) {
      toast({
        title: 'Thiếu thông tin',
        description: 'Vui lòng điền đầy đủ thông tin',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: {
        action: 'create_member',
        email: newEmail,
        student_id: newStudentId,
        full_name: newFullName,
      }
    });

    setIsCreating(false);

    if (error || data?.error) {
      toast({
        title: 'Tạo thành viên thất bại',
        description: data?.error || error?.message || 'Có lỗi xảy ra',
        variant: 'destructive',
      });
      return;
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: user!.id,
      user_name: currentProfile?.full_name || user?.email || 'Unknown',
      action: 'CREATE_SYSTEM_MEMBER',
      action_type: 'member',
      description: `Tạo tài khoản hệ thống cho ${newFullName}`,
    });

    toast({
      title: 'Tạo thành viên thành công',
      description: `Đã tạo tài khoản cho ${newFullName}. Mật khẩu mặc định: 123456`,
    });

    // Reset form
    setNewEmail('');
    setNewStudentId('');
    setNewFullName('');
    setIsDialogOpen(false);
    fetchMembers();
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedMember || !updatePassword) return;

    if (updatePassword.length < 6) {
      toast({
        title: 'Mật khẩu quá ngắn',
        description: 'Mật khẩu phải có ít nhất 6 ký tự',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: {
        action: 'update_password',
        user_id: selectedMember.id,
        password: updatePassword,
        requester_id: user?.id,
      }
    });

    setIsCreating(false);

    if (error || data?.error) {
      toast({
        title: 'Cập nhật mật khẩu thất bại',
        description: data?.error || error?.message || 'Có lỗi xảy ra',
        variant: 'destructive',
      });
      return;
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: user!.id,
      user_name: currentProfile?.full_name || user?.email || 'Unknown',
      action: 'CHANGE_MEMBER_PASSWORD',
      action_type: 'member',
      description: `Đổi mật khẩu cho ${selectedMember.full_name}`,
    });

    toast({
      title: 'Cập nhật thành công',
      description: `Đã đổi mật khẩu cho ${selectedMember.full_name}`,
    });

    setUpdatePassword('');
    setSelectedMember(null);
    setIsPasswordDialogOpen(false);
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedMember) return;

    if (!editFullName.trim() || !editStudentId.trim()) {
      toast({
        title: 'Thiếu thông tin',
        description: 'Vui lòng điền đầy đủ thông tin',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);

    // Update profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: editFullName.trim(),
        student_id: editStudentId.trim(),
      })
      .eq('id', selectedMember.id);

    // Update email if changed
    if (editEmail.trim() !== selectedMember.email) {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'update_email',
          user_id: selectedMember.id,
          email: editEmail.trim(),
        }
      });

      if (error || data?.error) {
        setIsCreating(false);
        toast({
          title: 'Cập nhật email thất bại',
          description: data?.error || error?.message || 'Có lỗi xảy ra',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsCreating(false);

    if (profileError) {
      toast({
        title: 'Cập nhật thất bại',
        description: profileError.message || 'Có lỗi xảy ra',
        variant: 'destructive',
      });
      return;
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: user!.id,
      user_name: currentProfile?.full_name || user?.email || 'Unknown',
      action: 'EDIT_SYSTEM_MEMBER',
      action_type: 'member',
      description: `Cập nhật thông tin tài khoản ${editFullName}`,
    });

    toast({
      title: 'Cập nhật thành công',
      description: `Đã cập nhật thông tin cho ${editFullName}`,
    });

    setSelectedMember(null);
    setIsEditDialogOpen(false);
    fetchMembers();
  };

  const handleDeleteMember = async () => {
    if (!selectedMember) return;

    setIsCreating(true);

    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: {
        action: 'delete_user',
        user_id: selectedMember.id,
        requester_id: user?.id,
      }
    });

    setIsCreating(false);

    if (error || data?.error) {
      toast({
        title: 'Xóa thành viên thất bại',
        description: data?.error || error?.message || 'Có lỗi xảy ra',
        variant: 'destructive',
      });
      return;
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: user!.id,
      user_name: currentProfile?.full_name || user?.email || 'Unknown',
      action: 'DELETE_SYSTEM_MEMBER',
      action_type: 'member',
      description: `Xóa tài khoản ${selectedMember.full_name} khỏi hệ thống`,
    });

    toast({
      title: 'Xóa thành công',
      description: `Đã xóa tài khoản ${selectedMember.full_name} khỏi hệ thống`,
    });

    setSelectedMember(null);
    setIsDeleteDialogOpen(false);
    fetchMembers();
  };

  const openEditDialog = (member: Profile) => {
    setSelectedMember(member);
    setEditFullName(member.full_name);
    setEditStudentId(member.student_id);
    setEditEmail(member.email);
    setIsEditDialogOpen(true);
  };

  // Filter members by search
  const filteredMembers = members.filter(m => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(query) ||
      m.student_id.toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query)
    );
  });

  if (authLoading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold">Thành viên hệ thống</h1>
            <p className="text-muted-foreground">
              Quản lý tài khoản thành viên trong hệ thống. Thêm thành viên vào project tại trang chi tiết project.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              className="font-semibold gap-2"
              onClick={() => {
                const exportData = filteredMembers.map(m => ({
                  fullName: m.full_name,
                  studentId: m.student_id,
                  email: m.email,
                  role: isMemberAdmin(m.id) ? 'Admin' : (memberRoles[m.id]?.includes('leader') ? 'Leader' : 'Thành viên')
                }));
                exportMembersToExcel(exportData, 'danh-sach-thanh-vien-he-thong');
              }}
            >
              <Download className="w-4 h-4" />
              Xuất Excel
            </Button>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="font-semibold gap-2">
                  <UserPlus className="w-4 h-4" />
                  Tạo tài khoản mới
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  Tạo tài khoản thành viên
                </DialogTitle>
                <DialogDescription>
                  Tạo tài khoản mới cho thành viên. Mật khẩu mặc định là "123456", thành viên sẽ được yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateMember} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Họ và tên <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      placeholder="Nguyễn Văn A"
                      className="pl-10 h-11"
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studentId">Mã số sinh viên <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="studentId"
                      placeholder="31241234567"
                      className="pl-10 h-11"
                      value={newStudentId}
                      onChange={(e) => setNewStudentId(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@ueh.edu.vn"
                      className="pl-10 h-11"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg flex items-start gap-2">
                  <Key className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    Mật khẩu mặc định: <span className="font-mono font-bold">123456</span>
                    <br />
                    <span className="text-xs">Thành viên sẽ đổi mật khẩu khi đăng nhập lần đầu</span>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Hủy
                  </Button>
                  <Button type="submit" disabled={isCreating} className="min-w-28">
                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tạo tài khoản'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Info Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Cách hoạt động</p>
              <p className="text-muted-foreground mt-1">
                • Tạo tài khoản tại đây để thêm thành viên vào hệ thống (mặc định role = Member)<br />
                • Thêm thành viên vào project tại trang chi tiết project và gán vai trò (Member/Leader) riêng cho project đó<br />
                • Một tài khoản có thể có vai trò khác nhau ở các project khác nhau
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên, MSSV hoặc email..."
            className="pl-10 h-11"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Members List */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Danh sách thành viên ({filteredMembers.length})
            </CardTitle>
            <CardDescription>
              Tất cả thành viên đã được phê duyệt trong hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredMembers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">
                  {searchQuery ? 'Không tìm thấy thành viên' : 'Chưa có thành viên nào'}
                </p>
                {!searchQuery && (
                  <p className="text-sm mt-1">Bấm "Tạo tài khoản mới" để bắt đầu</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMembers.map((member) => {
                  const canManage = canManageMember(member.id);
                  const isAdminMember = isMemberAdmin(member.id);
                  
                  return (
                    <div key={member.id} className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                      <UserAvatar 
                        src={member.avatar_url}
                        name={member.full_name}
                        size="lg"
                        className="border-2 border-background"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{member.full_name}</p>
                          {isAdminMember && (
                            <Badge className="bg-destructive/10 text-destructive text-xs gap-1">
                              <Shield className="w-3 h-3" />
                              Admin
                            </Badge>
                          )}
                          {member.id === user?.id && (
                            <Badge variant="outline" className="text-xs">Bạn</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{member.student_id}</span>
                          <span>•</span>
                          <span className="truncate">{member.email}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Tạo: {new Date(member.created_at).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(member)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Chỉnh sửa thông tin
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedMember(member);
                              setIsPasswordDialogOpen(true);
                            }}>
                              <Key className="w-4 h-4 mr-2" />
                              Đổi mật khẩu
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedMember(member);
                                setIsDeleteDialogOpen(true);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Xóa tài khoản
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
        setIsPasswordDialogOpen(open);
        if (!open) {
          setUpdatePassword('');
          setSelectedMember(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Đổi mật khẩu
            </DialogTitle>
            <DialogDescription>
              Đặt mật khẩu mới cho <span className="font-medium">{selectedMember?.full_name}</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Mật khẩu mới <span className="text-destructive">*</span></Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                className="h-11"
                value={updatePassword}
                onChange={(e) => setUpdatePassword(e.target.value)}
                minLength={6}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={isCreating || updatePassword.length < 6} className="min-w-28">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Đổi mật khẩu'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) setSelectedMember(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Chỉnh sửa thông tin
            </DialogTitle>
            <DialogDescription>
              Cập nhật thông tin tài khoản của <span className="font-medium">{selectedMember?.full_name}</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditMember} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editFullName">Họ và tên <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="editFullName"
                  className="pl-10 h-11"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editStudentId">Mã số sinh viên <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="editStudentId"
                  className="pl-10 h-11"
                  value={editStudentId}
                  onChange={(e) => setEditStudentId(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="editEmail"
                  type="email"
                  className="pl-10 h-11"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={isCreating} className="min-w-28">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu thay đổi'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setIsDeleteDialogOpen(open);
        if (!open) setSelectedMember(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa tài khoản</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa tài khoản <span className="font-semibold">{selectedMember?.full_name}</span> khỏi hệ thống?
              <br /><br />
              <span className="text-destructive font-medium">
                Cảnh báo: Thao tác này sẽ xóa vĩnh viễn tài khoản và tất cả dữ liệu liên quan. Không thể hoàn tác.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreating}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isCreating}
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xóa tài khoản'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
