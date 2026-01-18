import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import UserAvatar from '@/components/UserAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import ProfileViewDialog from '@/components/ProfileViewDialog';
import UserPresenceIndicator from '@/components/UserPresenceIndicator';
import { useUserPresence, PresenceStatus } from '@/hooks/useUserPresence';

import {
  Loader2,
  Users,
  UserCheck,
  UserMinus,
  UserCog,
  ClipboardList,
  Check,
  X,
  ListChecks,
  BarChart3,
  LayoutDashboard,
  History,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import type { Profile } from '@/types/database';

interface MemberRow {
  id: string;
  userId: string;
  groupId: string;
  role: 'admin' | 'leader' | 'member';
  joinedAt: string;
  fullName?: string;
  studentId?: string;
  email?: string;
  groupName?: string;
  avatarUrl?: string;
}

interface PendingApprovalRow {
  id: string;
  userId: string;
  groupId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  userName?: string;
  studentId?: string;
  email?: string;
  groupName?: string;
}

// Global presence hook for admin page - tracks presence across multiple groups
function useGlobalPresence(groupIds: string[]) {
  const { user } = useAuth();
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceStatus>>(new Map());
  
  useEffect(() => {
    if (!user || groupIds.length === 0) return;
    
    const channels: ReturnType<typeof supabase.channel>[] = [];
    const mergedPresence = new Map<string, PresenceStatus>();
    
    // Subscribe to presence for each group
    groupIds.forEach((groupId) => {
      const channelName = `presence:${groupId}`;
      const channel = supabase.channel(channelName, {
        config: { presence: { key: user.id } },
      });
      
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<{ status: PresenceStatus; userId: string }>();
          Object.values(state).forEach((presences) => {
            if (presences && presences.length > 0) {
              const p = presences[presences.length - 1];
              if (p.userId) {
                // Only update if the new status is "better" (online > idle > offline)
                const current = mergedPresence.get(p.userId);
                if (!current || p.status === 'online' || (p.status === 'idle' && current === 'offline')) {
                  mergedPresence.set(p.userId, p.status);
                }
              }
            }
          });
          setPresenceMap(new Map(mergedPresence));
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          if (newPresences?.length > 0) {
            const p = newPresences[0];
            if (p.userId) {
              mergedPresence.set(p.userId, p.status || 'online');
              setPresenceMap(new Map(mergedPresence));
            }
          }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          if (leftPresences?.length > 0) {
            const p = leftPresences[0];
            if (p.userId) {
              mergedPresence.set(p.userId, 'offline');
              setPresenceMap(new Map(mergedPresence));
            }
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              status: 'online',
              lastSeen: new Date().toISOString(),
              userId: user.id,
            });
          }
        });
      
      channels.push(channel);
    });
    
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [user, groupIds.join(',')]);
  
  return {
    getPresenceStatus: (userId: string): PresenceStatus => presenceMap.get(userId) || 'offline',
  };
}

export default function AdminUsers() {
  const { user, isAdmin, isLeader } = useAuth();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  const [approvals, setApprovals] = useState<PendingApprovalRow[]>([]);
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(true);

  // Profile view dialog state
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  
  // Extract unique group IDs from members for presence tracking
  const uniqueGroupIds = useMemo(() => {
    return Array.from(new Set(members.map(m => m.groupId)));
  }, [members]);
  
  const { getPresenceStatus } = useGlobalPresence(uniqueGroupIds);

  const canAccess = isAdmin || isLeader;

  const location = useLocation();
  const path = location.pathname;

  const currentSection = useMemo(() => {
    if (path.endsWith('/members')) return 'members';
    if (path.endsWith('/approvals')) return 'approvals';
    if (path.endsWith('/tasks')) return 'tasks';
    if (path.endsWith('/scores')) return 'scores';
    if (path.endsWith('/groups')) return 'groups';
    if (path.endsWith('/accounts')) return 'accounts';
    if (path.endsWith('/activity')) return 'activity';
    return 'members';
  }, [path]);

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  // ====== LOAD DATA ======
  useEffect(() => {
    if (!canAccess) return;
    fetchProfiles();
    fetchMembers();
    fetchApprovals();
  }, [canAccess]);

  const fetchProfiles = async () => {
    setIsLoadingProfiles(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Lỗi tải danh sách tài khoản', description: error.message, variant: 'destructive' });
    } else if (data) {
      setProfiles(data as Profile[]);
    }
    setIsLoadingProfiles(false);
  };

  const fetchMembers = async () => {
    setIsLoadingMembers(true);

    const { data: gmData, error: gmError } = await supabase
      .from('group_members')
      .select('id, group_id, user_id, role, joined_at');

    if (gmError) {
      toast({ title: 'Lỗi tải danh sách thành viên nhóm', description: gmError.message, variant: 'destructive' });
      setIsLoadingMembers(false);
      return;
    }

    if (!gmData || gmData.length === 0) {
      setMembers([]);
      setIsLoadingMembers(false);
      return;
    }

    const userIds = Array.from(new Set(gmData.map((m) => m.user_id)));
    const groupIds = Array.from(new Set(gmData.map((m) => m.group_id)));

    const [{ data: profileData }, { data: groupData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, student_id, email, avatar_url, year_batch, major, phone, skills, bio').in('id', userIds),
      supabase.from('groups').select('id, name').in('id', groupIds),
    ]);

    const profilesMap = new Map(
      (profileData || []).map((p) => [p.id, { fullName: p.full_name, studentId: p.student_id, email: p.email, avatarUrl: p.avatar_url }])
    );

    const groupsMap = new Map((groupData || []).map((g) => [g.id, g.name as string]));

    const mapped: MemberRow[] = gmData.map((m) => {
      const p = profilesMap.get(m.user_id);
      return {
        id: m.id,
        userId: m.user_id,
        groupId: m.group_id,
        role: m.role,
        joinedAt: m.joined_at,
        fullName: p?.fullName,
        studentId: p?.studentId,
        email: p?.email,
        groupName: groupsMap.get(m.group_id) || 'Không rõ nhóm',
        avatarUrl: p?.avatarUrl,
      };
    });

    setMembers(mapped);
    setIsLoadingMembers(false);
  };

  const fetchApprovals = async () => {
    setIsLoadingApprovals(true);

    const { data: paData, error: paError } = await supabase
      .from('pending_approvals')
      .select('id, user_id, group_id, status, created_at');

    if (paError) {
      toast({ title: 'Lỗi tải yêu cầu tham gia', description: paError.message, variant: 'destructive' });
      setIsLoadingApprovals(false);
      return;
    }

    if (!paData || paData.length === 0) {
      setApprovals([]);
      setIsLoadingApprovals(false);
      return;
    }

    const userIds = Array.from(new Set(paData.map((a) => a.user_id)));
    const groupIds = Array.from(new Set(paData.map((a) => a.group_id)));

    const [{ data: profileData }, { data: groupData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, student_id, email').in('id', userIds),
      supabase.from('groups').select('id, name').in('id', groupIds),
    ]);

    const profilesMap = new Map(
      (profileData || []).map((p) => [p.id, { fullName: p.full_name, studentId: p.student_id, email: p.email }])
    );
    const groupsMap = new Map((groupData || []).map((g) => [g.id, g.name as string]));

    const mapped: PendingApprovalRow[] = paData.map((a) => {
      const p = profilesMap.get(a.user_id);
      return {
        id: a.id,
        userId: a.user_id,
        groupId: a.group_id,
        status: a.status,
        createdAt: a.created_at,
        userName: p?.fullName,
        studentId: p?.studentId,
        email: p?.email,
        groupName: groupsMap.get(a.group_id) || 'Không rõ nhóm',
      };
    });

    setApprovals(mapped);
    setIsLoadingApprovals(false);
  };

  // ====== ACTIONS ======
  const handleApproveUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', userId);
    if (error) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Đã duyệt', description: 'Tài khoản đã được kích hoạt' });
    fetchProfiles();
  };

  const handleRejectUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ is_approved: false }).eq('id', userId);
    if (error) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Đã vô hiệu hóa', description: 'Tài khoản đã bị khoá' });
    fetchProfiles();
  };

  const handleGrantLeader = async (userId: string) => {
    const { error } = await supabase.from('user_roles').upsert({ user_id: userId, role: 'leader' });
    if (error) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Thành công', description: 'Đã cấp quyền Leader' });
  };

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await supabase.from('group_members').delete().eq('id', memberId);
    if (error) {
      toast({ title: 'Lỗi xoá thành viên', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Đã xoá thành viên khỏi nhóm' });
    fetchMembers();
  };

  const handleApproveJoin = async (approval: PendingApprovalRow) => {
    const { error: statusError } = await supabase
      .from('pending_approvals')
      .update({ status: 'approved' })
      .eq('id', approval.id);

    if (statusError) {
      toast({ title: 'Lỗi cập nhật trạng thái', description: statusError.message, variant: 'destructive' });
      return;
    }

    const { error: gmError } = await supabase.from('group_members').insert({
      group_id: approval.groupId,
      user_id: approval.userId,
      role: 'member',
    });

    if (gmError) {
      toast({ title: 'Lỗi thêm thành viên vào nhóm', description: gmError.message, variant: 'destructive' });
      return;
    }

    // Khi Leader duyệt tham gia nhóm, coi như tài khoản đã được kích hoạt
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', approval.userId);

    if (profileError) {
      toast({ title: 'Thêm vào nhóm thành công nhưng lỗi khi cập nhật trạng thái tài khoản', description: profileError.message, variant: 'destructive' });
    }

    toast({ title: 'Đã duyệt yêu cầu tham gia', description: 'Thành viên đã được thêm vào nhóm và có thể sử dụng hệ thống' });
    fetchApprovals();
    fetchMembers();
  };

  const handleRejectJoin = async (approvalId: string) => {
    const { error } = await supabase
      .from('pending_approvals')
      .update({ status: 'rejected' })
      .eq('id', approvalId);

    if (error) {
      toast({ title: 'Lỗi cập nhật trạng thái', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Đã từ chối yêu cầu tham gia' });
    fetchApprovals();
  };

  const handleViewProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      toast({ title: 'Lỗi', description: 'Không thể tải thông tin hồ sơ', variant: 'destructive' });
      return;
    }

    setSelectedProfile(data as Profile);
    setProfileDialogOpen(true);
  };

  // ====== DERIVED ======
  const pendingUsers = useMemo(() => profiles.filter((u) => !u.is_approved), [profiles]);
  const approvedUsers = useMemo(() => profiles.filter((u) => u.is_approved), [profiles]);

  if (!canAccess) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldCheck className="w-10 h-10 text-muted-foreground" />
          <h1 className="text-2xl font-heading font-semibold">Không có quyền truy cập</h1>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            Trang này chỉ dành cho Admin và các Leader nhóm. Nếu bạn nghĩ đây là lỗi, vui lòng liên hệ Leader hoặc Admin.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const isLoadingAny = isLoadingProfiles && isLoadingMembers && isLoadingApprovals;

  if (isLoadingAny) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
              <LayoutDashboard className="w-7 h-7 text-primary" />
              {currentSection === 'members' && 'Thành viên nhóm'}
              {currentSection === 'approvals' && 'Yêu cầu tham gia nhóm'}
              {currentSection === 'tasks' && 'Task & phân công'}
              {currentSection === 'scores' && 'Điểm & giai đoạn'}
              {currentSection === 'groups' && 'Nhóm học phần'}
              {currentSection === 'accounts' && 'Tài khoản (Admin)'}
              {currentSection === 'activity' && 'Nhật ký hoạt động'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {currentSection === 'members' && 'Xem và quản lý thành viên trong các nhóm bạn phụ trách.'}
              {currentSection === 'approvals' && 'Duyệt hoặc từ chối các yêu cầu tham gia nhóm.'}
              {currentSection === 'tasks' && 'Điều hướng nhanh tới các trang quản lý task hiện có.'}
              {currentSection === 'scores' && 'Thông tin điểm số theo task và giai đoạn (sẽ mở rộng sau).'}
              {currentSection === 'groups' && 'Liên kết tới trang quản lý nhóm học phần chi tiết.'}
              {currentSection === 'accounts' && 'Dành cho Admin: duyệt tài khoản, khoá và cấp quyền Leader.'}
              {currentSection === 'activity' && 'Tổng quan kế hoạch cho phần nhật ký hoạt động.'}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>
              Vai trò hiện tại:{' '}
              <Badge variant="outline">{isAdmin ? 'Admin' : 'Leader'}</Badge>
            </p>
            {user?.email && <p className="mt-1">{user.email}</p>}
          </div>
        </div>

        {currentSection === 'members' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Thành viên theo nhóm
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có thành viên nào trong các nhóm bạn quản lý.</p>
              ) : (
                <ScrollArea className="max-h-[480px] pr-3">
                  <div className="space-y-3">
                    {members.map((m) => {
                      const status = getPresenceStatus(m.userId);
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-3 p-3 border rounded-lg bg-card/40 hover:bg-card/60 cursor-pointer transition-colors"
                          onClick={() => handleViewProfile(m.userId)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <UserAvatar 
                                src={m.avatarUrl}
                                name={m.fullName}
                                size="md"
                              />
                              <div className="absolute -bottom-0.5 -right-0.5">
                                <UserPresenceIndicator status={status} size="sm" />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">
                                  {m.fullName || 'Không rõ tên'}
                                </p>
                                <Badge variant="outline" className="text-[11px]">
                                  {m.role === 'admin'
                                    ? 'Admin'
                                    : m.role === 'leader'
                                      ? 'Leader'
                                      : 'Member'}
                                </Badge>
                                <UserPresenceIndicator status={status} size="xs" showLabel />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {m.studentId && <span>{m.studentId} · </span>}
                                {m.email}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Nhóm: <span className="font-medium">{m.groupName}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              onClick={(e) => { e.stopPropagation(); handleViewProfile(m.userId); }}
                            >
                              <Eye className="w-4 h-4 mr-1" /> Xem hồ sơ
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={(e) => { e.stopPropagation(); handleRemoveMember(m.id); }}
                            >
                              <UserMinus className="w-4 h-4 mr-1" /> Xoá khỏi nhóm
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}

        {currentSection === 'approvals' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-primary" />
                Yêu cầu tham gia nhóm
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingApprovals ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Hiện không có yêu cầu tham gia nào.</p>
              ) : (
                <ScrollArea className="max-h-[480px] pr-3">
                  <div className="space-y-3">
                    {approvals.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-3 p-3 border rounded-lg bg-card/40"
                      >
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">
                            {a.userName || 'Không rõ tên'}
                            <span className="text-xs text-muted-foreground ml-2">
                              {a.studentId && `${a.studentId} · `}
                              {a.email}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Nhóm: <span className="font-medium">{a.groupName}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Trạng thái hiện tại:{' '}
                            <Badge
                              variant={
                                a.status === 'pending'
                                  ? 'outline'
                                  : a.status === 'approved'
                                    ? 'default'
                                    : 'destructive'
                              }
                              className="text-[10px] uppercase tracking-wide"
                            >
                              {a.status}
                            </Badge>
                          </p>
                        </div>
                        {a.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="text-xs"
                              onClick={() => handleApproveJoin(a)}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Duyệt
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs"
                              onClick={() => handleRejectJoin(a.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}

        {currentSection === 'tasks' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quản lý task theo nhóm</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Sử dụng trang <span className="font-medium">Nhóm &amp; Task</span> để tạo, chỉnh sửa, xoá task và
                  phân công thành viên.
                </p>
                <p>
                  Tại đây Leader có thể chia nhỏ công việc, đặt deadline và theo dõi trạng thái từng task.
                </p>
                <Button asChild size="sm" className="mt-2">
                  <a href="/groups">Mở trang Nhóm &amp; Task</a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Task của riêng từng thành viên</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Trang <span className="font-medium">Task của tôi</span> giúp từng sinh viên xem rõ trách nhiệm
                  của mình.
                </p>
                <Button asChild size="sm" className="mt-2">
                  <a href="/tasks">Mở trang Task của tôi</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {currentSection === 'scores' && (
          <Card>
            <CardHeader>
              <CardTitle>Điểm theo task & giai đoạn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Hệ thống đã lưu điểm chi tiết trong các bảng{' '}
                <span className="font-mono text-xs">task_scores</span> và{' '}
                <span className="font-mono text-xs">member_stage_scores</span>.
              </p>
              <p>
                Trong các bản cập nhật tiếp theo, khu vực này sẽ hiển thị bảng điểm và biểu đồ theo giai đoạn cho từng
                thành viên.
              </p>
            </CardContent>
          </Card>
        )}

        {currentSection === 'groups' && (
          <Card>
            <CardHeader>
              <CardTitle>Quản lý nhóm học phần</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Tạo, chỉnh sửa thông tin nhóm (tên nhóm, mã lớp, giảng viên, link Zalo…) tại trang{' '}
                <span className="font-medium">Nhóm</span>.
              </p>
              <Button asChild size="sm" className="mt-2">
                <a href="/groups">Mở trang Nhóm</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {currentSection === 'accounts' && (
          !isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Chỉ dành cho Admin</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Chức năng quản lý tài khoản (duyệt, khoá, cấp Leader) chỉ khả dụng với tài khoản Admin.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {pendingUsers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Chờ duyệt ({pendingUsers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pendingUsers.map((u) => (
                      <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <UserAvatar 
                            src={u.avatar_url}
                            name={u.full_name}
                            size="md"
                          />
                          <div>
                            <p className="font-medium">{u.full_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {u.student_id} | {u.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApproveUser(u.id)}>
                            <Check className="w-4 h-4 mr-1" /> Duyệt
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleRejectUser(u.id)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>
                    Đã duyệt ({approvedUsers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {approvedUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                          <UserAvatar 
                            src={u.avatar_url}
                            name={u.full_name}
                            size="md"
                          />
                        <div>
                          <p className="font-medium">{u.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {u.student_id} | {u.email}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleGrantLeader(u.id)}>
                        <UserCog className="w-4 h-4 mr-1" /> Cấp Leader
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )
        )}

        {currentSection === 'activity' && (
          <Card>
            <CardHeader>
              <CardTitle>Nhật ký hoạt động (sắp ra mắt)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Khu vực này sẽ hiển thị các hành động gần đây như: tạo task, xoá thành viên, duyệt yêu cầu tham gia, v.v.
              </p>
              <p>
                Hiện tại bạn có thể kiểm tra lịch sử thay đổi thông qua các bảng dữ liệu trong backend hoặc sử dụng
                báo cáo điểm/tiến độ.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Profile View Dialog */}
      <ProfileViewDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        profile={selectedProfile}
        role={selectedProfile ? (profiles.find(p => p.id === selectedProfile.id) ? 'member' : 'member') : 'member'}
      />
    </DashboardLayout>
  );
}
