import { useState } from 'react';
import UserAvatar from '@/components/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  ArrowRight,
  User,
  Reply,
  CornerDownRight
} from 'lucide-react';

export interface Message {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  source_type: 'direct' | 'from_task';
  source_task_id?: string;
  source_task_title?: string;
  user_name?: string;
  avatar_url?: string;
  reply_to?: string;
  reply_to_content?: string;
  reply_to_user_name?: string;
}

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  onTaskClick?: (taskId: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: Message) => void;
}

export default function MessageItem({ message, isOwn, onTaskClick, onDelete, onReply }: MessageItemProps) {
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
        'flex gap-3 mb-4 group',
        isOwn && 'flex-row-reverse'
      )}>
        {/* Avatar */}
        <UserAvatar 
          src={message.avatar_url}
          name={message.user_name}
          size="md"
          className={cn(
            "shadow-sm",
            isOwn ? "ring-2 ring-primary/30" : "ring-2 ring-border"
          )}
          fallbackClassName={cn(
            isOwn 
              ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground' 
              : 'bg-gradient-to-br from-muted to-muted/80'
          )}
        />

        {/* Message Card - Unified Box */}
        <Card className={cn(
          'flex-1 max-w-[80%] overflow-hidden transition-all duration-200 group-hover:shadow-md',
          isOwn 
            ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border-primary/30' 
            : 'bg-card border-border/80'
        )}>
          {/* Header: Sender + Time + Actions */}
          <div className={cn(
            "flex items-center justify-between gap-2 px-3 py-2 border-b",
            isOwn ? "border-primary-foreground/10" : "border-border/50 bg-muted/30"
          )}>
            <div className="flex items-center gap-2 min-w-0">
              <User className={cn(
                "w-3.5 h-3.5 shrink-0",
                isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
              )} />
              <span className={cn(
                "text-sm font-semibold truncate",
                isOwn ? "text-primary-foreground" : "text-foreground"
              )}>
                {isOwn ? 'Bạn' : message.user_name}
              </span>
              <div className={cn(
                "flex items-center gap-1 text-[11px]",
                isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
              )}>
                <Clock className="w-3 h-3" />
                <span title={formattedDateTime}>{formattedTime} · {formattedDate}</span>
              </div>
            </div>

            {/* Actions Menu */}
            <div className="flex items-center gap-1">
              {/* Reply Button */}
              {onReply && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn(
                    "h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
                    isOwn ? "hover:bg-primary-foreground/20" : "hover:bg-muted"
                  )}
                  onClick={() => onReply(message)}
                >
                  <Reply className="w-3.5 h-3.5" />
                </Button>
              )}
              
              {/* Delete Menu (only for own messages) */}
              {isOwn && onDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={cn(
                        "h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
                        "hover:bg-primary-foreground/20"
                      )}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 bg-popover">
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive cursor-pointer"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Xóa tin nhắn
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Reply Reference */}
          {message.reply_to && message.reply_to_content && (
            <div className={cn(
              "px-3 py-2 border-b flex items-start gap-2",
              isOwn 
                ? "bg-primary-foreground/5 border-primary-foreground/10" 
                : "bg-muted/50 border-border/50"
            )}>
              <CornerDownRight className={cn(
                "w-3.5 h-3.5 mt-0.5 shrink-0",
                isOwn ? "text-primary-foreground/50" : "text-muted-foreground"
              )} />
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-[11px] font-medium mb-0.5",
                  isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  Trả lời {message.reply_to_user_name || 'tin nhắn'}
                </p>
                <p className={cn(
                  "text-xs line-clamp-2",
                  isOwn ? "text-primary-foreground/60" : "text-muted-foreground/80"
                )}>
                  {message.reply_to_content}
                </p>
              </div>
            </div>
          )}

          {/* Source label for messages from tasks */}
          {message.source_type === 'from_task' && message.source_task_title && (
            <div className={cn(
              "px-3 py-1.5 border-b flex items-center gap-1.5",
              isOwn 
                ? "bg-primary-foreground/5 border-primary-foreground/10" 
                : "bg-accent/5 border-accent/10"
            )}>
              <MessageSquare className={cn(
                "w-3 h-3",
                isOwn ? "text-primary-foreground/70" : "text-accent"
              )} />
              <span className={cn(
                "text-[11px] font-medium",
                isOwn ? "text-primary-foreground/80" : "text-accent"
              )}>
                Từ Task: {message.source_task_title}
              </span>
            </div>
          )}

          {/* Message Content */}
          <div className="px-3 py-2.5">
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {segments.map((segment, idx) => {
                if (segment.type === 'user-mention' || segment.type === 'assignee-mention') {
                  return (
                    <span 
                      key={idx} 
                      className={cn(
                        'font-semibold px-1.5 py-0.5 rounded-md mx-0.5 inline-block',
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
          </div>

          {/* Footer: Quick action to task */}
          {message.source_type === 'from_task' && message.source_task_id && (
            <div className={cn(
              "px-3 py-2 border-t",
              isOwn ? "border-primary-foreground/10" : "border-border/50 bg-muted/20"
            )}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2.5 text-xs gap-1.5 rounded-md w-full justify-center",
                  isOwn 
                    ? "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10" 
                    : "text-accent hover:text-accent hover:bg-accent/10"
                )}
                onClick={() => onTaskClick?.(message.source_task_id!)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Mở Task
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          )}
        </Card>
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
