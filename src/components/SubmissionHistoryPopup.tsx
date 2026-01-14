import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ChevronRight,
  File,
  FileText,
  FileSpreadsheet,
  Presentation,
  Image as ImageIcon,
  Download,
  Eye
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
  submission_type?: string;
  file_path?: string;
  file_name?: string;
  file_size?: number;
}

interface SubmissionHistoryPopupProps {
  taskId: string;
  groupId?: string;
  taskDeadline?: string | null;
  submissionCount?: number;
  currentSubmissionLink?: string | null;
}

const ITEMS_PER_PAGE = 3;

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return <FileText className="w-3.5 h-3.5 text-red-500" />;
    case 'doc':
    case 'docx':
      return <FileText className="w-3.5 h-3.5 text-blue-500" />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className="w-3.5 h-3.5 text-green-500" />;
    case 'ppt':
    case 'pptx':
      return <Presentation className="w-3.5 h-3.5 text-orange-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return <ImageIcon className="w-3.5 h-3.5 text-purple-500" />;
    default:
      return <File className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

export default function SubmissionHistoryPopup({ 
  taskId,
  groupId,
  taskDeadline,
  currentSubmissionLink 
}: SubmissionHistoryPopupProps) {
  const navigate = useNavigate();
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

  const handleViewFile = (filePath: string, fileName: string, fileSize: number) => {
    const params = new URLSearchParams();
    params.set('path', filePath);
    params.set('name', fileName);
    params.set('size', fileSize.toString());
    params.set('taskId', taskId);
    if (groupId) params.set('groupId', groupId);
    navigate(`/file-preview?${params.toString()}`);
    setIsOpen(false);
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
          className="gap-1 h-6 w-16 justify-center text-[10px] px-1.5 text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
        >
          <History className="w-3 h-3" />
          <span className="sr-only">Lịch sử</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl w-[95vw] min-h-[70vh] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/10 to-transparent shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 text-lg font-bold">
              <div className="p-2 rounded-lg bg-primary/20 border border-primary/30">
                <History className="w-5 h-5 text-primary" />
              </div>
              Lịch sử nộp bài
              {history.length > 0 && (
                <Badge variant="secondary" className="text-sm px-3">
                  {history.length} lần nộp
                </Badge>
              )}
            </DialogTitle>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Trang {currentPage} / {totalPages}
              </div>
            )}
          </div>
        </DialogHeader>
        
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <History className="w-16 h-16 text-muted-foreground/30" />
              </div>
              <p className="text-lg font-medium text-muted-foreground">Chưa có lịch sử nộp bài</p>
              <p className="text-sm text-muted-foreground mt-2">
                Lịch sử sẽ được ghi lại khi nộp bài
              </p>
            </div>
          ) : (
            <>
              {/* History Cards - Takes remaining space */}
              <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                {paginatedHistory.map((entry, index) => {
                  const isLate = !!taskDeadlineDate && new Date(entry.submitted_at) > taskDeadlineDate;
                  const links = parseLinks(entry.submission_link);
                  const isLatest = currentPage === 1 && index === 0;
                  const isFileSubmission = entry.submission_type === 'file' || links.some(l => l.type === 'file');
                  const hasLinks = links.some(l => l.url && !l.file_path);
                  const hasFiles = links.some(l => l.file_path);

                  return (
                    <div 
                      key={entry.id} 
                      className={`p-5 rounded-2xl border-2 transition-all ${
                        isLatest 
                          ? 'border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10 shadow-lg shadow-primary/5' 
                          : 'border-border bg-card hover:border-border/80'
                      }`}
                    >
                      {/* Header Row */}
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-4">
                          {/* Avatar */}
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                            isLatest ? 'bg-primary/20 border-2 border-primary/30' : 'bg-muted'
                          }`}>
                            <User className={`w-6 h-6 ${isLatest ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          
                          {/* User Info */}
                          <div>
                            <span className="text-base font-bold block">{entry.user_name}</span>
                            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {format(new Date(entry.submitted_at), "EEEE, dd/MM/yyyy – HH:mm", { locale: vi })}
                            </span>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex flex-wrap gap-2">
                          {isLatest && (
                            <Badge className="text-xs px-3 py-1 bg-primary text-primary-foreground">
                              Mới nhất
                            </Badge>
                          )}
                          {isLate && (
                            <Badge variant="destructive" className="text-xs px-3 py-1">
                              Nộp trễ
                            </Badge>
                          )}
                          {hasFiles && (
                            <Badge variant="outline" className="text-xs px-3 py-1 gap-1.5">
                              <File className="w-3.5 h-3.5" />
                              {links.filter(l => l.file_path).length} file
                            </Badge>
                          )}
                          {hasLinks && (
                            <Badge variant="outline" className="text-xs px-3 py-1 gap-1.5">
                              <ExternalLink className="w-3.5 h-3.5" />
                              {links.filter(l => l.url && !l.file_path).length} link
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Files & Links Grid */}
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {links.map((link: any, i: number) => {
                          if (link.type === 'file' || link.file_path) {
                            return (
                              <button
                                key={i}
                                onClick={() => handleViewFile(link.file_path, link.file_name, link.file_size)}
                                className="flex items-center gap-3 p-3 rounded-xl bg-background border-2 border-transparent hover:border-primary/30 hover:bg-primary/5 transition-all group text-left"
                              >
                                <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10">
                                  {getFileIcon(link.file_name || 'file')}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate group-hover:text-primary">
                                    {link.title || link.file_name || 'File'}
                                  </p>
                                  {link.file_size && (
                                    <p className="text-xs text-muted-foreground">
                                      {formatFileSize(link.file_size)}
                                    </p>
                                  )}
                                </div>
                                <Eye className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              </button>
                            );
                          } else {
                            return (
                              <a
                                key={i}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 rounded-xl bg-background border-2 border-transparent hover:border-primary/30 hover:bg-primary/5 transition-all group"
                              >
                                <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10">
                                  <FileCheck className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate group-hover:text-primary">
                                    {link.title || 'Link nộp bài'}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {link.url}
                                  </p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              </a>
                            );
                          }
                        })}
                      </div>

                      {/* Note */}
                      {entry.note && (
                        <div className="mt-4 p-4 rounded-xl bg-muted/50 border">
                          <p className="text-sm text-muted-foreground italic">"{entry.note}"</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination - Fixed at bottom */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-5 border-t mt-5">
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="h-10 px-4"
                  >
                    Đầu
                  </Button>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-10 px-4"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Trước
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="default"
                          onClick={() => setCurrentPage(pageNum)}
                          className="h-10 w-10"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-10 px-4"
                  >
                    Sau
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="h-10 px-4"
                  >
                    Cuối
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
