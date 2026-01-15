import { LayoutDashboard, Layers, Users, Activity, Settings, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isLeaderInGroup: boolean;
  isGroupCreator: boolean;
  membersCount: number;
}

interface NavTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  showAlways?: boolean;
}

const tabs: NavTab[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard, showAlways: true },
  { id: 'tasks', label: 'Task & Giai đoạn', icon: Layers, showAlways: true },
  { id: 'members', label: 'Thành viên', icon: Users, showAlways: true },
  { id: 'scores', label: 'Điểm quá trình', icon: Award, showAlways: true },
  { id: 'logs', label: 'Nhật ký', icon: Activity, showAlways: true },
  { id: 'settings', label: 'Cài đặt', icon: Settings, showAlways: false },
];

export default function ProjectNavigation({
  activeTab,
  onTabChange,
  isLeaderInGroup,
  isGroupCreator,
  membersCount,
}: ProjectNavigationProps) {
  const visibleTabs = tabs.filter(tab => 
    tab.showAlways || (tab.id === 'settings' && isLeaderInGroup && isGroupCreator)
  );

  return (
    <div className="w-full bg-gradient-to-r from-primary/8 via-primary/5 to-primary/8 border-b border-primary/15 sticky top-14 z-40 backdrop-blur-sm bg-background/95">
      <div className="max-w-[1600px] mx-auto px-4 flex items-center justify-between">
        {/* Spacer to match logo area width */}
        <div className="hidden md:block w-[140px] shrink-0" />
        
        {/* Center: Navigation tabs */}
        <nav className="flex-1 flex items-center justify-center overflow-x-auto scrollbar-hide">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-200",
                  "hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )} />
                
                <span>{tab.label}</span>
                
                {/* Member count badge */}
                {tab.id === 'members' && (
                  <span className={cn(
                    "ml-1 px-1.5 py-0.5 text-xs rounded-full transition-colors",
                    isActive 
                      ? "bg-primary/20 text-primary" 
                      : "bg-muted text-muted-foreground"
                  )}>
                    {membersCount}
                  </span>
                )}
                
                {/* Active indicator - bottom line */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
        
        {/* Spacer to match user area width */}
        <div className="hidden md:block w-[140px] shrink-0" />
      </div>
    </div>
  );
}
