import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AIAssistantPanel from './AIAssistantPanel';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sparkles, X } from 'lucide-react';
import aiLogo from '@/assets/ai-assistant-logo.png';

interface AIAssistantButtonProps {
  projectId?: string;
  projectName?: string;
}

const TOOLTIP_MESSAGES = [
  "Bạn có câu hỏi gì không?",
  "Cần hỗ trợ gì không?",
  "Hỏi tôi về task nhé!",
];

export default function AIAssistantButton({ projectId, projectName }: AIAssistantButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipIndex, setTooltipIndex] = useState(0);
  const [tooltipDismissCount, setTooltipDismissCount] = useState(0);

  // Show tooltip periodically - more frequent but not spammy
  useEffect(() => {
    if (isOpen || tooltipDismissCount >= 3) return; // Stop after 3 dismissals

    // Show tooltip after 5 seconds initially
    const initialTimeout = setTimeout(() => {
      setShowTooltip(true);
      // Auto-hide after 4 seconds
      setTimeout(() => setShowTooltip(false), 4000);
    }, 5000);

    // Then show every 45 seconds (more frequent than before)
    const interval = setInterval(() => {
      if (!isOpen && tooltipDismissCount < 3) {
        setTooltipIndex(prev => (prev + 1) % TOOLTIP_MESSAGES.length);
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 4000);
      }
    }, 45000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isOpen, tooltipDismissCount]);

  const handleDismissTooltip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip(false);
    setTooltipDismissCount(prev => prev + 1);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setShowTooltip(false);
  };

  return (
    <>
      {/* Tooltip Bubble */}
      {showTooltip && !isOpen && (
        <div 
          className={cn(
            "fixed bottom-28 right-6 z-50",
            "bg-card border border-border rounded-2xl shadow-xl",
            "px-4 py-3 max-w-[200px]",
            "animate-fade-in",
            "before:content-[''] before:absolute before:bottom-[-8px] before:right-10",
            "before:border-8 before:border-transparent before:border-t-card"
          )}
        >
          <button
            onClick={handleDismissTooltip}
            className="absolute -top-2 -right-2 w-5 h-5 bg-muted rounded-full flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
          <p className="text-sm text-foreground font-medium">
            {TOOLTIP_MESSAGES[tooltipIndex]}
          </p>
        </div>
      )}

      {/* AI Button - With continuous subtle animations */}
      <div className="fixed bottom-6 right-6 z-50">
        {/* Animated ring pulse effect */}
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-[-4px] rounded-full bg-gradient-to-r from-primary/40 to-primary/20 animate-spin" style={{ animationDuration: '8s' }} />
        
        <Button
          onClick={handleOpen}
          size="lg"
          className={cn(
            "relative rounded-full h-20 w-20 shadow-2xl p-0",
            "bg-gradient-to-br from-primary via-primary to-primary/80",
            "hover:from-primary/90 hover:to-primary/70",
            "transition-all duration-300 hover:scale-110",
            "group overflow-hidden",
            "ring-4 ring-primary/30"
          )}
        >
          {/* Inner glow effect */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-white/10 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <Avatar className="h-14 w-14 transition-transform group-hover:scale-110 animate-float">
            <AvatarImage src={aiLogo} alt="AI Assistant" className="object-cover" />
            <AvatarFallback className="bg-transparent">
              <Sparkles className="h-8 w-8 text-primary-foreground" />
            </AvatarFallback>
          </Avatar>
          <span className="sr-only">Mở trợ lý AI</span>
        </Button>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-3px) scale(1.02);
          }
        }
        
        .animate-float {
          animation: float 2.5s ease-in-out infinite;
        }
      `}</style>

      <AIAssistantPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectId={projectId}
        projectName={projectName}
      />
    </>
  );
}
