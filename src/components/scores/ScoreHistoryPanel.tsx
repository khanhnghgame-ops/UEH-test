import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { GroupMember } from '@/types/database';
import type { ScoreAdjustmentHistory } from '@/types/processScores';
import UserAvatar from '@/components/UserAvatar';

interface ScoreHistoryPanelProps {
  history: ScoreAdjustmentHistory[];
  members: GroupMember[];
  isLeader: boolean;
}

export default function ScoreHistoryPanel({
  history,
  members,
  isLeader,
}: ScoreHistoryPanelProps) {
  const getMemberProfile = (userId: string) => members.find(m => m.user_id === userId)?.profiles;

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'task': return 'Task';
      case 'stage': return 'Giai đoạn';
      case 'final': return 'Điểm cuối';
      default: return type;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'task': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'stage': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'final': return 'bg-primary/10 text-primary border-primary/20';
      default: return '';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử điều chỉnh</CardTitle>
        <CardDescription>
          {isLeader 
            ? 'Tất cả lịch sử điều chỉnh điểm trong project' 
            : 'Lịch sử điều chỉnh điểm của bạn'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Chưa có lịch sử điều chỉnh
          </p>
        ) : (
          <div className="space-y-4">
            {history.map((item) => {
              const memberProfile = getMemberProfile(item.user_id);
              const adjusterProfile = getMemberProfile(item.adjusted_by);

              return (
                <div 
                  key={item.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                >
                  {/* Member Avatar */}
                  <UserAvatar 
                    src={memberProfile?.avatar_url}
                    name={memberProfile?.full_name}
                    size="md"
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{memberProfile?.full_name || 'Thành viên'}</span>
                      <Badge variant="outline" className={getTypeBadgeColor(item.adjustment_type)}>
                        {getTypeLabel(item.adjustment_type)}
                      </Badge>
                    </div>

                    {/* Score change */}
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {item.previous_score?.toFixed(1) ?? '100'}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">
                        {item.new_score?.toFixed(1) ?? '100'}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={item.adjustment > 0 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : 'bg-red-50 text-red-700 border-red-200'
                        }
                      >
                        {item.adjustment > 0 ? (
                          <TrendingUp className="w-3 h-3 mr-1" />
                        ) : (
                          <TrendingDown className="w-3 h-3 mr-1" />
                        )}
                        {item.adjustment > 0 ? '+' : ''}{item.adjustment}
                      </Badge>
                    </div>

                    {/* Reason */}
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {item.reason}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Điều chỉnh bởi {adjusterProfile?.full_name || 'Leader'}</span>
                      <span>•</span>
                      <span>{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
