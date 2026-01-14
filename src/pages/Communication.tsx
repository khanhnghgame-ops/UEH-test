import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserAvatar from '@/components/UserAvatar';
import { Separator } from '@/components/ui/separator';
import {
  MessageSquare,
  ChevronLeft,
  AtSign,
  FolderKanban,
  Loader2,
  ExternalLink,
  Users,
  Clock,
  Sparkles,
  MessagesSquare,
  Bell,
  Search,
  MoreVertical
} from 'lucide-react';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import MentionInput from '@/components/communication/MentionInput';
import MessageItem from '@/components/communication/MessageItem';
import { parseMessageContent, type ParsedMention } from '@/lib/messageParser';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  unread_mentions: number;
  last_message?: string;
  last_message_at?: string;
  member_count?: number;
}

interface Message {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  source_type: 'direct' | 'from_task';
  source_task_id?: string;
  source_task_title?: string;
  source_comment_id?: string;
  user_name?: string;
  avatar_url?: string;
  mentions?: ParsedMention[];
  reply_to?: string;
  reply_to_content?: string;
  reply_to_user_name?: string;
}

interface MentionItem {
  id: string;
  message_id?: string;
  comment_id?: string;
  content: string;
  source_type: 'direct' | 'from_task';
  source_label: string;
  source_task_id?: string;
  user_name: string;
  avatar_url?: string;
  created_at: string;
  is_read: boolean;
}

export default function Communication() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'mentions'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Project members for mentions
  const [projectMembers, setProjectMembers] = useState<{ id: string; name: string; avatar_url?: string }[]>([]);
  const [projectTasks, setProjectTasks] = useState<{ id: string; title: string; stageOrder: number; stageName: string }[]>([]);

  // Fetch projects with unread counts
  useEffect(() => {
    if (!user) return;
    fetchProjects();
  }, [user]);

  // Fetch messages when project selected
  useEffect(() => {
    if (!selectedProject || !user) return;
    fetchMessages();
    fetchMentions();
    fetchProjectMembers();
    fetchProjectTasks();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`project-messages-${selectedProject.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'project_messages',
        filter: `group_id=eq.${selectedProject.id}`
      }, (payload) => {
        fetchMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedProject, user]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current && activeTab === 'all') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  const fetchProjects = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Get groups user is member of
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name)')
        .eq('user_id', user.id);

      if (!memberships) {
        setProjects([]);
        setIsLoading(false);
        return;
      }

      // Get unread mention counts for each group
      const projectsWithCounts = await Promise.all(
        memberships.map(async (m: any) => {
          const group = m.groups;
          if (!group) return null;

          // Count unread mentions for this user in this group
          const { count } = await supabase
            .from('message_mentions')
            .select('*, project_messages!inner(group_id)', { count: 'exact', head: true })
            .eq('mentioned_user_id', user.id)
            .eq('is_read', false)
            .eq('project_messages.group_id', group.id);

          // Get last message
          const { data: lastMsg } = await supabase
            .from('project_messages')
            .select('content, created_at')
            .eq('group_id', group.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          // Get member count
          const { count: memberCount } = await supabase
            .from('group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id);

          return {
            id: group.id,
            name: group.name,
            unread_mentions: count || 0,
            last_message: lastMsg?.content?.substring(0, 60) + (lastMsg?.content?.length > 60 ? '...' : ''),
            last_message_at: lastMsg?.created_at,
            member_count: memberCount || 0
          };
        })
      );

      setProjects(projectsWithCounts.filter(Boolean) as Project[]);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (!selectedProject) return;

    try {
      // Fetch messages
      const { data, error } = await supabase
        .from('project_messages')
        .select('*')
        .eq('group_id', selectedProject.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      // Fetch user names and avatars separately
      const userIds = [...new Set((data || []).map(m => m.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, { name: p.full_name, avatar_url: p.avatar_url }]));

      // Fetch task titles separately
      const taskIds = [...new Set((data || []).filter(m => m.source_task_id).map(m => m.source_task_id))];
      let taskMap = new Map<string, { title: string; stageOrder: number; stageName: string }>();
      if (taskIds.length > 0) {
        const { data: tasksData } = await supabase
          .from('tasks')
          .select('id, title, stage_id, stages(name, order_index)')
          .in('id', taskIds);
        taskMap = new Map((tasksData || []).map((t: any) => [t.id, {
          title: t.title,
          stageOrder: t.stages?.order_index ?? 0,
          stageName: t.stages?.name || ''
        }]));
      }

      // Build message map for reply lookups
      const messageMap = new Map((data || []).map(m => [m.id, m]));

      const messagesWithParsed = (data || []).map((msg: any) => {
        const taskInfo = msg.source_task_id ? taskMap.get(msg.source_task_id) : null;
        const userProfile = profileMap.get(msg.user_id);
        
        // Get reply info if exists
        let replyToContent: string | undefined;
        let replyToUserName: string | undefined;
        if (msg.reply_to) {
          const parentMsg = messageMap.get(msg.reply_to);
          if (parentMsg) {
            replyToContent = parentMsg.content?.substring(0, 100) + (parentMsg.content?.length > 100 ? '...' : '');
            const parentProfile = profileMap.get(parentMsg.user_id);
            replyToUserName = parentProfile?.name || 'Unknown';
          }
        }
        
        return {
          ...msg,
          user_name: userProfile?.name || 'Unknown',
          avatar_url: userProfile?.avatar_url,
          source_task_title: taskInfo?.title,
          source_task_stage: taskInfo?.stageOrder,
          mentions: parseMessageContent(msg.content).mentions,
          reply_to_content: replyToContent,
          reply_to_user_name: replyToUserName
        };
      });

      setMessages(messagesWithParsed);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchMentions = async () => {
    if (!selectedProject || !user) return;

    try {
      // Get mentions that have message_id (from project messages)
      const { data: messageMentions } = await supabase
        .from('message_mentions')
        .select('*')
        .eq('mentioned_user_id', user.id)
        .not('message_id', 'is', null);

      // Get mentions that have comment_id (from task comments)
      const { data: commentMentions } = await supabase
        .from('message_mentions')
        .select('*')
        .eq('mentioned_user_id', user.id)
        .not('comment_id', 'is', null);

      const allMentions: MentionItem[] = [];

      // Process message mentions
      if (messageMentions && messageMentions.length > 0) {
        const messageIds = messageMentions.map(m => m.message_id).filter(Boolean);
        const { data: messages } = await supabase
          .from('project_messages')
          .select('*')
          .in('id', messageIds)
          .eq('group_id', selectedProject.id);

        if (messages && messages.length > 0) {
          // Get user names and avatars
          const userIds = [...new Set(messages.map(m => m.user_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', userIds);
          const profileMap = new Map((profiles || []).map(p => [p.id, { name: p.full_name, avatar_url: p.avatar_url }]));

          // Get task titles
          const taskIds = [...new Set(messages.filter(m => m.source_task_id).map(m => m.source_task_id))];
          let taskMap = new Map<string, string>();
          if (taskIds.length > 0) {
            const { data: tasks } = await supabase
              .from('tasks')
              .select('id, title')
              .in('id', taskIds);
            taskMap = new Map((tasks || []).map(t => [t.id, t.title]));
          }

          const messageMap = new Map(messages.map(m => [m.id, m]));
          
          messageMentions.forEach(mention => {
            const pm = messageMap.get(mention.message_id!);
            if (!pm) return;

            const userProfile = profileMap.get(pm.user_id);
            allMentions.push({
              id: mention.id,
              message_id: pm.id,
              content: pm.content,
              source_type: pm.source_type as 'direct' | 'from_task',
              source_label: pm.source_type === 'from_task' && pm.source_task_id
                ? `Task – ${taskMap.get(pm.source_task_id) || ''}`
                : `Chat chung`,
              source_task_id: pm.source_task_id,
              user_name: userProfile?.name || 'Unknown',
              avatar_url: userProfile?.avatar_url,
              created_at: pm.created_at,
              is_read: mention.is_read
            });
          });
        }
      }

      // Process comment mentions
      if (commentMentions && commentMentions.length > 0) {
        const commentIds = commentMentions.map(m => m.comment_id).filter(Boolean);
        const { data: comments } = await supabase
          .from('task_comments')
          .select('*')
          .in('id', commentIds);

        if (comments && comments.length > 0) {
          // Get task info
          const taskIds = [...new Set(comments.map(c => c.task_id))];
          const { data: tasks } = await supabase
            .from('tasks')
            .select('id, title, group_id')
            .in('id', taskIds);
          const taskMap = new Map((tasks || []).map(t => [t.id, { title: t.title, group_id: t.group_id }]));

          // Get user names and avatars
          const userIds = [...new Set(comments.map(c => c.user_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', userIds);
          const profileMap = new Map((profiles || []).map(p => [p.id, { name: p.full_name, avatar_url: p.avatar_url }]));

          const commentMap = new Map(comments.map(c => [c.id, c]));

          commentMentions.forEach(mention => {
            const tc = commentMap.get(mention.comment_id!);
            if (!tc) return;
            
            const taskInfo = taskMap.get(tc.task_id);
            if (!taskInfo || taskInfo.group_id !== selectedProject.id) return;

            const userProfile = profileMap.get(tc.user_id);
            allMentions.push({
              id: mention.id,
              comment_id: tc.id,
              content: tc.content,
              source_type: 'from_task',
              source_label: `Task – ${taskInfo.title}`,
              source_task_id: tc.task_id,
              user_name: userProfile?.name || 'Unknown',
              avatar_url: userProfile?.avatar_url,
              created_at: tc.created_at,
              is_read: mention.is_read
            });
          });
        }
      }

      // Sort by created_at desc
      allMentions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setMentions(allMentions);
    } catch (error) {
      console.error('Error fetching mentions:', error);
    }
  };

  const fetchProjectMembers = async () => {
    if (!selectedProject) return;

    try {
      const { data } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', selectedProject.id);

      if (!data || data.length === 0) {
        setProjectMembers([]);
        return;
      }

      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);

      const members = (profiles || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || 'Unknown',
        avatar_url: p.avatar_url
      }));

      setProjectMembers(members);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchProjectTasks = async () => {
    if (!selectedProject) return;

    try {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, stage_id, stages(name, order_index)')
        .eq('group_id', selectedProject.id)
        .order('created_at', { ascending: false });

      const tasks = (data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        stageOrder: (t.stages?.order_index ?? 0) + 1,
        stageName: t.stages?.name || ''
      }));

      setProjectTasks(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedProject || !user || isSending) return;

    setIsSending(true);
    const content = messageInput.trim();

    try {
      // Parse mentions from content
      const parsed = parseMessageContent(content);

      // Insert message with reply_to if replying
      const { data: newMessage, error: msgError } = await supabase
        .from('project_messages')
        .insert({
          group_id: selectedProject.id,
          user_id: user.id,
          content,
          source_type: 'direct',
          reply_to: replyingTo?.id || null
        })
        .select()
        .single();

      if (msgError) throw msgError;

      // Insert mentions
      const mentionsToInsert: any[] = [];

      for (const mention of parsed.mentions) {
        if (mention.type === 'user') {
          // Find user by name
          const member = projectMembers.find(m => 
            m.name.toLowerCase().includes(mention.value.toLowerCase())
          );
          if (member) {
            mentionsToInsert.push({
              message_id: newMessage.id,
              mention_type: 'user',
              mentioned_user_id: member.id
            });
          }
        } else if (mention.type === 'assignee') {
          // Find assignee of referenced task
          const taskRef = parsed.mentions.find(m => m.type === 'task');
          if (taskRef) {
            const { data: assignments } = await supabase
              .from('task_assignments')
              .select('user_id')
              .eq('task_id', taskRef.taskId);
            
            (assignments || []).forEach((a: any) => {
              mentionsToInsert.push({
                message_id: newMessage.id,
                mention_type: 'assignee',
                mentioned_user_id: a.user_id
              });
            });
          }
        } else if (mention.type === 'task') {
          mentionsToInsert.push({
            message_id: newMessage.id,
            mention_type: 'task',
            mentioned_task_id: mention.taskId
          });
        }
      }

      if (mentionsToInsert.length > 0) {
        await supabase.from('message_mentions').insert(mentionsToInsert);
      }

      setMessageInput('');
      setReplyingTo(null); // Clear reply state
      fetchMessages();
      fetchProjects(); // Update unread counts
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể gửi tin nhắn',
        variant: 'destructive'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkAsRead = async (mentionId: string) => {
    try {
      await supabase
        .from('message_mentions')
        .update({ is_read: true })
        .eq('id', mentionId);

      setMentions(prev => prev.map(m => 
        m.id === mentionId ? { ...m, is_read: true } : m
      ));
      fetchProjects();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = mentions.filter(m => !m.is_read).map(m => m.id);
    if (unreadIds.length === 0) return;

    try {
      await supabase
        .from('message_mentions')
        .update({ is_read: true })
        .in('id', unreadIds);

      setMentions(prev => prev.map(m => ({ ...m, is_read: true })));
      fetchProjects();
      toast({
        title: 'Đã đánh dấu tất cả là đã đọc'
      });
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      // First delete related mentions
      await supabase
        .from('message_mentions')
        .delete()
        .eq('message_id', messageId);

      // Then delete the message
      const { error } = await supabase
        .from('project_messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', user?.id); // Ensure user can only delete their own messages

      if (error) throw error;

      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast({
        title: 'Đã xóa tin nhắn'
      });
    } catch (error) {
      console.error('Error deleting message:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xóa tin nhắn',
        variant: 'destructive'
      });
    }
  };

  const handleNavigateToTask = (taskId: string) => {
    // Navigate directly to the project's tasks tab using slug
    const projectSlug = (selectedProject as any)?.slug || (selectedProject as any)?.short_id || selectedProject?.id;
    navigate(`/p/${projectSlug}?tab=tasks&task=${taskId}`);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Hôm qua';
    return format(date, 'dd/MM');
  };

  const formatRelativeTime = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: vi });
  };

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    msgs.forEach(msg => {
      const msgDate = new Date(msg.created_at);
      let dateLabel = format(msgDate, 'EEEE, dd/MM/yyyy', { locale: vi });
      if (isToday(msgDate)) dateLabel = 'Hôm nay';
      else if (isYesterday(msgDate)) dateLabel = 'Hôm qua';

      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        groups.push({ date: dateLabel, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  const totalUnreadMentions = projects.reduce((acc, p) => acc + p.unread_mentions, 0);

  // Project List View
  if (!selectedProject) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25">
                  <MessagesSquare className="w-7 h-7 text-primary-foreground" />
                </div>
                {totalUnreadMentions > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
                    {totalUnreadMentions > 9 ? '9+' : totalUnreadMentions}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold font-heading">Trao đổi</h1>
                <p className="text-muted-foreground text-sm">
                  {projects.length} dự án • {totalUnreadMentions > 0 ? `${totalUnreadMentions} thông báo mới` : 'Không có thông báo mới'}
                </p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/15">
                  <FolderKanban className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{projects.length}</p>
                  <p className="text-xs text-muted-foreground">Dự án</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-accent/5 to-accent/10 border-accent/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent/15">
                  <Bell className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalUnreadMentions}</p>
                  <p className="text-xs text-muted-foreground">Chưa đọc</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-success/5 to-success/10 border-success/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-success/15">
                  <Users className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{projects.reduce((acc, p) => acc + (p.member_count || 0), 0)}</p>
                  <p className="text-xs text-muted-foreground">Thành viên</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Project List */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Đang tải dự án...</p>
            </div>
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FolderKanban className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Chưa có dự án nào</h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  Bạn chưa tham gia dự án nào. Hãy tham gia hoặc tạo dự án mới để bắt đầu trao đổi.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Các dự án</h2>
              </div>
              {projects.map((project, index) => (
                <Card 
                  key={project.id}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/40 group",
                    project.unread_mentions > 0 && "border-primary/30 bg-primary/[0.02]"
                  )}
                  onClick={() => setSelectedProject(project)}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Project Avatar */}
                      <div className="relative">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition-transform group-hover:scale-105",
                          project.unread_mentions > 0 
                            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20" 
                            : "bg-gradient-to-br from-muted to-muted/80 text-muted-foreground"
                        )}>
                          {project.name.charAt(0).toUpperCase()}
                        </div>
                        {project.unread_mentions > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground ring-2 ring-card animate-pulse">
                            {project.unread_mentions}
                          </span>
                        )}
                      </div>

                      {/* Project Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                            {project.name}
                          </h3>
                          {project.unread_mentions > 0 && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5">
                              <AtSign className="w-3 h-3 mr-0.5" />
                              {project.unread_mentions}
                            </Badge>
                          )}
                        </div>
                        {project.last_message ? (
                          <p className="text-sm text-muted-foreground truncate">
                            {project.last_message}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground/60 italic">
                            Chưa có tin nhắn
                          </p>
                        )}
                      </div>

                      {/* Meta Info */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {project.last_message_at && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatMessageDate(project.last_message_at)}
                          </span>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {project.member_count || 0}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Chat Room View
  const unreadMentionsCount = mentions.filter(m => !m.is_read).length;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedProject(null)}
              className="rounded-xl hover:bg-muted"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20">
              {selectedProject.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-bold font-heading">{selectedProject.name}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                <span>{projectMembers.length} thành viên</span>
                <span>•</span>
                <span>{messages.length} tin nhắn</span>
              </div>
            </div>
          </div>

          {/* Members Preview */}
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {projectMembers.slice(0, 4).map((member) => (
                <UserAvatar 
                  key={member.id}
                  src={member.avatar_url}
                  name={member.name}
                  size="sm"
                  className="border-2 border-background"
                />
              ))}
              {projectMembers.length > 4 && (
                <div className="w-7 h-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                  +{projectMembers.length - 4}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'mentions')} className="flex-1 flex flex-col">
          <TabsList className="w-fit bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="all" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <MessageSquare className="w-4 h-4" />
              Tất cả
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {messages.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="mentions" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <AtSign className="w-4 h-4" />
              @Tôi
              {unreadMentionsCount > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px] animate-pulse">
                  {unreadMentionsCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* All Messages Tab */}
          <TabsContent value="all" className="flex-1 flex flex-col mt-4 min-h-0">
            <Card className="flex-1 flex flex-col overflow-hidden border-muted/50">
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {groupMessagesByDate(messages).map((group, groupIdx) => (
                  <div key={groupIdx}>
                    <div className="flex items-center justify-center my-6">
                      <Separator className="flex-1" />
                      <span className="px-4 py-1.5 rounded-full bg-muted/80 text-xs font-medium text-muted-foreground">
                        {group.date}
                      </span>
                      <Separator className="flex-1" />
                    </div>
                    {group.messages.map((msg) => (
                      <MessageItem
                        key={msg.id}
                        message={msg}
                        isOwn={msg.user_id === user?.id}
                        onTaskClick={handleNavigateToTask}
                        onDelete={handleDeleteMessage}
                        onReply={(message) => setReplyingTo(message)}
                      />
                    ))}
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-16">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4">
                      <Sparkles className="w-10 h-10 text-primary/60" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Bắt đầu cuộc trò chuyện</h3>
                    <p className="text-muted-foreground text-sm text-center max-w-xs">
                      Hãy gửi tin nhắn đầu tiên để bắt đầu trao đổi với các thành viên trong dự án
                    </p>
                  </div>
                )}
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t bg-muted/30">
                {/* Reply Preview */}
                {replyingTo && (
                  <div className="mb-3 p-3 bg-muted/50 rounded-lg border flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Trả lời {replyingTo.user_name}
                      </p>
                      <p className="text-sm line-clamp-2 text-foreground/80">
                        {replyingTo.content}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 shrink-0"
                      onClick={() => setReplyingTo(null)}
                    >
                      <span className="sr-only">Hủy trả lời</span>
                      ×
                    </Button>
                  </div>
                )}
                <MentionInput
                  value={messageInput}
                  onChange={setMessageInput}
                  onSend={handleSendMessage}
                  members={projectMembers}
                  tasks={projectTasks}
                  placeholder={replyingTo ? `Trả lời ${replyingTo.user_name}...` : "Nhập tin nhắn... Dùng @ để tag, # để tham chiếu task"}
                  isSending={isSending}
                />
              </div>
            </Card>
          </TabsContent>

          {/* Mentions Tab */}
          <TabsContent value="mentions" className="flex-1 mt-4 min-h-0">
            <Card className="h-full flex flex-col border-muted/50">
              {/* Mentions Header */}
              {mentions.length > 0 && (
                <div className="flex items-center justify-between p-4 border-b">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">
                      {unreadMentionsCount > 0 ? `${unreadMentionsCount} chưa đọc` : 'Tất cả đã đọc'}
                    </span>
                  </div>
                  {unreadMentionsCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead} className="text-xs">
                      Đánh dấu tất cả đã đọc
                    </Button>
                  )}
                </div>
              )}
              
              <ScrollArea className="flex-1 p-4">
                {mentions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 py-16">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <AtSign className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <h3 className="font-semibold mb-2">Chưa có ai nhắc đến bạn</h3>
                    <p className="text-muted-foreground text-sm text-center max-w-xs">
                      Khi có người nhắc đến bạn bằng @, bạn sẽ thấy thông báo tại đây
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mentions.map((mention, index) => (
                      <Card 
                        key={mention.id}
                        className={cn(
                          "cursor-pointer transition-all duration-200 hover:shadow-md overflow-hidden",
                          mention.is_read 
                            ? 'bg-card border-border/50 hover:border-border' 
                            : 'bg-primary/[0.03] border-primary/30 hover:border-primary/50 shadow-sm'
                        )}
                        onClick={() => {
                          if (!mention.is_read) handleMarkAsRead(mention.id);
                          if (mention.source_task_id) handleNavigateToTask(mention.source_task_id);
                        }}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {/* Unread indicator bar */}
                        {!mention.is_read && (
                          <div className="h-1 bg-gradient-to-r from-primary to-accent" />
                        )}
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {/* Avatar */}
                            <UserAvatar 
                              src={mention.avatar_url}
                              name={mention.user_name}
                              size="md"
                              className={cn(!mention.is_read && "ring-2 ring-primary/20")}
                              fallbackClassName={cn(
                                !mention.is_read 
                                  ? "bg-primary/20 text-primary" 
                                  : "bg-muted text-muted-foreground"
                              )}
                            />

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="font-semibold text-sm">{mention.user_name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatRelativeTime(mention.created_at)}
                                </span>
                                {!mention.is_read && (
                                  <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                                    Mới
                                  </Badge>
                                )}
                              </div>
                              
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[10px] px-2 py-0.5 mb-2",
                                  mention.source_type === 'from_task' 
                                    ? "bg-accent/10 text-accent border-accent/20" 
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                📌 {mention.source_label}
                              </Badge>

                              <p className="text-sm text-foreground/90 line-clamp-2">
                                {mention.content}
                              </p>
                            </div>

                            {/* Action */}
                            {mention.source_task_id && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
