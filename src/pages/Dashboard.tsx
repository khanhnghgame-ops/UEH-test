import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import UserAvatar from '@/components/UserAvatar';
import ProfileViewDialog from '@/components/ProfileViewDialog';
import DashboardProjectCard from '@/components/dashboard/DashboardProjectCard';
import { supabase } from '@/integrations/supabase/client';
import FirstTimeOnboarding from '@/components/FirstTimeOnboarding';
import {
  FolderKanban,
  ArrowRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { Group, Profile, GroupMember } from '@/types/database';

export default function Dashboard() {
  const { user, profile, mustChangePassword, refreshProfile, isLeader, isAdmin } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMembers, setGroupMembers] = useState<Map<string, GroupMember[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Profile view dialog state
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedProfileRole, setSelectedProfileRole] = useState<'admin' | 'leader' | 'member'>('member');

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      // Fetch groups where user is a member
      const { data: memberData, error: memberError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user!.id);

      if (memberError) throw memberError;

      const groupIds = memberData?.map((m) => m.group_id) || [];

      if (groupIds.length === 0) {
        setGroups([]);
        setGroupMembers(new Map());
        return;
      }

      const [{ data: groupsData, error: groupsError }, { data: membersData, error: membersError }] =
        await Promise.all([
          supabase
            .from('groups')
            .select('*')
            .in('id', groupIds)
            .order('created_at', { ascending: false }),
          // NOTE: avoid relational join here to keep fetching reliable (no FK required)
          supabase
            .from('group_members')
            .select('id, user_id, group_id, role, joined_at')
            .in('group_id', groupIds),
        ]);

      if (groupsError) throw groupsError;
      if (membersError) throw membersError;

      setGroups(groupsData || []);

      const userIds = Array.from(new Set((membersData || []).map((m) => m.user_id)));
      const { data: profilesData, error: profilesError } = userIds.length
        ? await supabase
            .from('profiles')
            .select('id, full_name, student_id, email, avatar_url, year_batch, major, phone, skills, bio')
            .in('id', userIds)
        : { data: [], error: null };

      if (profilesError) throw profilesError;

      const profilesMap = new Map((profilesData || []).map((p) => [p.id, p] as const));

      const membersMap = new Map<string, GroupMember[]>();
      (membersData || []).forEach((m: any) => {
        const existing = membersMap.get(m.group_id) || [];
        existing.push({ ...m, profiles: profilesMap.get(m.user_id) || null } as GroupMember);
        membersMap.set(m.group_id, existing);
      });

      setGroupMembers(membersMap);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMemberClick = (member: GroupMember) => {
    if (member.profiles) {
      setSelectedProfile(member.profiles as Profile);
      setSelectedProfileRole(member.role as 'admin' | 'leader' | 'member');
      setProfileDialogOpen(true);
    }
  };

  const getRoleBadge = () => {
    if (isAdmin) return <Badge className="bg-destructive/20 text-destructive">Admin</Badge>;
    if (isLeader) return <Badge className="bg-warning/20 text-warning">Leader</Badge>;
    return <Badge variant="secondary">Member</Badge>;
  };

  if (isLoading) {
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
      {/* First-time onboarding: Password change + Avatar upload */}
      {user && profile && mustChangePassword && (
        <FirstTimeOnboarding
          open={mustChangePassword}
          userId={user.id}
          userFullName={profile.full_name}
          userEmail={profile.email}
          userStudentId={profile.student_id}
          onComplete={refreshProfile}
        />
      )}

      <div className="space-y-8">
        {/* Welcome Section - More Prominent */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-8 text-primary-foreground">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative flex items-center gap-6">
            <UserAvatar
              src={profile?.avatar_url}
              name={profile?.full_name}
              size="xl"
              className="border-4 border-white/20 shadow-xl"
            />
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="w-6 h-6 text-accent" />
                <span className="text-white/80">Xin chào,</span>
              </div>
              <h1 className="text-3xl font-bold mb-2">{profile?.full_name}</h1>
              <div className="flex items-center gap-3">
                <span className="text-white/70">MSSV: {profile?.student_id}</span>
                {getRoleBadge()}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overview - Minimal */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FolderKanban className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-primary">{groups.length}</p>
                  <p className="text-sm text-muted-foreground">Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Projects with Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-xl">Projects của tôi</CardTitle>
              <CardDescription>Các dự án bạn đang tham gia</CardDescription>
            </div>
            <Link to="/groups">
              <Button variant="outline" className="gap-2">
                Xem tất cả
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderKanban className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-1">Bạn chưa tham gia project nào</p>
                <p className="text-sm">Liên hệ Leader để được thêm vào project</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group) => {
                  const members = groupMembers.get(group.id) || [];
                  return (
                    <DashboardProjectCard
                      key={group.id}
                      group={group}
                      members={members}
                      canViewMembers={isLeader || isAdmin}
                      onMemberClick={handleMemberClick}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profile View Dialog */}
      <ProfileViewDialog
        profile={selectedProfile}
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        role={selectedProfileRole}
      />
    </DashboardLayout>
  );
}

