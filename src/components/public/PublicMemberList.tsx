import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Users, Download } from 'lucide-react';
import type { GroupMember } from '@/types/database';
import { exportMembersToExcel, getRoleDisplayName } from '@/lib/excelExport';

interface PublicMemberListProps {
  members: GroupMember[];
}

export default function PublicMemberList({ members }: PublicMemberListProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleExport = () => {
    const exportData = members.map(m => ({
      fullName: m.profiles?.full_name || '',
      studentId: m.profiles?.student_id || '',
      email: m.profiles?.email || '',
      role: getRoleDisplayName(m.role)
    }));
    exportMembersToExcel(exportData, 'danh-sach-thanh-vien-project');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Thành viên Project ({members.length})
          </CardTitle>
          {members.length > 0 && (
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Xuất Excel</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Chưa có thành viên</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map(member => (
              <div key={member.id} className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors">
                <UserAvatar 
                  src={member.profiles?.avatar_url}
                  name={member.profiles?.full_name}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{member.profiles?.full_name || 'Unknown'}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    MSSV: {member.profiles?.student_id}
                  </div>
                </div>
                <Badge 
                  variant={member.role === 'leader' ? 'default' : 'secondary'} 
                  className={`shrink-0 ${member.role === 'leader' ? 'bg-primary' : ''}`}
                >
                  {member.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
