import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import UserPresenceIndicator from './UserPresenceIndicator';
import type { PresenceStatus } from '@/hooks/useUserPresence';

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  fallbackClassName?: string;
  iconClassName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showPresence?: boolean;
  presenceStatus?: PresenceStatus;
}

const sizeClasses = {
  xs: 'h-5 w-5',
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
  xl: 'h-20 w-20',
};

const iconSizeClasses = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-6 h-6',
  xl: 'w-10 h-10',
};

const presenceSizeMap: Record<string, 'xs' | 'sm' | 'md'> = {
  xs: 'xs',
  sm: 'xs',
  md: 'sm',
  lg: 'sm',
  xl: 'md',
};

const presencePositionClasses = {
  xs: '-bottom-0.5 -right-0.5',
  sm: '-bottom-0.5 -right-0.5',
  md: '-bottom-0.5 -right-0.5',
  lg: '-bottom-1 -right-1',
  xl: '-bottom-1 -right-1',
};

/**
 * UserAvatar - Unified avatar component that always shows user image or a generic user icon.
 * NEVER shows initials/text as fallback - always uses the User icon for consistency.
 * Supports optional presence indicator.
 */
export default function UserAvatar({ 
  src, 
  name, 
  className, 
  fallbackClassName,
  iconClassName,
  size = 'md',
  showPresence = false,
  presenceStatus = 'offline'
}: UserAvatarProps) {
  return (
    <div className="relative inline-flex">
      <Avatar className={cn(sizeClasses[size], className)}>
        {src && (
          <AvatarImage 
            src={src} 
            alt={name || 'User avatar'} 
            className="object-cover"
          />
        )}
        <AvatarFallback 
          className={cn(
            'bg-muted/80 text-muted-foreground',
            fallbackClassName
          )}
        >
          <User className={cn(iconSizeClasses[size], iconClassName)} />
        </AvatarFallback>
      </Avatar>
      {showPresence && (
        <span className={cn('absolute', presencePositionClasses[size])}>
          <UserPresenceIndicator 
            status={presenceStatus} 
            size={presenceSizeMap[size]}
          />
        </span>
      )}
    </div>
  );
}
