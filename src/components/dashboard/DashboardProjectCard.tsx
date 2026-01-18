import { Link } from 'react-router-dom';
import { ArrowRight, FolderKanban, Users } from 'lucide-react';
import type { Group, GroupMember } from '@/types/database';
import UserAvatar from '@/components/UserAvatar';
import UserPresenceIndicator from '@/components/UserPresenceIndicator';
import { useUserPresence } from '@/hooks/useUserPresence';

interface DashboardProjectCardProps {
  group: Group;
  members: GroupMember[];
  canViewMembers: boolean;
  onMemberClick: (member: GroupMember) => void;
}

export default function DashboardProjectCard({
  group,
  members,
  canViewMembers,
  onMemberClick,
}: DashboardProjectCardProps) {
  const { getPresenceStatus } = useUserPresence(group.id);
  const onlineCount = members.filter((m) => getPresenceStatus(m.user_id) === 'online').length;

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Project Header - Clickable */}
      <Link
        to={`/p/${group.slug}`}
        className="group flex items-center gap-4 p-4 bg-card hover:bg-muted/30 transition-all"
      >
        {/* Thumbnail */}
        <div className="relative w-20 h-20 flex-shrink-0 rounded-xl bg-muted overflow-hidden">
          {group.image_url ? (
            <img
              src={group.image_url}
              alt={group.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <FolderKanban className="w-8 h-8 text-primary/40" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
            {group.name}
          </h3>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {group.description || 'Không có mô tả'}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {members.length} thành viên
            </span>
            {onlineCount > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {onlineCount} online
              </span>
            )}
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
      </Link>

      {/* Members Row */}
      {members.length > 0 && canViewMembers && (
        <div className="px-4 py-3 bg-muted/20 border-t">
          <div className="flex items-center gap-2 flex-wrap">
            {members.slice(0, 8).map((member) => {
              const status = getPresenceStatus(member.user_id);
              const title = `${member.profiles?.full_name || 'Thành viên'} - ${
                status === 'online' ? 'Đang hoạt động' : status === 'idle' ? 'Không hoạt động' : 'Offline'
              }`;

              return (
                <div
                  key={member.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMemberClick(member);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  title={title}
                >
                  <div className="relative">
                    <UserAvatar
                      src={member.profiles?.avatar_url}
                      name={member.profiles?.full_name}
                      size="sm"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <UserPresenceIndicator status={status} size="xs" />
                    </div>
                  </div>
                  <span className="text-xs font-medium truncate max-w-20 hidden sm:block">
                    {member.profiles?.full_name?.split(' ').pop()}
                  </span>
                </div>
              );
            })}

            {members.length > 8 && (
              <span className="text-xs text-muted-foreground px-2">+{members.length - 8} khác</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
