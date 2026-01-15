import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Loader2, Sparkles, AlertCircle, Info, MessageCircle, AlertTriangle, FolderKanban, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import aiLogo from '@/assets/ai-assistant-logo.png';
import ReactMarkdown from 'react-markdown';
import UserAvatar from '@/components/UserAvatar';

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

// Usage limits
const MAX_MESSAGE_WORDS = 100;
const QUESTIONS_PER_PROJECT = 10;

const SUGGESTED_QUESTIONS = [
  "Công việc nào của tôi sắp đến hạn?",
  "Ai đang làm task nào?",
  "Tiến độ project hiện tại ra sao?",
];

// Get usage key based on user and date
const getUsageKey = (userId: string) => `ai_usage_${userId}_${new Date().toDateString()}`;
const getProjectCountKey = (userId: string) => `ai_project_count_${userId}`;

// Count words in a string
const countWords = (text: string): number => {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

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
  const [projectCount, setProjectCount] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user, profile } = useAuth();
  const { toast } = useToast();

  // Calculate max questions based on project count
  const maxQuestions = QUESTIONS_PER_PROJECT * projectCount;

  // Load usage count and project count
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;

      // Load usage count
      const usageKey = getUsageKey(user.id);
      const stored = localStorage.getItem(usageKey);
      setQuestionsToday(stored ? parseInt(stored, 10) : 0);

      // Fetch project count from database
      try {
        const { count, error } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (!error && count !== null) {
          setProjectCount(Math.max(1, count)); // At least 1
          localStorage.setItem(getProjectCountKey(user.id), count.toString());
        } else {
          // Fallback to cached value
          const cached = localStorage.getItem(getProjectCountKey(user.id));
          if (cached) setProjectCount(Math.max(1, parseInt(cached, 10)));
        }
      } catch {
        // Fallback to cached value
        const cached = localStorage.getItem(getProjectCountKey(user.id));
        if (cached) setProjectCount(Math.max(1, parseInt(cached, 10)));
      }
    };

    if (isOpen) loadData();
  }, [user?.id, isOpen]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
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

    const wordCount = countWords(messageText);

    // Check word limit
    if (wordCount > MAX_MESSAGE_WORDS) {
      toast({
        title: 'Câu hỏi quá dài',
        description: `Vui lòng giới hạn câu hỏi trong ${MAX_MESSAGE_WORDS} từ (hiện tại: ${wordCount} từ).`,
        variant: 'destructive',
      });
      return;
    }

    // Check daily limit
    if (questionsToday >= maxQuestions) {
      toast({
        title: 'Đã hết lượt hỏi hôm nay',
        description: `Bạn đã sử dụng ${maxQuestions} câu hỏi (${projectCount} project × ${QUESTIONS_PER_PROJECT} lượt). Vui lòng quay lại ngày mai.`,
        variant: 'destructive',
      });
      return;
    }

    setError(null);
    const userMessage: Message = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add thinking message immediately
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestionClick = (question: string) => {
    sendMessage(question);
  };

  const remainingQuestions = maxQuestions - questionsToday;
  const wordCount = countWords(input);
  const isOverLimit = wordCount > MAX_MESSAGE_WORDS;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-2xl p-0 flex flex-col h-full"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b bg-gradient-to-r from-primary/10 to-primary/5">
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="h-9 w-9 ring-2 ring-primary/20">
              <AvatarImage src={aiLogo} alt="AI Assistant" />
              <AvatarFallback className="bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold">Trợ lý AI</span>
              <span className="text-xs text-muted-foreground font-normal">
                {projectName ? `Project: ${projectName}` : 'Hỗ trợ chung'}
              </span>
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Trợ lý AI hỗ trợ tra cứu thông tin về công việc, deadline và phân công
          </SheetDescription>
        </SheetHeader>

        {/* Scope indicator - prominent display */}
        <div className={cn(
          "px-4 py-2.5 border-b flex items-center gap-2 text-xs",
          projectId ? "bg-blue-50 dark:bg-blue-950/30" : "bg-amber-50 dark:bg-amber-950/30"
        )}>
          {projectId ? (
            <>
              <FolderKanban className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <span className="font-medium text-blue-700 dark:text-blue-300">
                  AI đang hỗ trợ Project: {projectName}
                </span>
                <span className="text-blue-600/80 dark:text-blue-400/80 block">
                  Chỉ trả lời dựa trên dữ liệu của project này
                </span>
              </div>
            </>
          ) : (
            <>
              <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  AI đang trả lời tổng quan trên toàn hệ thống
                </span>
                <span className="text-amber-600/80 dark:text-amber-400/80 block">
                  Có thể truy cập thông tin từ tất cả project của bạn
                </span>
              </div>
            </>
          )}
        </div>

        {/* Usage indicator */}
        <div className="px-4 py-2 bg-muted/30 border-b flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>
              Còn {remainingQuestions}/{maxQuestions} lượt 
              <span className="hidden sm:inline"> ({projectCount} project × {QUESTIONS_PER_PROJECT})</span>
            </span>
          </div>
          <span className="text-muted-foreground">Tối đa {MAX_MESSAGE_WORDS} từ/câu</span>
        </div>

        {/* Messages Area */}
        <ScrollArea 
          ref={scrollRef}
          className="flex-1 px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-6 px-2">
              <Avatar className="h-14 w-14 mb-3 ring-2 ring-primary/20">
                <AvatarImage src={aiLogo} alt="AI Assistant" />
                <AvatarFallback className="bg-primary/10">
                  <Sparkles className="h-7 w-7 text-primary" />
                </AvatarFallback>
              </Avatar>
              <h3 className="text-base font-medium mb-1">
                Xin chào{profile?.full_name ? `, ${profile.full_name.split(' ').pop()}` : ''}!
              </h3>
              <p className="text-xs text-muted-foreground text-center mb-4 px-4">
                {projectName 
                  ? `Tôi có thể giúp bạn về project "${projectName}".`
                  : 'Tôi có thể giúp bạn tra cứu thông tin về công việc và deadline.'
                }
              </p>
              
              {/* Suggested Questions */}
              <div className="w-full space-y-2">
                <p className="text-xs text-muted-foreground font-medium mb-2">Gợi ý câu hỏi:</p>
                {SUGGESTED_QUESTIONS.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(question)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border bg-card hover:bg-accent hover:border-primary/30 transition-all text-sm flex items-center gap-2"
                  >
                    <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{question}</span>
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
                    "flex gap-2.5",
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  {/* Avatar */}
                  {message.role === 'assistant' ? (
                    <Avatar className="h-8 w-8 shrink-0 ring-1 ring-border">
                      <AvatarImage src={aiLogo} alt="AI" />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Sparkles className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <UserAvatar 
                      src={profile?.avatar_url}
                      name={profile?.full_name}
                      size="sm"
                      className="ring-1 ring-border shrink-0"
                    />
                  )}

                  {/* Message Bubble */}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted border border-border rounded-bl-md'
                    )}
                  >
                    {message.content ? (
                      message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-foreground">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                              li: ({ children }) => <li className="text-sm">{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              em: ({ children }) => <em className="italic">{children}</em>,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs">Đang suy nghĩ...</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {error && (
                <div className="flex items-center gap-2 text-destructive text-xs p-3 bg-destructive/10 rounded-xl">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Disclaimer */}
        <div className="px-4 py-2 border-t bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Câu trả lời của AI được tạo tự động dựa trên dữ liệu hiện có trong hệ thống. 
              Vui lòng kiểm tra lại thông tin quan trọng như task, deadline trước khi thực hiện.
            </span>
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t p-3 bg-background">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Hỏi về công việc, deadline..."
                disabled={isLoading || remainingQuestions <= 0}
                className={cn(
                  "min-h-[44px] max-h-[120px] resize-none pr-14 text-sm",
                  isOverLimit && "border-destructive focus-visible:ring-destructive"
                )}
                rows={1}
              />
              <span className={cn(
                "absolute right-3 bottom-2 text-[10px]",
                isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"
              )}>
                {wordCount}/{MAX_MESSAGE_WORDS}
              </span>
            </div>
            <Button 
              type="submit" 
              size="icon" 
              disabled={!input.trim() || isLoading || isOverLimit || remainingQuestions <= 0}
              className="shrink-0 h-11 w-11"
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
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Nhấn Enter để gửi, Shift+Enter để xuống dòng
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
