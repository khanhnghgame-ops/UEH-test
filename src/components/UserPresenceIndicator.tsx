import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PresenceStatus } from '@/hooks/useUserPresence';

interface UserPresenceIndicatorProps {
  status: PresenceStatus;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const statusConfig: Record<PresenceStatus, { color: string; label: string; ringColor: string }> = {
  online: { 
    color: 'bg-green-500', 
    label: 'Đang online',
    ringColor: 'ring-green-500/30'
  },
  idle: { 
    color: 'bg-yellow-500', 
    label: 'Không hoạt động',
    ringColor: 'ring-yellow-500/30'
  },
  offline: { 
    color: 'bg-gray-400', 
    label: 'Offline',
    ringColor: 'ring-gray-400/30'
  },
};

const sizeConfig = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
};

export default function UserPresenceIndicator({ 
  status, 
  size = 'sm', 
  showLabel = false,
  className 
}: UserPresenceIndicatorProps) {
  const config = statusConfig[status];
  const sizeClass = sizeConfig[size];

  const indicator = (
    <span 
      className={cn(
        'rounded-full ring-2 ring-background flex-shrink-0',
        config.color,
        sizeClass,
        status === 'online' && 'animate-pulse',
        className
      )}
    />
  );

  if (showLabel) {
    return (
      <div className="flex items-center gap-1.5">
        {indicator}
        <span className="text-[10px] text-muted-foreground">{config.label}</span>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {indicator}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
