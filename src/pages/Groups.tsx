import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  FolderKanban,
  Plus,
  Users,
  ArrowRight,
  Loader2,
  Crown,
} from 'lucide-react';
import type { Group, GroupMember } from '@/types/database';

interface GroupWithMembers extends Group {
  memberCount: number;
  myRole: string;
}

export default function Groups() {
  const { user, isLeader } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');

  useEffect(() => {
    fetchGroups();
  }, [user]);

  const fetchGroups = async () => {
    if (!user) return;

    try {
      // Get groups where user is a member
      const { data: memberData } = await supabase
        .from('group_members')
        .select('group_id, role')
        .eq('user_id', user.id);

      if (!memberData || memberData.length === 0) {
        setGroups([]);
        setIsLoading(false);
        return;
      }

      const groupIds = memberData.map((m) => m.group_id);
      const roleMap = new Map(memberData.map((m) => [m.group_id, m.role]));

      // Get group details
      const { data: groupsData } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds)
        .order('created_at', { ascending: false });

      if (groupsData) {
        // Get member counts
        const { data: countsData } = await supabase
          .from('group_members')
          .select('group_id')
          .in('group_id', groupIds);

        const countMap = new Map<string, number>();
        countsData?.forEach((c) => {
          countMap.set(c.group_id, (countMap.get(c.group_id) || 0) + 1);
        });

        const groupsWithMembers: GroupWithMembers[] = groupsData.map((g) => ({
          ...g,
          memberCount: countMap.get(g.id) || 0,
          myRole: roleMap.get(g.id) || 'member',
        }));

        setGroups(groupsWithMembers);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập tên nhóm',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);

    try {
      // Create group
      const { data: newGroup, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: newGroupName.trim(),
          description: newGroupDescription.trim() || null,
          created_by: user!.id,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as leader
      const { error: memberError } = await supabase.from('group_members').insert({
        group_id: newGroup.id,
        user_id: user!.id,
        role: 'leader',
      });

      if (memberError) throw memberError;

      toast({
        title: 'Thành công',
        description: 'Đã tạo nhóm mới',
      });

      setIsDialogOpen(false);
      setNewGroupName('');
      setNewGroupDescription('');
      fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể tạo nhóm',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-destructive/10 text-destructive">Admin</Badge>;
      case 'leader':
        return <Badge className="bg-warning/10 text-warning">Leader</Badge>;
      default:
        return <Badge variant="secondary">Member</Badge>;
    }
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Nhóm của tôi</h1>
            <p className="text-muted-foreground mt-1">
              Quản lý các nhóm và dự án bạn tham gia
            </p>
          </div>
          {isLeader && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Tạo nhóm mới
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tạo nhóm mới</DialogTitle>
                  <DialogDescription>
                    Tạo một nhóm mới để quản lý công việc cùng các thành viên
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="group-name">Tên nhóm</Label>
                    <Input
                      id="group-name"
                      placeholder="VD: Đồ án môn học CNTT"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="group-description">Mô tả (tùy chọn)</Label>
                    <Textarea
                      id="group-description"
                      placeholder="Mô tả về nhóm..."
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Hủy
                  </Button>
                  <Button onClick={handleCreateGroup} disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Đang tạo...
                      </>
                    ) : (
                      'Tạo nhóm'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Groups List */}
        {groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderKanban className="w-16 h-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">Chưa có nhóm nào</h3>
              <p className="text-muted-foreground text-center max-w-md">
                {isLeader
                  ? 'Bạn chưa tham gia hoặc tạo nhóm nào. Hãy tạo nhóm mới để bắt đầu!'
                  : 'Bạn chưa được thêm vào nhóm nào. Hãy chờ Leader thêm bạn vào nhóm.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group) => (
              <Link key={group.id} to={`/groups/${group.id}`}>
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <FolderKanban className="w-6 h-6" />
                      </div>
                      {getRoleBadge(group.myRole)}
                    </div>
                    <CardTitle className="mt-4">{group.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {group.description || 'Không có mô tả'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{group.memberCount} thành viên</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}