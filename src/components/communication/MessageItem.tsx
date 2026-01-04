import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { renderMessageContent } from '@/lib/messageParser';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  source_type: 'direct' | 'from_task';
  source_task_id?: string;
  source_task_title?: string;
  user_name?: string;
}

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  onTaskClick?: (taskId: string) => void;
}

export default function MessageItem({ message, isOwn, onTaskClick }: MessageItemProps) {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const segments = renderMessageContent(message.content);

  return (
    <div className={cn('flex gap-3 mb-4', isOwn && 'flex-row-reverse')}>
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarFallback className={cn(
          'text-xs',
          isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}>
          {getInitials(message.user_name || 'U')}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex flex-col max-w-[70%]', isOwn && 'items-end')}>
        {/* Source label for messages from tasks */}
        {message.source_type === 'from_task' && message.source_task_title && (
          <Badge 
            variant="outline" 
            className="text-[10px] px-1.5 py-0 mb-1 cursor-pointer hover:bg-accent"
            onClick={() => message.source_task_id && onTaskClick?.(message.source_task_id)}
          >
            📌 Từ Task #{message.source_task_id?.substring(0, 4)} – {message.source_task_title}
          </Badge>
        )}

        <div className="flex items-end gap-2">
          {!isOwn && (
            <span className="text-xs font-medium text-muted-foreground mb-1">
              {message.user_name}
            </span>
          )}
        </div>

        <div className={cn(
          'px-4 py-2 rounded-2xl',
          isOwn 
            ? 'bg-primary text-primary-foreground rounded-br-md' 
            : 'bg-muted rounded-bl-md'
        )}>
          <p className="text-sm whitespace-pre-wrap break-words">
            {segments.map((segment, idx) => {
              if (segment.type === 'user-mention' || segment.type === 'assignee-mention') {
                return (
                  <span 
                    key={idx} 
                    className={cn(
                      'font-semibold',
                      isOwn ? 'text-primary-foreground/90' : 'text-primary'
                    )}
                  >
                    {segment.content}
                  </span>
                );
              }
              if (segment.type === 'task-ref') {
                return (
                  <span
                    key={idx}
                    className={cn(
                      'font-medium cursor-pointer underline underline-offset-2',
                      isOwn ? 'text-primary-foreground/90' : 'text-accent-foreground'
                    )}
                    onClick={() => segment.taskId && onTaskClick?.(segment.taskId)}
                  >
                    {segment.content}
                  </span>
                );
              }
              return <span key={idx}>{segment.content}</span>;
            })}
          </p>
        </div>

        <span className="text-[10px] text-muted-foreground mt-1">
          {format(new Date(message.created_at), 'HH:mm')}
        </span>
      </div>
    </div>
  );
}
