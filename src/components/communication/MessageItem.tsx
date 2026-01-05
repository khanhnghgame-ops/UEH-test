import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { renderMessageContent } from '@/lib/messageParser';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { MessageSquare, ExternalLink } from 'lucide-react';

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
    <div className={cn(
      'flex gap-3 mb-4 group',
      isOwn && 'flex-row-reverse'
    )}>
      {/* Avatar */}
      <Avatar className={cn(
        "w-9 h-9 shrink-0 transition-transform group-hover:scale-105",
        isOwn ? "ring-2 ring-primary/20" : "ring-2 ring-muted"
      )}>
        <AvatarFallback className={cn(
          'text-xs font-medium',
          isOwn 
            ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground' 
            : 'bg-gradient-to-br from-muted to-muted/80 text-muted-foreground'
        )}>
          {getInitials(message.user_name || 'U')}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex flex-col max-w-[70%]', isOwn && 'items-end')}>
        {/* Sender name (only for others) */}
        {!isOwn && (
          <span className="text-xs font-medium text-muted-foreground mb-1 ml-1">
            {message.user_name}
          </span>
        )}

        {/* Source label for messages from tasks */}
        {message.source_type === 'from_task' && message.source_task_title && (
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] px-2 py-0.5 mb-1.5 cursor-pointer transition-colors",
              "bg-accent/10 text-accent border-accent/20 hover:bg-accent/20",
              isOwn && "self-end"
            )}
            onClick={() => message.source_task_id && onTaskClick?.(message.source_task_id)}
          >
            <MessageSquare className="w-3 h-3 mr-1" />
            Task: {message.source_task_title}
            <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-60" />
          </Badge>
        )}

        {/* Message Bubble */}
        <div className={cn(
          'px-4 py-2.5 rounded-2xl shadow-sm transition-shadow group-hover:shadow-md',
          isOwn 
            ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-md' 
            : 'bg-card border border-border rounded-bl-md'
        )}>
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {segments.map((segment, idx) => {
              if (segment.type === 'user-mention' || segment.type === 'assignee-mention') {
                return (
                  <span 
                    key={idx} 
                    className={cn(
                      'font-semibold px-1 py-0.5 rounded',
                      isOwn 
                        ? 'text-primary-foreground bg-primary-foreground/20' 
                        : 'text-primary bg-primary/10'
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
                      'font-medium cursor-pointer underline underline-offset-2 decoration-dotted transition-colors',
                      isOwn 
                        ? 'text-primary-foreground/90 hover:text-primary-foreground' 
                        : 'text-accent hover:text-accent/80'
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

        {/* Timestamp */}
        <span className={cn(
          "text-[10px] text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
          isOwn ? "mr-1" : "ml-1"
        )}>
          {format(new Date(message.created_at), 'HH:mm')}
        </span>
      </div>
    </div>
  );
}
