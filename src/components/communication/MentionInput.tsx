import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, AtSign, Hash, Loader2, User, ListTodo, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  stageOrder: number;
  stageName: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  members: Member[];
  tasks: Task[];
  placeholder?: string;
  isSending?: boolean;
  className?: string;
}

type SuggestionType = 'user' | 'task';

interface Suggestion {
  type: SuggestionType;
  id: string;
  label: string;
  sublabel?: string;
}

export default function MentionInput({
  value,
  onChange,
  onSend,
  members,
  tasks,
  placeholder = 'Nhập tin nhắn...',
  isSending = false,
  className
}: MentionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerType, setTriggerType] = useState<'@' | '#' | null>(null);
  const [triggerStart, setTriggerStart] = useState(-1);

  // Detect @ or # triggers
  useEffect(() => {
    const cursorPos = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPos);
    
    // Find last @ or # before cursor
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const lastHashIndex = textBeforeCursor.lastIndexOf('#');
    
    const lastTriggerIndex = Math.max(lastAtIndex, lastHashIndex);
    
    if (lastTriggerIndex === -1) {
      setShowSuggestions(false);
      setTriggerType(null);
      return;
    }

    const trigger = textBeforeCursor[lastTriggerIndex] as '@' | '#';
    const searchText = textBeforeCursor.substring(lastTriggerIndex + 1).toLowerCase();
    
    // Check if there's a space before the trigger (or it's at start)
    const charBeforeTrigger = lastTriggerIndex > 0 ? textBeforeCursor[lastTriggerIndex - 1] : ' ';
    if (charBeforeTrigger !== ' ' && charBeforeTrigger !== '\n') {
      setShowSuggestions(false);
      return;
    }

    // Don't show suggestions if there's a space after trigger text
    if (searchText.includes(' ') && searchText.length > 20) {
      setShowSuggestions(false);
      return;
    }

    setTriggerType(trigger);
    setTriggerStart(lastTriggerIndex);

    // Generate suggestions
    const newSuggestions: Suggestion[] = [];

    if (trigger === '@') {
      // Add @PhụTrách option
      if ('phụtrách'.includes(searchText) || 'phutrach'.includes(searchText) || searchText === '') {
        newSuggestions.push({
          type: 'user',
          id: 'assignee',
          label: '@PhụTrách',
          sublabel: 'Người phụ trách task'
        });
      }

      // Add matching members
      members.forEach(member => {
        if (member.name.toLowerCase().includes(searchText)) {
          newSuggestions.push({
            type: 'user',
            id: member.id,
            label: `@${member.name}`,
            sublabel: undefined
          });
        }
      });
    } else if (trigger === '#') {
      // Add matching tasks - display with stage order and task title
      tasks.forEach(task => {
        const displayLabel = `GĐ${task.stageOrder}`;
        if (
          task.title.toLowerCase().includes(searchText) ||
          task.stageOrder.toString().includes(searchText) ||
          searchText === ''
        ) {
          newSuggestions.push({
            type: 'task',
            id: task.id,
            label: `#${displayLabel}`,
            sublabel: task.title
          });
        }
      });
    }

    setSuggestions(newSuggestions.slice(0, 8));
    setShowSuggestions(newSuggestions.length > 0);
    setSelectedIndex(0);
  }, [value, members, tasks]);

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (triggerStart === -1) return;

    const beforeTrigger = value.substring(0, triggerStart);
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const afterCursor = value.substring(cursorPos);

    let insertText = '';
    if (suggestion.type === 'user') {
      if (suggestion.id === 'assignee') {
        insertText = '@PhụTrách ';
      } else {
        const member = members.find(m => m.id === suggestion.id);
        insertText = `@${member?.name || ''} `;
      }
    } else if (suggestion.type === 'task') {
      const task = tasks.find(t => t.id === suggestion.id);
      const displayLabel = task ? `GĐ${task.stageOrder}` : suggestion.id.substring(0, 4);
      insertText = `#${displayLabel} – ${task?.title || ''} `;
    }

    const newValue = beforeTrigger + insertText + afterCursor;
    onChange(newValue);
    setShowSuggestions(false);

    // Focus and move cursor
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = beforeTrigger.length + insertText.length;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className={cn('relative', className)}>
      {/* Suggestions Popup */}
      {showSuggestions && suggestions.length > 0 && (
        <Card className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden z-50 shadow-xl border-border/50 animate-scale-in">
          <div className="p-2 border-b bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              {triggerType === '@' ? (
                <>
                  <User className="w-3 h-3" />
                  Chọn thành viên
                </>
              ) : (
                <>
                  <ListTodo className="w-3 h-3" />
                  Chọn task
                </>
              )}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.id}`}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-150',
                  index === selectedIndex 
                    ? 'bg-primary/10 text-foreground' 
                    : 'hover:bg-muted/50'
                )}
                onClick={() => handleSelectSuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  suggestion.type === 'user' 
                    ? "bg-primary/10 text-primary" 
                    : "bg-accent/10 text-accent"
                )}>
                  {suggestion.type === 'user' ? (
                    <AtSign className="w-4 h-4" />
                  ) : (
                    <Hash className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{suggestion.label}</span>
                  {suggestion.sublabel && (
                    <p className="text-muted-foreground text-xs truncate">
                      {suggestion.sublabel}
                    </p>
                  )}
                </div>
                {index === selectedIndex && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    Enter ↵
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Input Container */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-background border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all">
        {/* Action Buttons */}
        <div className="flex gap-0.5 pl-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-lg transition-colors",
              triggerType === '@' 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:text-primary hover:bg-primary/10"
            )}
            onClick={() => {
              onChange(value + '@');
              inputRef.current?.focus();
            }}
            title="Nhắc đến thành viên (@)"
          >
            <AtSign className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-lg transition-colors",
              triggerType === '#' 
                ? "bg-accent/10 text-accent" 
                : "text-muted-foreground hover:text-accent hover:bg-accent/10"
            )}
            onClick={() => {
              onChange(value + '#');
              inputRef.current?.focus();
            }}
            title="Tham chiếu task (#)"
          >
            <Hash className="w-4 h-4" />
          </Button>
        </div>

        {/* Text Input */}
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent px-2"
          disabled={isSending}
        />

        {/* Send Button */}
        <Button
          onClick={onSend}
          disabled={!value.trim() || isSending}
          size="icon"
          className={cn(
            "h-9 w-9 rounded-lg shrink-0 transition-all",
            value.trim() 
              ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25" 
              : "bg-muted text-muted-foreground"
          )}
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Helper Text */}
      <div className="flex items-center gap-3 mt-2 px-1">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <AtSign className="w-3 h-3" /> Tag người
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Hash className="w-3 h-3" /> Tham chiếu task
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          Enter để gửi
        </span>
      </div>
    </div>
  );
}
