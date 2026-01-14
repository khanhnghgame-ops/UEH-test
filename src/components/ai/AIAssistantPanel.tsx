import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Loader2, Sparkles, User, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import aiLogo from '@/assets/ai-assistant-logo.png';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
}

// Usage limits (must match backend)
const MAX_MESSAGE_LENGTH = 500;
const MAX_QUESTIONS_PER_DAY = 50;

const SUGGESTED_QUESTIONS = [
  "Công việc nào của tôi sắp đến hạn?",
  "Ai đang làm task nào?",
  "Tiến độ project hiện tại ra sao?",
  "Có task nào đang trễ không?",
];

// Simple local storage key for tracking daily usage
const getUsageKey = (userId: string) => `ai_usage_${userId}_${new Date().toDateString()}`;

export default function AIAssistantPanel({ 
  isOpen, 
  onClose, 
  projectId,
  projectName 
}: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionsToday, setQuestionsToday] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, profile } = useAuth();
  const { toast } = useToast();

  // Load usage count from localStorage
  useEffect(() => {
    if (user?.id) {
      const usageKey = getUsageKey(user.id);
      const stored = localStorage.getItem(usageKey);
      setQuestionsToday(stored ? parseInt(stored, 10) : 0);
    }
  }, [user?.id, isOpen]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const incrementUsage = () => {
    if (user?.id) {
      const usageKey = getUsageKey(user.id);
      const newCount = questionsToday + 1;
      localStorage.setItem(usageKey, newCount.toString());
      setQuestionsToday(newCount);
    }
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    // Check message length
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      toast({
        title: 'Câu hỏi quá dài',
        description: `Vui lòng giới hạn câu hỏi trong ${MAX_MESSAGE_LENGTH} ký tự.`,
        variant: 'destructive',
      });
      return;
    }

    // Check daily limit
    if (questionsToday >= MAX_QUESTIONS_PER_DAY) {
      toast({
        title: 'Đã hết lượt hỏi hôm nay',
        description: `Bạn đã sử dụng ${MAX_QUESTIONS_PER_DAY} câu hỏi. Vui lòng quay lại ngày mai.`,
        variant: 'destructive',
      });
      return;
    }

    setError(null);
    const userMessage: Message = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let assistantContent = '';

    try {
      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/team-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: session?.access_token 
              ? `Bearer ${session.access_token}` 
              : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({
              role: m.role,
              content: m.content,
            })),
            projectId: projectId || undefined,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Increment usage count on successful request
      incrementUsage();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      // Add empty assistant message to update progressively
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                if (updated[updated.length - 1]?.role === 'assistant') {
                  updated[updated.length - 1] = { 
                    role: 'assistant', 
                    content: assistantContent 
                  };
                }
                return updated;
              });
            }
          } catch {
            // Incomplete JSON, put back and wait
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw || raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                if (updated[updated.length - 1]?.role === 'assistant') {
                  updated[updated.length - 1] = { 
                    role: 'assistant', 
                    content: assistantContent 
                  };
                }
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('AI Assistant error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      setError(errorMessage);
      
      // Remove empty assistant message if error
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });

      toast({
        title: 'Lỗi',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestionClick = (question: string) => {
    sendMessage(question);
  };

  const remainingQuestions = MAX_QUESTIONS_PER_DAY - questionsToday;
  const charCount = input.length;
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-lg p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={aiLogo} alt="AI Assistant" />
              <AvatarFallback className="bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="text-base font-semibold">Trợ lý AI</span>
              <span className="text-xs text-muted-foreground font-normal">
                {projectName || 'Hỗ trợ công việc'}
              </span>
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Trợ lý AI hỗ trợ tra cứu thông tin về công việc, deadline và phân công
          </SheetDescription>
        </SheetHeader>

        {/* Usage indicator */}
        <div className="px-4 py-2 bg-muted/30 border-b flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>Còn {remainingQuestions}/{MAX_QUESTIONS_PER_DAY} câu hỏi hôm nay</span>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea 
          ref={scrollRef}
          className="flex-1 px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 px-4">
              <Avatar className="h-16 w-16 mb-4">
                <AvatarImage src={aiLogo} alt="AI Assistant" />
                <AvatarFallback className="bg-primary/10">
                  <Sparkles className="h-8 w-8 text-primary" />
                </AvatarFallback>
              </Avatar>
              <h3 className="text-lg font-medium mb-2">Xin chào{profile?.full_name ? `, ${profile.full_name.split(' ').pop()}` : ''}!</h3>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Tôi có thể giúp bạn tra cứu thông tin về công việc, deadline, phân công và tiến độ của team.
              </p>
              
              {/* Suggested Questions */}
              <div className="w-full space-y-2">
                <p className="text-xs text-muted-foreground font-medium mb-3">Gợi ý câu hỏi:</p>
                {SUGGESTED_QUESTIONS.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(question)}
                    className="w-full text-left px-4 py-3 rounded-lg border bg-card hover:bg-accent hover:border-primary/30 transition-colors text-sm"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    {message.role === 'assistant' ? (
                      <>
                        <AvatarImage src={aiLogo} alt="AI" />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <Sparkles className="h-4 w-4" />
                        </AvatarFallback>
                      </>
                    ) : (
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted rounded-tl-sm'
                    )}
                  >
                    {message.content ? (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-muted-foreground">Đang suy nghĩ...</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t p-4 bg-background">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Hỏi về công việc, deadline, phân công..."
                disabled={isLoading || remainingQuestions <= 0}
                className={cn(
                  "pr-16",
                  isOverLimit && "border-destructive focus-visible:ring-destructive"
                )}
                maxLength={MAX_MESSAGE_LENGTH + 50} // Allow some overflow for UX
              />
              <span className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 text-xs",
                isOverLimit ? "text-destructive" : "text-muted-foreground"
              )}>
                {charCount}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <Button 
              type="submit" 
              size="icon" 
              disabled={!input.trim() || isLoading || isOverLimit || remainingQuestions <= 0}
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          {remainingQuestions <= 0 && (
            <p className="text-xs text-destructive text-center mt-2">
              Bạn đã hết lượt hỏi hôm nay. Vui lòng quay lại ngày mai.
            </p>
          )}
          {remainingQuestions > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              AI có thể đưa ra thông tin không chính xác. Vui lòng xác minh các thông tin quan trọng.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
