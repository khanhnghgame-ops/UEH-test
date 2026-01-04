import { useState, useEffect } from 'react';
import { Bell, Trash2, Check, Clock, AlertCircle, CheckCircle2, Send, UserPlus, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  user_id: string;
  type: 'task_assigned' | 'task_deadline' | 'task_updated' | 'task_verified' | 'task_submitted';
  title: string;
  message: string | null;
  task_id: string | null;
  group_id: string | null;
  is_read: boolean;
  created_at: string;
  tasks?: {
    title: string;
    deadline: string | null;
    status: string;
    groups?: {
      name: string;
    };
  } | null;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [hasNewNotification, setHasNewNotification] = useState(false);

  // Fetch notifications
  const fetchNotifications = async (loadAll = false) => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      let query = supabase
        .from('notifications')
        .select(`
          *,
          tasks (
            title,
            deadline,
            status,
            groups (name)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // If not loading all, only get recent unread or last 7 days
      if (!loadAll) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        query = query.or(`is_read.eq.false,created_at.gte.${sevenDaysAgo.toISOString()}`);
      }
      
      query = query.limit(loadAll ? 50 : 20);

      const { data, error } = await query;

      if (error) throw error;
      
      setNotifications(data as Notification[] || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch and realtime subscription
  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    // Subscribe to realtime notifications
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Trigger animation
          setHasNewNotification(true);
          setTimeout(() => setHasNewNotification(false), 2000);
          
          // Refetch to get full notification with task details
          fetchNotifications(showAll);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, showAll]);

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Delete single notification
  const deleteNotification = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      toast.success('Đã xóa thông báo');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Không thể xóa thông báo');
    }
  };

  // Delete all notifications
  const deleteAllNotifications = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);

      setNotifications([]);
      setUnreadCount(0);
      toast.success('Đã xóa tất cả thông báo');
    } catch (error) {
      console.error('Error deleting all notifications:', error);
      toast.error('Không thể xóa thông báo');
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('Đã đánh dấu tất cả đã đọc');
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_assigned':
        return <UserPlus className="w-4 h-4 text-primary" />;
      case 'task_deadline':
        return <Clock className="w-4 h-4 text-warning" />;
      case 'task_updated':
        return <Edit className="w-4 h-4 text-blue-500" />;
      case 'task_verified':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'task_submitted':
        return <Send className="w-4 h-4 text-primary" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTimeRemaining = (deadline: string | null) => {
    if (!deadline) return null;
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diff = deadlineDate.getTime() - now.getTime();
    
    if (diff < 0) return <span className="text-destructive text-xs">Quá hạn</span>;
    if (diff < 24 * 60 * 60 * 1000) return <span className="text-warning text-xs">Sắp hết hạn</span>;
    return null;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative text-white hover:bg-white/10 transition-all",
            hasNewNotification && "animate-pulse"
          )}
        >
          <Bell className={cn(
            "w-5 h-5 transition-transform",
            hasNewNotification && "animate-[wiggle_0.5s_ease-in-out_3]"
          )} />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1.5 bg-destructive text-destructive-foreground text-xs font-bold"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-96 p-0" 
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold text-foreground">Thông báo</h4>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs h-7"
              >
                <Check className="w-3 h-3 mr-1" />
                Đọc tất cả
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={deleteAllNotifications}
                className="text-xs h-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Xóa tất cả
              </Button>
            )}
          </div>
        </div>

        {/* Notification List */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Đang tải...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Không có thông báo</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-4 hover:bg-muted/50 cursor-pointer transition-colors group relative",
                    !notification.is_read && "bg-primary/5"
                  )}
                  onClick={() => {
                    if (!notification.is_read) markAsRead(notification.id);
                  }}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm",
                          !notification.is_read && "font-semibold"
                        )}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      {notification.message && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                      )}
                      {notification.tasks && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {notification.tasks.groups?.name || 'Project'}
                          </Badge>
                          {getTimeRemaining(notification.tasks.deadline)}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: vi,
                        })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={(e) => deleteNotification(notification.id, e)}
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && !showAll && (
          <div className="p-3 border-t">
            <Button
              variant="ghost"
              className="w-full text-sm"
              onClick={() => {
                setShowAll(true);
                fetchNotifications(true);
              }}
            >
              Xem tất cả thông báo
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}