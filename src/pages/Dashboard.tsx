import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import {
  FolderKanban,
  ArrowRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { Group } from '@/types/database';

export default function Dashboard() {
  const { user, profile, mustChangePassword, refreshProfile, isLeader, isAdmin } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      // Fetch groups where user is a member
      const { data: memberData } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user!.id);

      const groupIds = memberData?.map(m => m.group_id) || [];

      if (groupIds.length > 0) {
        const { data: groupsData } = await supabase
          .from('groups')
          .select('*')
          .in('id', groupIds)
          .order('created_at', { ascending: false });

        if (groupsData) {
          setGroups(groupsData);
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
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
      {/* Password change dialog for first login */}
      {user && mustChangePassword && (
        <ChangePasswordDialog 
          open={mustChangePassword} 
          userId={user.id} 
          onPasswordChanged={refreshProfile} 
        />
      )}
      
      <div className="space-y-8">
        {/* Welcome Section - More Prominent */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-8 text-primary-foreground">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative flex items-center gap-6">
            <Avatar className="h-20 w-20 border-4 border-white/20 shadow-xl">
              <AvatarFallback className="bg-accent text-accent-foreground text-2xl font-bold">
                {profile ? getInitials(profile.full_name) : '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="w-6 h-6 text-accent" />
                <span className="text-white/80">Xin chào,</span>
              </div>
              <h1 className="text-3xl font-bold mb-2">
                {profile?.full_name}
              </h1>
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

        {/* My Projects */}
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
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((group) => (
                  <Link
                    key={group.id}
                    to={`/groups/${group.id}`}
                    className="group flex flex-col p-5 rounded-xl border bg-card hover:shadow-lg hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                        <FolderKanban className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                          {group.name}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate mt-1">
                          {group.description || 'Không có mô tả'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Tạo ngày {new Date(group.created_at).toLocaleDateString('vi-VN')}
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
