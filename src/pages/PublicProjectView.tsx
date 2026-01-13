import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Loader2, Eye, Calendar, Clock, Users, Activity, 
  CheckCircle, Circle, AlertCircle, Layers, 
  ChevronDown, ChevronRight, User, BookOpen, Mail, Link as LinkIcon,
  ExternalLink, LogIn, LayoutDashboard, FileText, Menu, X, FolderKanban
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { parseLocalDateTime, formatDeadlineVN } from '@/lib/datetime';
import type { Group, Stage, Task, TaskAssignment, GroupMember } from '@/types/database';
import uehLogo from '@/assets/ueh-logo-new.png';

// Components for each tab (read-only versions)
import PublicGroupDashboard from '@/components/public/PublicGroupDashboard';
import PublicTaskListView from '@/components/public/PublicTaskListView';
import PublicMemberList from '@/components/public/PublicMemberList';
import PublicActivityLog from '@/components/public/PublicActivityLog';

interface ExtendedGroup extends Group {
  class_code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
  zalo_link: string | null;
  additional_info: string | null;
  is_public: boolean;
  share_token: string | null;
  show_members_public: boolean;
  show_activity_public: boolean;
}

interface ActivityLog {
  id: string;
  action: string;
  action_type: string;
  description: string | null;
  user_name: string;
  created_at: string;
}

type TabValue = 'overview' | 'tasks' | 'members' | 'activity';

export default function PublicProjectView() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [group, setGroup] = useState<ExtendedGroup | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (shareToken) fetchPublicData();
  }, [shareToken]);

  const fetchPublicData = async () => {
    try {
      // Fetch group by share token
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('share_token', shareToken)
        .eq('is_public', true)
        .single();

      if (groupError || !groupData) {
        setError('Link không hợp lệ hoặc đã bị vô hiệu hóa');
        setIsLoading(false);
        return;
      }

      setGroup(groupData as ExtendedGroup);

      // Fetch stages
      const { data: stagesData } = await supabase
        .from('stages')
        .select('*')
        .eq('group_id', groupData.id)
        .order('order_index');
      if (stagesData) setStages(stagesData);

      // Fetch tasks with assignments
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .eq('group_id', groupData.id)
        .order('created_at', { ascending: false });

      if (tasksData) {
        const taskIds = tasksData.map(t => t.id);
        const { data: assignmentsData } = await supabase
          .from('task_assignments')
          .select('*')
          .in('task_id', taskIds);
        
        const assigneeIds = [...new Set(assignmentsData?.map(a => a.user_id) || [])];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', assigneeIds);
        
        const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        
        setTasks(tasksData.map(task => ({
          ...task,
          task_assignments: assignmentsData?.filter(a => a.task_id === task.id)
            .map(a => ({ ...a, profiles: profilesMap.get(a.user_id) })) || [],
        })) as Task[]);
      }

      // Fetch members if allowed
      if (groupData.show_members_public) {
        const { data: membersData } = await supabase
          .from('group_members')
          .select('*')
          .eq('group_id', groupData.id);
        
        if (membersData) {
          const userIds = membersData.map(m => m.user_id);
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds);
          const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
          setMembers(membersData.map(m => ({ ...m, profiles: profilesMap.get(m.user_id) })) as GroupMember[]);
        }
      }

      // Fetch activity logs if allowed
      if (groupData.show_activity_public) {
        const { data: logsData } = await supabase
          .from('activity_logs')
          .select('*')
          .eq('group_id', groupData.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (logsData) setActivityLogs(logsData);
      }
    } catch (err: any) {
      setError('Có lỗi xảy ra khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  // Navigation items for tabs
  const navItems = [
    { id: 'overview' as TabValue, name: 'Tổng quan', icon: LayoutDashboard },
    { id: 'tasks' as TabValue, name: 'Task & Giai đoạn', icon: Layers },
    ...(group?.show_members_public ? [{ id: 'members' as TabValue, name: `Thành viên (${members.length})`, icon: Users }] : []),
    ...(group?.show_activity_public ? [{ id: 'activity' as TabValue, name: 'Nhật ký', icon: Activity }] : []),
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <div className="text-center space-y-4">
          <div className="p-4 rounded-full bg-destructive/10 w-fit mx-auto">
            <AlertCircle className="w-12 h-12 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Không thể truy cập</h1>
          <p className="text-muted-foreground max-w-md">{error}</p>
          <Link to="/" className="text-primary hover:underline">
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Fixed Top Navigation Bar - Same style as internal system */}
      <header className="fixed top-0 left-0 right-0 z-50 min-h-14 bg-primary shadow-lg">
        <div className="h-full max-w-[1600px] mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
          {/* Left: Logo only on mobile, Logo + Brand on larger */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img src={uehLogo} alt="UEH Logo" className="h-8 sm:h-10 w-auto drop-shadow-md" />
            <div className="hidden sm:block h-6 w-px bg-white/20" />
            <div className="hidden sm:flex flex-col max-w-[200px]">
              <span className="font-bold text-sm text-white truncate">{group.name}</span>
              <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0 bg-white/10 text-white/90 border-white/20">
                <Eye className="w-2.5 h-2.5 mr-1" />
                Chỉ xem
              </Badge>
            </div>
          </div>

          {/* Center: Navigation Menu - Hidden on mobile */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    isActive 
                      ? 'bg-white/20 text-white' 
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden lg:inline">{item.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Login Button & Menu */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Read-only badge - only on xl screens */}
            <Badge variant="outline" className="hidden xl:flex gap-1.5 px-2 py-1 bg-warning/20 text-warning border-warning/30 text-xs">
              <Eye className="w-3 h-3" />
              Chỉ xem
            </Badge>
            
            {/* Login button */}
            <Button asChild variant="ghost" size="sm" className="gap-1 text-white hover:bg-white/10 hover:text-white px-2 sm:px-3">
              <Link to="/auth">
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">Đăng nhập</span>
              </Link>
            </Button>

            {/* Mobile Menu Button */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden text-white hover:bg-white/10 h-9 w-9"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-primary border-t border-white/10 shadow-lg max-h-[70vh] overflow-y-auto">
            {/* Mobile project name at top */}
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-white font-semibold text-base line-clamp-2">{group.name}</p>
              {group.description && (
                <p className="text-white/60 text-xs mt-1 line-clamp-2">{group.description}</p>
              )}
              <Badge variant="outline" className="mt-2 text-[10px] px-2 py-0.5 bg-white/10 text-white/90 border-white/20">
                <Eye className="w-2.5 h-2.5 mr-1" />
                Chế độ chỉ xem
              </Badge>
            </div>
            
            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg font-medium transition-all ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content - with top padding for fixed header */}
      <main className="flex-1 pt-16">
        <div className="max-w-[1600px] mx-auto p-6">
          {/* Project Header with Image */}
          <div className="mb-6 flex items-start gap-4">
            {/* Project Image - 1:1 thumbnail */}
            <div className="relative w-24 h-24 flex-shrink-0 rounded-xl bg-muted overflow-hidden">
              {group.image_url ? (
                <img
                  src={group.image_url}
                  alt={group.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                  <FolderKanban className="w-10 h-10 text-primary/40" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold line-clamp-2">{group.name}</h1>
              {group.description && <p className="text-muted-foreground mt-1 line-clamp-2">{group.description}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {group.class_code && (
                  <Badge variant="secondary" className="gap-1.5">
                    <BookOpen className="w-3 h-3" />
                    {group.class_code}
                  </Badge>
                )}
                {group.instructor_name && (
                  <Badge variant="secondary" className="gap-1.5">
                    <User className="w-3 h-3" />
                    GV: {group.instructor_name}
                  </Badge>
                )}
                {group.instructor_email && (
                  <Badge variant="outline" className="gap-1.5">
                    <Mail className="w-3 h-3" />
                    {group.instructor_email}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <PublicGroupDashboard 
              group={group} 
              tasks={tasks} 
              stages={stages} 
              members={members} 
            />
          )}
          
          {activeTab === 'tasks' && (
            <PublicTaskListView 
              stages={stages} 
              tasks={tasks}
              groupId={group.id}
            />
          )}
          
          {activeTab === 'members' && group.show_members_public && (
            <PublicMemberList members={members} />
          )}
          
          {activeTab === 'activity' && group.show_activity_public && (
            <PublicActivityLog logs={activityLogs} />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 bg-muted/30">
        <div className="max-w-[1600px] mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} UEH Project Management System</p>
          <p className="mt-1">Đây là trang xem công khai – chỉ xem, không chỉnh sửa</p>
        </div>
      </footer>
    </div>
  );
}
