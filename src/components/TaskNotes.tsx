import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Upload, 
  X, 
  Loader2,
  File,
  Download,
  Paperclip,
  Edit3,
  Check,
  CheckCircle2,
  Cloud
} from 'lucide-react';

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

interface TaskNotesProps {
  taskId: string;
  className?: string;
  compact?: boolean;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB per task
const AUTOSAVE_DELAY = 1500; // 1.5 seconds

export default function TaskNotes({ taskId, className = '', compact = false }: TaskNotesProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [allAttachments, setAllAttachments] = useState<NoteAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  
  // Autosave state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  const fetchNotes = useCallback(async () => {
    try {
      const { data: notesData, error } = await supabase
        .from('task_notes')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Type assertion for the response
      const typedNotes = (notesData || []) as TaskNote[];
      setNotes(typedNotes);

      // Select first note if none selected
      if (typedNotes.length > 0 && !selectedNoteId) {
        setSelectedNoteId(typedNotes[0].id);
        setContent(typedNotes[0].content || '');
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, selectedNoteId]);

  const fetchAttachments = useCallback(async () => {
    if (!selectedNoteId) {
      setAttachments([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('task_note_attachments')
        .select('*')
        .eq('note_id', selectedNoteId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAttachments((data || []) as NoteAttachment[]);
    } catch (error) {
      console.error('Error fetching attachments:', error);
    }
  }, [selectedNoteId]);

  const fetchAllAttachments = useCallback(async () => {
    try {
      const noteIds = notes.map(n => n.id);
      if (noteIds.length === 0) {
        setAllAttachments([]);
        return;
      }

      const { data, error } = await supabase
        .from('task_note_attachments')
        .select('*')
        .in('note_id', noteIds);

      if (error) throw error;
      setAllAttachments((data || []) as NoteAttachment[]);
    } catch (error) {
      console.error('Error fetching all attachments:', error);
    }
  }, [notes]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    if (selectedNoteId) {
      const note = notes.find(n => n.id === selectedNoteId);
      if (note) {
        setContent(note.content || '');
      }
      fetchAttachments();
    }
  }, [selectedNoteId, notes, fetchAttachments]);

  useEffect(() => {
    fetchAllAttachments();
  }, [fetchAllAttachments]);

  const getTotalAttachmentSize = () => {
    return allAttachments.reduce((sum, a) => sum + a.file_size, 0);
  };

  const createNewVersion = async () => {
    try {
      const versionNumber = notes.length + 1;
      const { data, error } = await supabase
        .from('task_notes')
        .insert({
          task_id: taskId,
          version_name: `Phiên bản ${versionNumber}`,
          content: ''
        })
        .select()
        .single();

      if (error) throw error;

      const newNote = data as TaskNote;
      setNotes([...notes, newNote]);
      setSelectedNoteId(newNote.id);
      setContent('');
      
      toast({ title: 'Đã tạo phiên bản mới' });
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    }
  };

  // Autosave function
  const saveContent = useCallback(async (showToast = false) => {
    if (!selectedNoteId) return;
    if (content === lastSavedContentRef.current) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('task_notes')
        .update({ content })
        .eq('id', selectedNoteId);

      if (error) throw error;

      // Update local state
      setNotes(notes.map(n => 
        n.id === selectedNoteId ? { ...n, content, updated_at: new Date().toISOString() } : n
      ));
      
      lastSavedContentRef.current = content;
      setSaveStatus('saved');
      
      if (showToast) {
        toast({ title: 'Đã lưu ghi chú' });
      }
    } catch (error: any) {
      setSaveStatus('unsaved');
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [selectedNoteId, content, notes, toast]);

  // Handle content change with autosave
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setSaveStatus('unsaved');
    
    // Clear existing timer
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    
    // Set new autosave timer
    autosaveTimerRef.current = setTimeout(() => {
      saveContent(false);
    }, AUTOSAVE_DELAY);
  }, [saveContent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  // Update lastSavedContentRef when switching notes
  useEffect(() => {
    if (selectedNoteId) {
      const note = notes.find(n => n.id === selectedNoteId);
      if (note) {
        lastSavedContentRef.current = note.content || '';
        setSaveStatus('saved');
      }
    }
  }, [selectedNoteId, notes]);

  const handleDeleteVersion = async () => {
    if (!noteToDelete) return;

    try {
      // Delete attachments from storage first
      const attachmentsToDelete = allAttachments.filter(a => a.note_id === noteToDelete);
      for (const attachment of attachmentsToDelete) {
        await supabase.storage
          .from('task-note-attachments')
          .remove([attachment.file_path]);
      }

      const { error } = await supabase
        .from('task_notes')
        .delete()
        .eq('id', noteToDelete);

      if (error) throw error;

      const remainingNotes = notes.filter(n => n.id !== noteToDelete);
      setNotes(remainingNotes);
      
      if (selectedNoteId === noteToDelete) {
        if (remainingNotes.length > 0) {
          setSelectedNoteId(remainingNotes[0].id);
          setContent(remainingNotes[0].content || '');
        } else {
          setSelectedNoteId(null);
          setContent('');
        }
      }
      
      toast({ title: 'Đã xóa phiên bản' });
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setShowDeleteDialog(false);
      setNoteToDelete(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedNoteId || !e.target.files?.length) return;

    const file = e.target.files[0];
    const currentTotal = getTotalAttachmentSize();
    
    if (currentTotal + file.size > MAX_TOTAL_SIZE) {
      toast({ 
        title: 'Vượt quá giới hạn', 
        description: `Tổng dung lượng file không được vượt quá 10MB. Còn lại: ${formatFileSize(MAX_TOTAL_SIZE - currentTotal)}`,
        variant: 'destructive' 
      });
      return;
    }

    setIsUploading(true);
    try {
      // Generate safe storage name
      const ext = file.name.split('.').pop() || '';
      const storageName = `${crypto.randomUUID()}.${ext}`;
      const filePath = `${taskId}/${selectedNoteId}/${storageName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('task-note-attachments')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Save attachment record
      const { data: attachmentData, error: dbError } = await supabase
        .from('task_note_attachments')
        .insert({
          note_id: selectedNoteId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          storage_name: storageName
        })
        .select()
        .single();

      if (dbError) throw dbError;

      const newAttachment = attachmentData as NoteAttachment;
      setAttachments([...attachments, newAttachment]);
      setAllAttachments([...allAttachments, newAttachment]);
      
      toast({ title: 'Đã tải file lên' });
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attachment: NoteAttachment) => {
    try {
      // Delete from storage
      await supabase.storage
        .from('task-note-attachments')
        .remove([attachment.file_path]);

      // Delete record
      await supabase
        .from('task_note_attachments')
        .delete()
        .eq('id', attachment.id);

      setAttachments(attachments.filter(a => a.id !== attachment.id));
      setAllAttachments(allAttachments.filter(a => a.id !== attachment.id));
      
      toast({ title: 'Đã xóa file' });
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    }
  };

  const handleDownloadAttachment = async (attachment: NoteAttachment) => {
    try {
      const { data } = supabase.storage
        .from('task-note-attachments')
        .getPublicUrl(attachment.file_path);

      const response = await fetch(data.publicUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const saveVersionName = async () => {
    if (!selectedNoteId || !editingName.trim()) return;

    try {
      const { error } = await supabase
        .from('task_notes')
        .update({ version_name: editingName.trim() })
        .eq('id', selectedNoteId);

      if (error) throw error;

      setNotes(notes.map(n => 
        n.id === selectedNoteId ? { ...n, version_name: editingName.trim() } : n
      ));
      setIsEditingName(false);
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className={`flex flex-col ${compact ? 'h-full' : ''} ${className}`}>
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Ghi chú trao đổi</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {formatFileSize(getTotalAttachmentSize())} / 10MB
            </Badge>
            <Button size="sm" variant="outline" onClick={createNewVersion}>
              <Plus className="w-4 h-4 mr-1" />
              Tạo phiên bản
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Ghi chú dùng để trao đổi với giảng viên. Thành viên trong nhóm xem yêu cầu làm lại và trao đổi tại mục Trao đổi.
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 space-y-3">
        {notes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-muted/30 rounded-lg">
            <FileText className="w-12 h-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-3">Chưa có ghi chú nào</p>
            <Button variant="outline" onClick={createNewVersion}>
              <Plus className="w-4 h-4 mr-1" />
              Tạo phiên bản đầu tiên
            </Button>
          </div>
        ) : (
          <>
            {/* Notes List - Visible list of all saved notes */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">
                Danh sách ghi chú ({notes.length})
              </span>
              <ScrollArea className="max-h-32">
                <div className="space-y-1">
                  {notes.map(note => {
                    const isSelected = note.id === selectedNoteId;
                    const noteAttachmentCount = allAttachments.filter(a => a.note_id === note.id).length;
                    return (
                      <div
                        key={note.id}
                        onClick={() => setSelectedNoteId(note.id)}
                        className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'bg-muted/50 hover:bg-muted border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className={`text-sm truncate ${isSelected ? 'font-medium' : ''}`}>
                            {note.version_name}
                          </span>
                          {noteAttachmentCount > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                              <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                              {noteAttachmentCount}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedNoteId(note.id);
                              setEditingName(note.version_name);
                              setIsEditingName(true);
                            }}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNoteToDelete(note.id);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Selected Note Editor */}
            {selectedNote && (
              <div className="flex-1 flex flex-col space-y-3 border-t pt-3">
                {/* Version Name Editor */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Đang chỉnh sửa:</span>
                  {isEditingName ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-8 flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveVersionName();
                          if (e.key === 'Escape') setIsEditingName(false);
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveVersionName}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsEditingName(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-1">
                      <Badge variant="secondary" className="text-sm">{selectedNote.version_name}</Badge>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingName(selectedNote.version_name);
                          setIsEditingName(true);
                        }}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Content Editor */}
                <Textarea
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Nhập nội dung ghi chú tại đây..."
                  className="flex-1 resize-none min-h-[120px]"
                />

                {/* Attachments */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Paperclip className="w-4 h-4" />
                      File đính kèm
                    </span>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                      <Button size="sm" variant="outline" asChild disabled={isUploading}>
                        <span>
                          {isUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : (
                            <Upload className="w-4 h-4 mr-1" />
                          )}
                          Tải file
                        </span>
                      </Button>
                    </label>
                  </div>
                  
                  {attachments.length > 0 ? (
                    <ScrollArea className="max-h-32">
                      <div className="space-y-1">
                        {attachments.map(attachment => (
                          <div 
                            key={attachment.id} 
                            className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <File className="w-4 h-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{attachment.file_name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                ({formatFileSize(attachment.file_size)})
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7"
                                onClick={() => handleDownloadAttachment(attachment)}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7 text-destructive"
                                onClick={() => handleDeleteAttachment(attachment)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Chưa có file đính kèm
                    </p>
                  )}
                </div>

                {/* Autosave Status */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {saveStatus === 'saved' && (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        <span>Đã lưu tự động</span>
                      </>
                    )}
                    {saveStatus === 'saving' && (
                      <>
                        <Cloud className="w-3.5 h-3.5 text-primary animate-pulse" />
                        <span>Đang lưu...</span>
                      </>
                    )}
                    {saveStatus === 'unsaved' && (
                      <>
                        <Cloud className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Chưa lưu</span>
                      </>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => saveContent(true)} 
                    disabled={isSaving || saveStatus === 'saved'}
                    className="h-7 text-xs"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Lưu ngay
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa phiên bản ghi chú?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa vĩnh viễn phiên bản ghi chú và tất cả file đính kèm. Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteVersion}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}