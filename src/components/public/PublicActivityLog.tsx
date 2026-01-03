import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, FileText, Users, Layers, CheckCircle, Edit, Trash } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface ActivityLog {
  id: string;
  action: string;
  action_type: string;
  description: string | null;
  user_name: string;
  created_at: string;
}

interface PublicActivityLogProps {
  logs: ActivityLog[];
}

export default function PublicActivityLog({ logs }: PublicActivityLogProps) {
  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'task':
        return <FileText className="w-4 h-4" />;
      case 'member':
        return <Users className="w-4 h-4" />;
      case 'stage':
        return <Layers className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('DELETE') || action.includes('XÓA')) {
      return 'bg-destructive/10 text-destructive';
    }
    if (action.includes('CREATE') || action.includes('TẠO') || action.includes('ADD')) {
      return 'bg-success/10 text-success';
    }
    if (action.includes('UPDATE') || action.includes('EDIT') || action.includes('SỬA')) {
      return 'bg-warning/10 text-warning';
    }
    return 'bg-primary/10 text-primary';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Nhật ký hoạt động
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Chưa có hoạt động</p>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div 
                  key={log.id} 
                  className="flex gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  {/* Timeline indicator */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getActionColor(log.action)}`}>
                      {getActionIcon(log.action_type)}
                    </div>
                    {index < logs.length - 1 && (
                      <div className="w-px h-full bg-border mt-2 min-h-[20px]" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm">
                          <span className="font-medium">{log.user_name}</span>
                          {' '}
                          <span className="text-muted-foreground">{log.action}</span>
                        </p>
                        {log.description && (
                          <p className="text-sm text-muted-foreground mt-1">{log.description}</p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground text-right shrink-0">
                        <div>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: vi })}</div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                        </div>
                      </div>
                    </div>
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
