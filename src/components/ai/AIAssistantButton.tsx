import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AIAssistantPanel from './AIAssistantPanel';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sparkles } from 'lucide-react';
import aiLogo from '@/assets/ai-assistant-logo.png';

interface AIAssistantButtonProps {
  projectId?: string;
  projectName?: string;
}

export default function AIAssistantButton({ projectId, projectName }: AIAssistantButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        size="lg"
        className={cn(
          "fixed bottom-6 right-6 z-50 rounded-full h-14 w-14 shadow-lg p-0",
          "bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70",
          "transition-all duration-300 hover:scale-105 hover:shadow-xl",
          "group overflow-hidden"
        )}
      >
        <Avatar className="h-10 w-10 transition-transform group-hover:scale-110">
          <AvatarImage src={aiLogo} alt="AI Assistant" className="object-cover" />
          <AvatarFallback className="bg-transparent">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </AvatarFallback>
        </Avatar>
        <span className="sr-only">Mở trợ lý AI</span>
      </Button>

      <AIAssistantPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectId={projectId}
        projectName={projectName}
      />
    </>
  );
}
