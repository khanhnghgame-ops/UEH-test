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
import { supabase } from '@/integrations/supabase/client';
import { 
  History, 
  Loader2, 
  User,
  ExternalLink,
  Clock,
  FileCheck,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { parseLocalDateTime } from '@/lib/datetime';

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

const ITEMS_PER_PAGE = 5;

export default function SubmissionHistoryPopup({ 
  taskId, 
  taskDeadline,
  currentSubmissionLink 
}: SubmissionHistoryPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<SubmissionHistoryEntry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const taskDeadlineDate = parseLocalDateTime(taskDeadline);

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
      setCurrentPage(1);
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

  // Pagination
  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const paginatedHistory = history.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1 h-6 text-[10px] px-1.5 text-muted-foreground hover:text-foreground"
        >
          <History className="w-3 h-3" />
          <span className="hidden sm:inline">Lịch sử</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[90vw] aspect-video max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b bg-muted/30 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4 text-primary" />
            Lịch sử nộp bài
            {history.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {history.length} lần nộp
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 p-5 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <History className="w-12 h-12 mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">Chưa có lịch sử nộp bài</p>
              <p className="text-xs text-muted-foreground mt-1">
                Lịch sử sẽ được ghi lại khi nộp bài
              </p>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* History Grid */}
              <div className="flex-1 grid gap-3">
                {paginatedHistory.map((entry, index) => {
                  const isLate = !!taskDeadlineDate && new Date(entry.submitted_at) > taskDeadlineDate;
                  const links = parseLinks(entry.submission_link);
                  const isLatest = currentPage === 1 && index === 0;

                  return (
                    <div 
                      key={entry.id} 
                      className={`p-4 rounded-xl border transition-colors ${
                        isLatest 
                          ? 'border-primary/30 bg-primary/5' 
                          : 'border-border bg-muted/20'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* User Info */}
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold block truncate">{entry.user_name}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(entry.submitted_at), "dd/MM/yyyy – HH:mm", { locale: vi })}
                            </span>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex gap-2 shrink-0">
                          {isLate && (
                            <Badge variant="destructive" className="text-xs px-2">
                              Trễ deadline
                            </Badge>
                          )}
                          {isLatest && (
                            <Badge className="text-xs px-2 bg-primary/10 text-primary border-primary/30">
                              Mới nhất
                            </Badge>
                          )}
                        </div>

                        {/* Links */}
                        <div className="flex-1 flex flex-wrap gap-2">
                          {links.map((link: { title: string; url: string }, i: number) => (
                            <a
                              key={i}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-xs text-primary hover:underline px-3 py-2 rounded-lg bg-background border group"
                            >
                              <FileCheck className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate max-w-[200px]">{link.title || 'Link nộp bài'}</span>
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>

                      {/* Note */}
                      {entry.note && (
                        <div className="text-xs text-muted-foreground bg-background/50 p-3 rounded-lg mt-3 italic break-words border">
                          "{entry.note}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 border-t mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-3"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Trang {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 px-3"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}