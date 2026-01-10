import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  avatarUrl?: string | null;
  fullName?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'h-5 w-5',
  sm: 'h-7 w-7',
  md: 'h-10 w-10',
  lg: 'h-16 w-16',
  xl: 'h-20 w-20',
};

const textSizeClasses = {
  xs: 'text-[8px]',
  sm: 'text-[10px]',
  md: 'text-sm',
  lg: 'text-xl',
  xl: 'text-2xl',
};

const getInitials = (name: string | null | undefined) => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export default function UserAvatar({ avatarUrl, fullName, size = 'md', className }: UserAvatarProps) {
  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {avatarUrl && (
        <AvatarImage 
          src={avatarUrl} 
          alt={fullName || 'User avatar'} 
          className="object-cover"
        />
      )}
      <AvatarFallback className={cn(
        'bg-primary/10 text-primary font-medium',
        textSizeClasses[size]
      )}>
        {getInitials(fullName)}
      </AvatarFallback>
    </Avatar>
  );
}
