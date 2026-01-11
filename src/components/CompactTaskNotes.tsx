import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { 
  FileText, 
  Plus, 
  ChevronRight,
  ChevronDown,
  Paperclip,
  Clock,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface TaskNote {
  id: string;
  task_id: string;
  version_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface NoteAttachment {
  id: string;
  note_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  storage_name: string;
  created_at: string;
}

interface CompactTaskNotesProps {
  taskId: string;
  className?: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

export default function CompactTaskNotes({ taskId, className = '' }: CompactTaskNotesProps) {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [allAttachments, setAllAttachments] = useState<NoteAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchNotes = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const { data: notesData, error } = await supabase
        .from('task_notes')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (isMountedRef.current) {
        setNotes((notesData || []) as TaskNote[]);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [taskId]);

  const fetchAllAttachments = useCallback(async (noteIds: string[]) => {
    if (!isMountedRef.current || noteIds.length === 0) {
      setAllAttachments([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('task_note_attachments')
        .select('*')
        .in('note_id', noteIds);

      if (error) throw error;
      if (isMountedRef.current) {
        setAllAttachments((data || []) as NoteAttachment[]);
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
    }
  }, []);

  // Fetch notes on mount or taskId change
  useEffect(() => {
    fetchNotes();
  }, [taskId]);

  // Fetch attachments when notes change
  useEffect(() => {
    if (notes.length > 0) {
      const noteIds = notes.map(n => n.id);
      fetchAllAttachments(noteIds);
    }
  }, [notes.length]); // Only depend on count to prevent loops

  const toggleExpand = (noteId: string) => {
    setExpandedNoteId(expandedNoteId === noteId ? null : noteId);
  };

  const getAttachmentCountForNote = (noteId: string) => {
    return allAttachments.filter(a => a.note_id === noteId).length;
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">Ghi chú trao đổi</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {notes.length}
          </Badge>
        </div>
      </div>

      {/* Notes List */}
      <ScrollArea className="flex-1">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">Chưa có ghi chú</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {notes.map(note => {
              const isExpanded = expandedNoteId === note.id;
              const attachmentCount = getAttachmentCountForNote(note.id);
              const noteAttachments = allAttachments.filter(a => a.note_id === note.id);
              
              return (
                <div
                  key={note.id}
                  className={`rounded-lg border transition-all ${
                    isExpanded 
                      ? 'border-primary/30 bg-primary/5' 
                      : 'border-border/40 bg-muted/30 hover:bg-muted/50'
                  }`}
                >
                  {/* Compact Version Info */}
                  <button
                    onClick={() => toggleExpand(note.id)}
                    className="w-full flex items-center gap-2 p-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-primary shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs truncate ${isExpanded ? 'font-medium text-primary' : ''}`}>
                          {note.version_name}
                        </span>
                        {attachmentCount > 0 && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">
                            <Paperclip className="w-2 h-2 mr-0.5" />
                            {attachmentCount}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {format(new Date(note.updated_at), "dd/MM HH:mm", { locale: vi })}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-primary/10 space-y-2">
                      {note.content ? (
                        <div className="p-2 rounded bg-background/80 border border-border/30">
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {note.content}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground/50 italic p-2">
                          Không có nội dung
                        </p>
                      )}

                      {/* Attachments */}
                      {noteAttachments.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">
                            Đính kèm
                          </span>
                          <div className="space-y-1">
                            {noteAttachments.map(att => (
                              <div 
                                key={att.id}
                                className="flex items-center gap-2 p-1.5 rounded bg-background/60 border border-border/20 text-xs"
                              >
                                <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="truncate flex-1">{att.file_name}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {formatFileSize(att.file_size)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
