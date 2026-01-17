import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import UserAvatar from '@/components/UserAvatar';
import { Loader2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import MentionInput from './MentionInput';
import { parseMessageContent, renderMessageContent } from '@/lib/messageParser';
import { cn } from '@/lib/utils';

interface Comment {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  user_name?: string;
  avatar_url?: string;
}

interface TaskCommentsProps {
  taskId: string;
  groupId: string;
  className?: string;
}

export default function TaskComments({ taskId, groupId, className }: TaskCommentsProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string; avatar_url?: string }[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string; stageOrder: number; stageName: string }[]>([]);

  useEffect(() => {
    fetchComments();
    fetchMembers();
    fetchTasks();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`
      }, () => {
        fetchComments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  // Scroll to bottom when comments change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch user names and avatars separately
      const userIds = [...new Set((data || []).map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, { name: p.full_name, avatar_url: p.avatar_url }]));

      const commentsWithNames = (data || []).map((c: any) => {
        const userProfile = profileMap.get(c.user_id);
        return {
          ...c,
          user_name: userProfile?.name || 'Unknown',
          avatar_url: userProfile?.avatar_url
        };
      });

      setComments(commentsWithNames);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const { data } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

      if (!data || data.length === 0) {
        setMembers([]);
        return;
      }

      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);

      const memberList = (profiles || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || 'Unknown',
        avatar_url: p.avatar_url
      }));

      setMembers(memberList);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, stage_id, stages(name, order_index)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      const taskList = (data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        stageOrder: (t.stages?.order_index ?? 0) + 1,
        stageName: t.stages?.name || ''
      }));

      setTasks(taskList);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const handleSendComment = async () => {
    if (!commentInput.trim() || !user || isSending) return;

    setIsSending(true);
    const content = commentInput.trim();

    try {
      const parsed = parseMessageContent(content);

      // Insert comment
      const { data: newComment, error: commentError } = await supabase
        .from('task_comments')
        .insert({
          task_id: taskId,
          user_id: user.id,
          content
        })
        .select()
        .single();

      if (commentError) throw commentError;

      // Insert mentions
      const mentionsToInsert: any[] = [];

      for (const mention of parsed.mentions) {
        if (mention.type === 'user') {
          const member = members.find(m => 
            m.name.toLowerCase().includes(mention.value.toLowerCase())
          );
          if (member) {
            mentionsToInsert.push({
              comment_id: newComment.id,
              mention_type: 'user',
              mentioned_user_id: member.id
            });
          }
        } else if (mention.type === 'assignee') {
          // Get assignees of current task
          const { data: assignments } = await supabase
            .from('task_assignments')
            .select('user_id')
            .eq('task_id', taskId);
          
          (assignments || []).forEach((a: any) => {
            mentionsToInsert.push({
              comment_id: newComment.id,
              mention_type: 'assignee',
              mentioned_user_id: a.user_id
            });
          });
        } else if (mention.type === 'task') {
          mentionsToInsert.push({
            comment_id: newComment.id,
            mention_type: 'task',
            mentioned_task_id: mention.taskId
          });
        }
      }

      if (mentionsToInsert.length > 0) {
        await supabase.from('message_mentions').insert(mentionsToInsert);
      }

      // If there are @mentions, also post a copy to project chat
      const hasMentions = parsed.mentions.some(m => m.type === 'user' || m.type === 'assignee');
      
      if (hasMentions) {
        // Get task title for the source label
        const { data: taskData } = await supabase
          .from('tasks')
          .select('title')
          .eq('id', taskId)
          .single();

        await supabase.from('project_messages').insert({
          group_id: groupId,
          user_id: user.id,
          content,
          source_type: 'from_task',
          source_task_id: taskId,
          source_comment_id: newComment.id
        });
      }

      setCommentInput('');
      fetchComments();
    } catch (error) {
      console.error('Error sending comment:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể gửi bình luận',
        variant: 'destructive'
      });
    } finally {
      setIsSending(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <div className="px-4 py-2.5 border-b flex items-center gap-2 shrink-0">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">Trao đổi trong task</span>
        <span className="text-xs text-muted-foreground">({comments.length})</span>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Chưa có bình luận</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Hãy bắt đầu cuộc trao đổi</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => {
              const isOwn = comment.user_id === user?.id;
              const segments = renderMessageContent(comment.content);

              return (
                <div key={comment.id} className={cn('flex gap-2', isOwn && 'flex-row-reverse')}>
                  <UserAvatar 
                    src={comment.avatar_url}
                    name={comment.user_name}
                    size="sm"
                    fallbackClassName={cn(
                      isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  />

                  <div className={cn('flex flex-col max-w-[80%]', isOwn && 'items-end')}>
                    {!isOwn && (
                      <span className="text-[10px] font-medium text-muted-foreground mb-0.5">
                        {comment.user_name}
                      </span>
                    )}
                    <div className={cn(
                      'px-3 py-2 rounded-xl text-sm',
                      isOwn 
                        ? 'bg-primary text-primary-foreground rounded-br-sm' 
                        : 'bg-muted rounded-bl-sm'
                    )}>
                      {segments.map((segment, idx) => {
                        if (segment.type === 'user-mention' || segment.type === 'assignee-mention') {
                          return (
                            <span key={idx} className={cn(
                              'font-semibold',
                              isOwn ? 'text-primary-foreground/90' : 'text-primary'
                            )}>
                              {segment.content}
                            </span>
                          );
                        }
                        if (segment.type === 'task-ref') {
                          return (
                            <span key={idx} className={cn(
                              'font-medium underline',
                              isOwn ? 'text-primary-foreground/90' : 'text-accent-foreground'
                            )}>
                              {segment.content}
                            </span>
                          );
                        }
                        return <span key={idx}>{segment.content}</span>;
                      })}
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      {format(new Date(comment.created_at), 'HH:mm')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t shrink-0 bg-muted/20">
        <MentionInput
          value={commentInput}
          onChange={setCommentInput}
          onSend={handleSendComment}
          members={members}
          tasks={tasks}
          placeholder="Nhập bình luận..."
          isSending={isSending}
        />
      </div>
    </Card>
  );
}
