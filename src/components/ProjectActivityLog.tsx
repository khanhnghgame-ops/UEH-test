import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import UserAvatar from '@/components/UserAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { 
  Activity, 
  UserPlus, 
  UserMinus, 
  Edit, 
  Trash2, 
  Plus, 
  CheckCircle,
  AlertCircle,
  Layers,
  FileText,
  Clock
} from 'lucide-react';

interface ActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  action_type: string;
  description: string | null;
  created_at: string;
  metadata: any;
  avatar_url?: string;
}

interface ProjectActivityLogProps {
  groupId: string;
}

export default function ProjectActivityLog({ groupId }: ProjectActivityLogProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [groupId]);

  const fetchLogs = async () => {
    try {
      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        // Fetch avatars for all unique user_ids
        const userIds = [...new Set(data.map(log => log.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', userIds);

        const avatarMap = new Map(profiles?.map(p => [p.id, p.avatar_url]) || []);
        
        const logsWithAvatars = data.map(log => ({
          ...log,
          avatar_url: avatarMap.get(log.user_id) || null
        }));
        
        setLogs(logsWithAvatars as ActivityLog[]);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'ADD_MEMBER':
      case 'CREATE_AND_ADD_MEMBER':
        return <UserPlus className="w-4 h-4 text-success" />;
      case 'REMOVE_MEMBER':
        return <UserMinus className="w-4 h-4 text-destructive" />;
      case 'UPDATE_MEMBER':
        return <Edit className="w-4 h-4 text-warning" />;
      case 'CREATE_STAGE':
        return <Plus className="w-4 h-4 text-primary" />;
      case 'UPDATE_STAGE':
        return <Layers className="w-4 h-4 text-warning" />;
      case 'DELETE_STAGE':
        return <Trash2 className="w-4 h-4 text-destructive" />;
      case 'CREATE_TASK':
        return <Plus className="w-4 h-4 text-primary" />;
      case 'UPDATE_TASK':
        return <FileText className="w-4 h-4 text-warning" />;
      case 'DELETE_TASK':
        return <Trash2 className="w-4 h-4 text-destructive" />;
      case 'SUBMISSION':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'LATE_SUBMISSION':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActionBadge = (actionType: string) => {
    switch (actionType) {
      case 'member':
        return <Badge variant="secondary" className="text-xs">Thành viên</Badge>;
      case 'stage':
        return <Badge className="bg-primary/10 text-primary text-xs">Giai đoạn</Badge>;
      case 'task':
        return <Badge className="bg-warning/10 text-warning text-xs">Task</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{actionType}</Badge>;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Đang tải nhật ký hoạt động...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Nhật ký hoạt động
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Chưa có hoạt động nào được ghi nhận</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {logs.map((log, index) => (
                <div key={log.id} className="relative flex gap-4">
                  {/* Timeline line */}
                  {index < logs.length - 1 && (
                    <div className="absolute left-5 top-10 w-0.5 h-full bg-border" />
                  )}
                  
                  {/* Avatar */}
                  <UserAvatar 
                    src={log.avatar_url}
                    name={log.user_name.split('@')[0]}
                    size="md"
                    className="border-2 border-background z-10 flex-shrink-0"
                  />
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {getActionIcon(log.action)}
                        <span className="font-medium text-sm">{log.user_name.split('@')[0]}</span>
                      </div>
                      {getActionBadge(log.action_type)}
                    </div>
                    
                    {log.description && (
                      <p className="text-sm text-muted-foreground mt-1">{log.description}</p>
                    )}
                    
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {formatTime(log.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
