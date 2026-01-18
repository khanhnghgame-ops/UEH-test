import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AIAssistantPanel from './AIAssistantPanel';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sparkles, MessageCircle } from 'lucide-react';
import aiLogo from '@/assets/ai-assistant-logo.png';

interface AIAssistantButtonProps {
  projectId?: string;
  projectName?: string;
  zaloLink?: string | null;
}

const TOOLTIP_MESSAGES = [
  "Bạn có câu hỏi gì không?",
  "Tôi có thể giúp gì cho bạn?",
  "Cần hỗ trợ nhanh không?",
  "Hỏi tôi về nội dung bạn đang xem nhé",
  "Bạn đang gặp khó khăn chỗ nào không?",
];

export default function AIAssistantButton({ projectId, projectName, zaloLink }: AIAssistantButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');

  // Get random message
  const getRandomMessage = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * TOOLTIP_MESSAGES.length);
    return TOOLTIP_MESSAGES[randomIndex];
  }, []);

  // Show tooltip every 15 seconds, display for 3 seconds
  useEffect(() => {
    if (isOpen) return;

    const showTooltipCycle = () => {
      setCurrentMessage(getRandomMessage());
      setShowTooltip(true);
      
      // Hide after 3 seconds
      setTimeout(() => {
        setShowTooltip(false);
      }, 3000);
    };

    // Initial show after 5 seconds
    const initialTimeout = setTimeout(showTooltipCycle, 5000);

    // Then show every 15 seconds
    const interval = setInterval(() => {
      if (!isOpen) {
        showTooltipCycle();
      }
    }, 15000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isOpen, getRandomMessage]);

  const handleOpen = () => {
    setIsOpen(true);
    setShowTooltip(false);
  };

  const handleZaloClick = () => {
    if (zaloLink) {
      window.open(zaloLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      {/* Tooltip Bubble - positioned to not cover main content */}
      <div 
        className={cn(
          "fixed bottom-28 right-6 z-40",
          "bg-card/95 backdrop-blur-sm border border-border/80 rounded-2xl shadow-lg",
          "px-4 py-2.5 max-w-[220px]",
          "transition-all duration-300 ease-out",
          "before:content-[''] before:absolute before:bottom-[-6px] before:right-10",
          "before:w-3 before:h-3 before:bg-card/95 before:border-r before:border-b before:border-border/80",
          "before:rotate-45 before:rounded-sm",
          zaloLink ? "bottom-36" : "bottom-28",
          showTooltip && !isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-2 pointer-events-none"
        )}
      >
        <p className="text-sm text-foreground/90 font-medium leading-snug">
          {currentMessage}
        </p>
      </div>

      {/* Floating Buttons Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
        {/* Zalo Contact Button - Above AI Button, smaller */}
        {zaloLink && (
          <Button
            onClick={handleZaloClick}
            size="sm"
            className={cn(
              "relative rounded-full h-12 w-12 shadow-xl p-0",
              "bg-[#0068FF] hover:bg-[#0054CC]",
              "transition-all duration-300 hover:scale-110",
              "group overflow-hidden",
              "ring-2 ring-[#0068FF]/30"
            )}
            title="Liên hệ qua Zalo"
          >
            <MessageCircle className="h-5 w-5 text-white" />
            <span className="sr-only">Liên hệ Zalo</span>
          </Button>
        )}

        {/* AI Button - With continuous subtle animations */}
        <div className="relative">
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
