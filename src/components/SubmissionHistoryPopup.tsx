import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { 
  History, 
  Loader2, 
  User,
  ExternalLink,
  Clock,
  FileCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface SubmissionHistoryEntry {
  id: string;
  user_id: string;
  user_name?: string;
  submission_link: string;
  note: string | null;
  submitted_at: string;
}

interface SubmissionHistoryPopupProps {
  taskId: string;
  taskDeadline?: string | null;
  submissionCount?: number;
  currentSubmissionLink?: string | null;
}

export default function SubmissionHistoryPopup({ 
  taskId, 
  taskDeadline,
  submissionCount = 0,
  currentSubmissionLink 
}: SubmissionHistoryPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<SubmissionHistoryEntry[]>([]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const { data: historyData, error } = await supabase
        .from('submission_history')
        .select('*')
        .eq('task_id', taskId)
        .order('submitted_at', { ascending: false });
      
      if (error) throw error;
      
      if (historyData && historyData.length > 0) {
        const userIds = [...new Set(historyData.map(h => h.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        
        setHistory(historyData.map(h => ({
          ...h,
          user_name: profileMap.get(h.user_id) || 'Unknown'
        })));
      } else {
        setHistory([]);
      }
    } catch (error) {
      console.error('Error fetching submission history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, taskId]);

  const parseLinks = (linkJson: string) => {
    try {
      const parsed = JSON.parse(linkJson);
      return Array.isArray(parsed) ? parsed : [{ title: 'Bài nộp', url: linkJson }];
    } catch {
      return [{ title: 'Bài nộp', url: linkJson }];
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5 h-8"
        >
          <History className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Lịch sử</span>
          {submissionCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {submissionCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Lịch sử nộp bài
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 max-h-[60vh] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">Chưa có lịch sử nộp bài</p>
              <p className="text-sm text-muted-foreground mt-1">
                Khi nộp bài, lịch sử sẽ được ghi lại tại đây
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((entry, index) => {
                const isLate = taskDeadline && new Date(entry.submitted_at) > new Date(taskDeadline);
                const links = parseLinks(entry.submission_link);

                return (
                  <div 
                    key={entry.id} 
                    className={`p-4 rounded-xl border-2 transition-colors ${
                      index === 0 
                        ? 'border-primary/30 bg-primary/5' 
                        : 'border-border bg-muted/30'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold block">{entry.user_name}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(entry.submitted_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {isLate && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Trễ hạn
                          </Badge>
                        )}
                        {index === 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary">
                            Mới nhất
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Links */}
                    <div className="space-y-2 mb-2">
                      {links.map((link: { title: string; url: string }, i: number) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline p-2 rounded-lg bg-background/50 border group"
                        >
                          <FileCheck className="w-4 h-4 shrink-0" />
                          <span className="truncate flex-1">{link.title || link.url}</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </a>
                      ))}
                    </div>

                    {/* Note */}
                    {entry.note && (
                      <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded-lg italic">
                        "{entry.note}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
