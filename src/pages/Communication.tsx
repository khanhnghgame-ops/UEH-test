import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MessageSquare,
  ChevronLeft,
  Send,
  AtSign,
  Hash,
  FolderKanban,
  Check,
  CheckCheck,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { vi } from 'date-fns/locale';
import MentionInput from '@/components/communication/MentionInput';
import MessageItem from '@/components/communication/MessageItem';
import { parseMessageContent, type ParsedMention } from '@/lib/messageParser';

interface Project {
  id: string;
  name: string;
  unread_mentions: number;
  last_message?: string;
  last_message_at?: string;
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
  user_avatar?: string;
  mentions?: ParsedMention[];
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

  // Project members for mentions
  const [projectMembers, setProjectMembers] = useState<{ id: string; name: string }[]>([]);
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

          return {
            id: group.id,
            name: group.name,
            unread_mentions: count || 0,
            last_message: lastMsg?.content?.substring(0, 50) + (lastMsg?.content?.length > 50 ? '...' : ''),
            last_message_at: lastMsg?.created_at
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

      // Fetch user names separately
      const userIds = [...new Set((data || []).map(m => m.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

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

      const messagesWithParsed = (data || []).map((msg: any) => {
        const taskInfo = msg.source_task_id ? taskMap.get(msg.source_task_id) : null;
        return {
          ...msg,
          user_name: profileMap.get(msg.user_id) || 'Unknown',
          source_task_title: taskInfo?.title,
          source_task_stage: taskInfo?.stageOrder,
          mentions: parseMessageContent(msg.content).mentions
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
          // Get user names
          const userIds = [...new Set(messages.map(m => m.user_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

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

            allMentions.push({
              id: mention.id,
              message_id: pm.id,
              content: pm.content,
              source_type: pm.source_type as 'direct' | 'from_task',
              source_label: pm.source_type === 'from_task' && pm.source_task_id
                ? `Từ Task – ${taskMap.get(pm.source_task_id) || ''}`
                : `Chung – ${selectedProject.name}`,
              source_task_id: pm.source_task_id,
              user_name: profileMap.get(pm.user_id) || 'Unknown',
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

          // Get user names
          const userIds = [...new Set(comments.map(c => c.user_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

          const commentMap = new Map(comments.map(c => [c.id, c]));

          commentMentions.forEach(mention => {
            const tc = commentMap.get(mention.comment_id!);
            if (!tc) return;
            
            const taskInfo = taskMap.get(tc.task_id);
            if (!taskInfo || taskInfo.group_id !== selectedProject.id) return;

            allMentions.push({
              id: mention.id,
              comment_id: tc.id,
              content: tc.content,
              source_type: 'from_task',
              source_label: `Từ Task – ${taskInfo.title}`,
              source_task_id: tc.task_id,
              user_name: profileMap.get(tc.user_id) || 'Unknown',
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
        .select('id, full_name')
        .in('id', userIds);

      const members = (profiles || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || 'Unknown'
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

      // Insert message
      const { data: newMessage, error: msgError } = await supabase
        .from('project_messages')
        .insert({
          group_id: selectedProject.id,
          user_id: user.id,
          content,
          source_type: 'direct'
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

  const handleNavigateToTask = (taskId: string) => {
    // Find which group this task belongs to
    navigate(`/groups/${selectedProject?.id}?task=${taskId}`);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Hôm qua ' + format(date, 'HH:mm');
    return format(date, 'dd/MM HH:mm');
  };

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    msgs.forEach(msg => {
      const msgDate = new Date(msg.created_at);
      let dateLabel = format(msgDate, 'dd/MM/yyyy');
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

  // Project List View
  if (!selectedProject) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
              <MessageSquare className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Trao đổi</h1>
              <p className="text-muted-foreground text-sm">Chọn project để bắt đầu trao đổi</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FolderKanban className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Bạn chưa tham gia project nào</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {projects.map(project => (
                <Card 
                  key={project.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setSelectedProject(project)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-primary/10">
                          <FolderKanban className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{project.name}</h3>
                          {project.last_message && (
                            <p className="text-sm text-muted-foreground truncate max-w-md">
                              {project.last_message}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {project.last_message_at && (
                          <span className="text-xs text-muted-foreground">
                            {formatMessageDate(project.last_message_at)}
                          </span>
                        )}
                        {project.unread_mentions > 0 && (
                          <Badge variant="destructive" className="px-2 py-0.5 text-xs">
                            {project.unread_mentions} @Tôi
                          </Badge>
                        )}
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
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedProject(null)}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="p-2.5 rounded-lg bg-primary/10">
              <FolderKanban className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{selectedProject.name}</h1>
              <p className="text-xs text-muted-foreground">{projectMembers.length} thành viên</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'mentions')} className="flex-1 flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="all" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Tất cả
            </TabsTrigger>
            <TabsTrigger value="mentions" className="gap-2">
              <AtSign className="w-4 h-4" />
              @Tôi
              {mentions.filter(m => !m.is_read).length > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs">
                  {mentions.filter(m => !m.is_read).length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* All Messages Tab */}
          <TabsContent value="all" className="flex-1 flex flex-col mt-4">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {groupMessagesByDate(messages).map((group, groupIdx) => (
                  <div key={groupIdx}>
                    <div className="flex items-center justify-center my-4">
                      <div className="px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground">
                        {group.date}
                      </div>
                    </div>
                    {group.messages.map((msg) => (
                      <MessageItem
                        key={msg.id}
                        message={msg}
                        isOwn={msg.user_id === user?.id}
                        onTaskClick={handleNavigateToTask}
                      />
                    ))}
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
                    <p>Chưa có tin nhắn nào</p>
                    <p className="text-sm">Hãy bắt đầu cuộc trò chuyện!</p>
                  </div>
                )}
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t">
                <MentionInput
                  value={messageInput}
                  onChange={setMessageInput}
                  onSend={handleSendMessage}
                  members={projectMembers}
                  tasks={projectTasks}
                  placeholder="Nhập tin nhắn..."
                  isSending={isSending}
                />
              </div>
            </Card>
          </TabsContent>

          {/* Mentions Tab */}
          <TabsContent value="mentions" className="flex-1 mt-4">
            <Card className="h-full">
              <ScrollArea className="h-full p-4">
                {mentions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <AtSign className="w-12 h-12 mb-4 opacity-30" />
                    <p>Chưa có tin nhắn nào nhắc đến bạn</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mentions.map((mention) => (
                      <Card 
                        key={mention.id}
                        className={`cursor-pointer transition-colors ${
                          mention.is_read 
                            ? 'bg-muted/30 border-border/50' 
                            : 'bg-primary/5 border-primary/30 hover:border-primary/50'
                        }`}
                        onClick={() => {
                          if (!mention.is_read) handleMarkAsRead(mention.id);
                          if (mention.source_task_id) handleNavigateToTask(mention.source_task_id);
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {!mention.is_read && (
                                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                    Chưa xem
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  📌 {mention.source_label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarFallback className="text-[10px] bg-primary/20">
                                    {getInitials(mention.user_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium">{mention.user_name}</span>
                                <span className="text-xs text-muted-foreground">
                                  · {formatMessageDate(mention.created_at)}
                                </span>
                              </div>
                              <p className="text-sm text-foreground/90">{mention.content}</p>
                            </div>
                            {mention.source_task_id && (
                              <Button variant="ghost" size="sm" className="shrink-0">
                                Mở task <ExternalLink className="w-3 h-3 ml-1" />
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
