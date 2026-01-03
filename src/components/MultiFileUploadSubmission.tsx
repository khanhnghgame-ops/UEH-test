import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  X, 
  File, 
  FileText, 
  Image as ImageIcon, 
  FileSpreadsheet,
  Presentation,
  Loader2,
  AlertCircle,
  Eye,
  Pencil,
  Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface UploadedFile {
  file_path: string;
  file_name: string;
  file_size: number;
  storage_name: string;
}

interface MultiFileUploadSubmissionProps {
  onFilesChanged: (files: UploadedFile[]) => void;
  uploadedFiles: UploadedFile[];
  userId: string;
  taskId: string;
  disabled?: boolean;
  compact?: boolean;
}

const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total per task

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

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const generateSafeStorageName = (originalName: string): string => {
  const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
  const uuid = crypto.randomUUID();
  return `${uuid}.${ext}`;
};

export default function MultiFileUploadSubmission({
  onFilesChanged,
  uploadedFiles,
  userId,
  taskId,
  disabled = false,
  compact = false
}: MultiFileUploadSubmissionProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const currentTotalSize = uploadedFiles.reduce((sum, f) => sum + f.file_size, 0);
  const remainingSize = MAX_TOTAL_SIZE - currentTotalSize;

  const handleFilesSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let newFilesTotalSize = 0;
    for (let i = 0; i < files.length; i++) {
      newFilesTotalSize += files[i].size;
    }

    if (currentTotalSize + newFilesTotalSize > MAX_TOTAL_SIZE) {
      toast({
        title: 'Tổng dung lượng vượt 10MB',
        description: `Đã dùng: ${formatFileSize(currentTotalSize)}, File mới: ${formatFileSize(newFilesTotalSize)}`,
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const newUploadedFiles: UploadedFile[] = [];
    const totalFiles = files.length;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileName(file.name);
        
        const storageName = generateSafeStorageName(file.name);
        const filePath = `${userId}/${taskId}/${storageName}`;

        const progressBase = Math.round((i / totalFiles) * 100);
        setUploadProgress(progressBase);

        const { data, error } = await supabase.storage
          .from('task-submissions')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          throw new Error(`Lỗi tải file "${file.name}": ${error.message}`);
        }

        newUploadedFiles.push({
          file_path: data.path,
          file_name: file.name,
          file_size: file.size,
          storage_name: storageName
        });

        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      const allFiles = [...uploadedFiles, ...newUploadedFiles];
      onFilesChanged(allFiles);

      toast({
        title: 'Tải file thành công',
        description: `Đã tải lên ${newUploadedFiles.length} file`,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      
      for (const uploadedFile of newUploadedFiles) {
        try {
          await supabase.storage.from('task-submissions').remove([uploadedFile.file_path]);
        } catch (e) {}
      }

      toast({
        title: 'Lỗi tải file',
        description: error.message || 'Không thể tải file lên',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setCurrentFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = async (fileToRemove: UploadedFile) => {
    try {
      await supabase.storage.from('task-submissions').remove([fileToRemove.file_path]);
      const newFiles = uploadedFiles.filter(f => f.file_path !== fileToRemove.file_path);
      onFilesChanged(newFiles);
    } catch (error) {
      toast({
        title: 'Lỗi xóa file',
        description: 'Không thể xóa file',
        variant: 'destructive',
      });
    }
  };

  const handlePreviewFile = (file: UploadedFile) => {
    const params = new URLSearchParams({
      path: file.file_path,
      name: file.file_name,
      size: file.file_size.toString()
    });
    navigate(`/file-preview?${params.toString()}`);
  };

  const startEditing = (index: number, currentName: string) => {
    setEditingIndex(index);
    const nameWithoutExt = currentName.substring(0, currentName.lastIndexOf('.')) || currentName;
    setEditingName(nameWithoutExt);
  };

  const saveEdit = (index: number) => {
    if (!editingName.trim()) {
      setEditingIndex(null);
      return;
    }
    
    const file = uploadedFiles[index];
    const ext = file.file_name.split('.').pop() || '';
    const newName = `${editingName.trim()}${ext ? '.' + ext : ''}`;
    
    const newFiles = [...uploadedFiles];
    newFiles[index] = { ...file, file_name: newName };
    onFilesChanged(newFiles);
    setEditingIndex(null);
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFilesSelect}
        disabled={disabled || isUploading}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.rar"
      />
      
      <div 
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all
          ${disabled || isUploading 
            ? 'border-muted bg-muted/20 cursor-not-allowed' 
            : 'border-blue-400/40 bg-blue-50/50 dark:bg-blue-950/20 hover:border-blue-500/60 hover:bg-blue-100/50 dark:hover:bg-blue-900/30'
          }
        `}
      >
        {isUploading ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{uploadProgress}%</span>
            </div>
            <p className="text-[10px] text-muted-foreground truncate px-2">{currentFileName}</p>
            <Progress value={uploadProgress} className="h-1" />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Upload className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {compact ? 'Chọn file' : 'Kéo thả hoặc nhấn để chọn'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] px-0.5">
        <span className="text-muted-foreground">
          {formatFileSize(currentTotalSize)} / 10MB
        </span>
        {remainingSize < 2 * 1024 * 1024 && remainingSize > 0 && (
          <span className="text-warning flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Sắp hết
          </span>
        )}
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-1 max-h-[100px] overflow-y-auto">
          {uploadedFiles.map((file, index) => (
            <div 
              key={file.file_path || index}
              className="flex items-center gap-1.5 p-1.5 rounded border bg-card hover:bg-accent/50 transition-colors group"
            >
              {getFileIcon(file.file_name)}
              
              {editingIndex === index ? (
                <div className="flex-1 flex items-center gap-1 min-w-0">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(index)}
                    className="h-5 text-[10px] px-1 py-0"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => saveEdit(index)}
                    className="h-5 w-5 shrink-0"
                  >
                    <Check className="w-3 h-3 text-green-500" />
                  </Button>
                </div>
              ) : (
                <div className="flex-1 min-w-0 flex items-center gap-1">
                  <span className="text-[10px] truncate">{file.file_name}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    ({formatFileSize(file.file_size)})
                  </span>
                </div>
              )}
              
              {editingIndex !== index && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => startEditing(index, file.file_name)}
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      title="Đổi tên"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePreviewFile(file)}
                    className="h-5 w-5 text-muted-foreground hover:text-blue-500"
                    title="Xem"
                  >
                    <Eye className="w-2.5 h-2.5" />
                  </Button>
                  {!disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFile(file)}
                      className="h-5 w-5 text-muted-foreground hover:text-destructive"
                      title="Xóa"
                    >
                      <X className="w-2.5 h-2.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}