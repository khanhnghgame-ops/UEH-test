import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Send, AtSign, Hash, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  number: number;
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
      // Add matching tasks
      tasks.forEach(task => {
        const taskNum = task.id.substring(0, 4);
        if (
          task.title.toLowerCase().includes(searchText) ||
          taskNum.includes(searchText) ||
          searchText === ''
        ) {
          newSuggestions.push({
            type: 'task',
            id: task.id,
            label: `#${taskNum}`,
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
      const taskNum = suggestion.id.substring(0, 4);
      insertText = `#${taskNum} `;
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
        <Card className="absolute bottom-full left-0 right-0 mb-2 p-2 max-h-64 overflow-y-auto z-50 shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.id}`}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md flex items-center gap-2 transition-colors',
                index === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
              )}
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {suggestion.type === 'user' ? (
                <AtSign className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <Hash className="w-4 h-4 text-accent shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-medium">{suggestion.label}</span>
                {suggestion.sublabel && (
                  <span className="text-muted-foreground text-sm ml-2 truncate">
                    {suggestion.sublabel}
                  </span>
                )}
              </div>
            </button>
          ))}
        </Card>
      )}

      {/* Input */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-primary"
            onClick={() => {
              onChange(value + '@');
              inputRef.current?.focus();
            }}
          >
            <AtSign className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-primary"
            onClick={() => {
              onChange(value + '#');
              inputRef.current?.focus();
            }}
          >
            <Hash className="w-4 h-4" />
          </Button>
        </div>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
          disabled={isSending}
        />
        <Button
          onClick={onSend}
          disabled={!value.trim() || isSending}
          size="icon"
          className="h-9 w-9"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
