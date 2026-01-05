import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { renderMessageContent } from '@/lib/messageParser';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
  MessageSquare, 
  ExternalLink, 
  MoreHorizontal, 
  Trash2, 
  Clock,
  ArrowRight
} from 'lucide-react';

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
  onDelete?: (messageId: string) => void;
}

export default function MessageItem({ message, isOwn, onTaskClick, onDelete }: MessageItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const segments = renderMessageContent(message.content);

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(message.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const formattedTime = format(new Date(message.created_at), 'HH:mm');
  const formattedDate = format(new Date(message.created_at), 'dd/MM/yyyy', { locale: vi });
  const formattedDateTime = format(new Date(message.created_at), "EEEE, dd/MM/yyyy 'lúc' HH:mm", { locale: vi });

  return (
    <>
      <div className={cn(
        'flex gap-3 mb-5 group',
        isOwn && 'flex-row-reverse'
      )}>
        {/* Avatar */}
        <div className="flex flex-col items-center gap-1">
          <Avatar className={cn(
            "w-10 h-10 shrink-0 transition-transform group-hover:scale-105 shadow-md",
            isOwn 
              ? "ring-2 ring-primary/30" 
              : "ring-2 ring-border"
          )}>
            <AvatarFallback className={cn(
              'text-xs font-semibold',
              isOwn 
                ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground' 
                : 'bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground'
            )}>
              {getInitials(message.user_name || 'U')}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className={cn('flex flex-col max-w-[75%]', isOwn && 'items-end')}>
          {/* Header: Sender name + Time */}
          <div className={cn(
            "flex items-center gap-2 mb-1.5 px-1",
            isOwn && "flex-row-reverse"
          )}>
            <span className={cn(
              "text-sm font-semibold",
              isOwn ? "text-primary" : "text-foreground"
            )}>
              {isOwn ? 'Bạn' : message.user_name}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span title={formattedDateTime}>{formattedTime}</span>
              <span>·</span>
              <span>{formattedDate}</span>
            </div>
          </div>

          {/* Source label for messages from tasks */}
          {message.source_type === 'from_task' && message.source_task_title && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-[11px] px-2.5 py-1 mb-2 gap-1.5",
                "bg-accent/5 text-accent border-accent/20",
                isOwn && "self-end"
              )}
            >
              <MessageSquare className="w-3 h-3" />
              Từ Task: {message.source_task_title}
            </Badge>
          )}

          {/* Message Bubble */}
          <div className={cn(
            'relative px-4 py-3 rounded-2xl shadow-sm transition-all duration-200',
            'group-hover:shadow-md',
            isOwn 
              ? 'bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground rounded-tr-md' 
              : 'bg-card border border-border/80 rounded-tl-md'
          )}>
            {/* Message Content */}
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {segments.map((segment, idx) => {
                if (segment.type === 'user-mention' || segment.type === 'assignee-mention') {
                  return (
                    <span 
                      key={idx} 
                      className={cn(
                        'font-semibold px-1.5 py-0.5 rounded-md mx-0.5 inline-block',
                        isOwn 
                          ? 'text-primary-foreground bg-white/20' 
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
                        'font-medium cursor-pointer underline underline-offset-2 decoration-dotted transition-colors mx-0.5',
                        isOwn 
                          ? 'text-primary-foreground/90 hover:text-primary-foreground decoration-primary-foreground/50' 
                          : 'text-accent hover:text-accent/80 decoration-accent/50'
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

            {/* Actions Menu (only for own messages) */}
            {isOwn && onDelete && (
              <div className={cn(
                "absolute -left-8 top-1/2 -translate-y-1/2",
                "opacity-0 group-hover:opacity-100 transition-opacity"
              )}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 rounded-full bg-background/80 shadow-sm hover:bg-background"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive cursor-pointer"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Xóa tin nhắn
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Footer: Quick action to task */}
          {message.source_type === 'from_task' && message.source_task_id && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "mt-2 h-8 px-3 text-xs gap-1.5 rounded-lg",
                "text-muted-foreground hover:text-accent hover:bg-accent/10",
                isOwn && "self-end"
              )}
              onClick={() => onTaskClick?.(message.source_task_id!)}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Mở Task
              <ArrowRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa tin nhắn?</AlertDialogTitle>
            <AlertDialogDescription>
              Tin nhắn này sẽ bị xóa vĩnh viễn và không thể khôi phục. Bạn có chắc chắn muốn xóa?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa tin nhắn'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
