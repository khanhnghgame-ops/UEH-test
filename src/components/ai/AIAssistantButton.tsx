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
];

export default function AIAssistantButton({ projectId, projectName }: AIAssistantButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);

  // Show tooltip periodically (not too often)
  useEffect(() => {
    if (isOpen || tooltipDismissed) return;

    // Show tooltip after 10 seconds initially
    const initialTimeout = setTimeout(() => {
      setShowTooltip(true);
      // Auto-hide after 5 seconds
      setTimeout(() => setShowTooltip(false), 5000);
    }, 10000);

    // Then show every 2 minutes
    const interval = setInterval(() => {
      if (!isOpen && !tooltipDismissed) {
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 5000);
      }
    }, 120000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isOpen, tooltipDismissed]);

  const handleDismissTooltip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip(false);
    setTooltipDismissed(true);
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
            "fixed bottom-24 right-6 z-50",
            "bg-card border border-border rounded-2xl shadow-xl",
            "px-4 py-3 max-w-[200px]",
            "animate-fade-in",
            "before:content-[''] before:absolute before:bottom-[-8px] before:right-8",
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
            {TOOLTIP_MESSAGES[0]}
          </p>
        </div>
      )}

      {/* AI Button - Larger and more prominent */}
      <Button
        onClick={handleOpen}
        size="lg"
        className={cn(
          "fixed bottom-6 right-6 z-50 rounded-full h-20 w-20 shadow-2xl p-0",
          "bg-gradient-to-br from-primary via-primary to-primary/80",
          "hover:from-primary/90 hover:to-primary/70",
          "transition-all duration-300 hover:scale-110 hover:shadow-2xl",
          "group overflow-hidden",
          "ring-4 ring-primary/30"
        )}
        style={{
          animation: 'breathe 3s ease-in-out infinite',
        }}
      >
        <Avatar className="h-14 w-14 transition-transform group-hover:scale-110">
          <AvatarImage src={aiLogo} alt="AI Assistant" className="object-cover" />
          <AvatarFallback className="bg-transparent">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </AvatarFallback>
        </Avatar>
        <span className="sr-only">Mở trợ lý AI</span>
      </Button>

      <style>{`
        @keyframes breathe {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(var(--primary), 0.4), 0 10px 25px -5px rgba(0,0,0,0.2);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(var(--primary), 0), 0 20px 35px -5px rgba(0,0,0,0.3);
          }
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
