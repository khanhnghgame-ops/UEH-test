import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  fallbackClassName?: string;
  iconClassName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
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

/**
 * UserAvatar - Unified avatar component that always shows user image or a generic user icon.
 * NEVER shows initials/text as fallback - always uses the User icon for consistency.
 */
export default function UserAvatar({ 
  src, 
  name, 
  className, 
  fallbackClassName,
  iconClassName,
  size = 'md' 
}: UserAvatarProps) {
  return (
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
  );
}
