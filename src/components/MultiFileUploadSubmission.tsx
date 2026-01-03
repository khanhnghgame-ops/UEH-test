import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
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
  Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface UploadedFile {
  file_path: string;
  file_name: string;
  file_size: number;
  storage_name: string; // Safe storage name (UUID-based)
}

interface MultiFileUploadSubmissionProps {
  onFilesChanged: (files: UploadedFile[]) => void;
  uploadedFiles: UploadedFile[];
  userId: string;
  taskId: string;
  disabled?: boolean;
}

const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total per task

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return <FileText className="w-4 h-4 text-red-500" />;
    case 'doc':
    case 'docx':
      return <FileText className="w-4 h-4 text-blue-500" />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
    case 'ppt':
    case 'pptx':
      return <Presentation className="w-4 h-4 text-orange-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return <ImageIcon className="w-4 h-4 text-purple-500" />;
    default:
      return <File className="w-4 h-4 text-muted-foreground" />;
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

/**
 * Generate a safe storage name using UUID to avoid "Invalid key" errors
 * from special characters, Vietnamese diacritics, spaces, or long filenames
 */
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
  disabled = false
}: MultiFileUploadSubmissionProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const currentTotalSize = uploadedFiles.reduce((sum, f) => sum + f.file_size, 0);
  const remainingSize = MAX_TOTAL_SIZE - currentTotalSize;

  const handleFilesSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Calculate total size of new files
    let newFilesTotalSize = 0;
    for (let i = 0; i < files.length; i++) {
      newFilesTotalSize += files[i].size;
    }

    // Check if adding these files would exceed the limit
    if (currentTotalSize + newFilesTotalSize > MAX_TOTAL_SIZE) {
      toast({
        title: 'Tổng dung lượng vượt 10MB',
        description: (
          <div className="space-y-2">
            <p>Đã dùng: {formatFileSize(currentTotalSize)}</p>
            <p>File mới: {formatFileSize(newFilesTotalSize)}</p>
            <p>Tổng: {formatFileSize(currentTotalSize + newFilesTotalSize)} (vượt giới hạn 10MB)</p>
            <p className="text-xs text-muted-foreground mt-2">
              Vui lòng tải file lên Google Drive, OneDrive, v.v. và nộp bằng link.
            </p>
          </div>
        ),
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const newUploadedFiles: UploadedFile[] = [];
    const totalFiles = files.length;
    let filesProcessed = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Generate safe storage name (UUID-based) to avoid "Invalid key" errors
        const storageName = generateSafeStorageName(file.name);
        const filePath = `${userId}/${taskId}/${storageName}`;

        // Upload file to Supabase Storage
        const { data, error } = await supabase.storage
          .from('task-submissions')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('Upload error for file:', file.name, error);
          throw new Error(`Lỗi tải file "${file.name}": ${error.message}`);
        }

        newUploadedFiles.push({
          file_path: data.path,
          file_name: file.name, // Keep original name for display
          file_size: file.size,
          storage_name: storageName
        });

        filesProcessed++;
        setUploadProgress(Math.round((filesProcessed / totalFiles) * 100));
      }

      // Merge with existing files
      const allFiles = [...uploadedFiles, ...newUploadedFiles];
      onFilesChanged(allFiles);

      toast({
        title: 'Tải file thành công',
        description: `Đã tải lên ${newUploadedFiles.length} file`,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      
      // Cleanup: remove any files that were uploaded before the error
      for (const uploadedFile of newUploadedFiles) {
        try {
          await supabase.storage
            .from('task-submissions')
            .remove([uploadedFile.file_path]);
        } catch (e) {
          console.warn('Failed to cleanup file:', e);
        }
      }

      toast({
        title: 'Lỗi tải file',
        description: error.message || 'Không thể tải file lên',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = async (fileToRemove: UploadedFile) => {
    try {
      await supabase.storage
        .from('task-submissions')
        .remove([fileToRemove.file_path]);
      
      const newFiles = uploadedFiles.filter(f => f.file_path !== fileToRemove.file_path);
      onFilesChanged(newFiles);
    } catch (error) {
      console.error('Remove error:', error);
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

  return (
    <div className="space-y-3">
      {/* Upload area */}
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
            border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
            ${disabled || isUploading 
              ? 'border-muted bg-muted/20 cursor-not-allowed' 
              : 'border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10'
            }
          `}
        >
          {isUploading ? (
            <div className="space-y-2">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Đang tải lên...</p>
              <Progress value={uploadProgress} className="h-1.5" />
            </div>
          ) : (
            <>
              <Upload className="w-6 h-6 mx-auto mb-1.5 text-primary/60" />
              <p className="text-xs font-medium">Kéo thả hoặc nhấn để chọn file</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Nhiều file • Tổng tối đa 10MB • PDF, Word, Excel, PowerPoint, ảnh
              </p>
            </>
          )}
        </div>

        {/* Size info */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
          <span>Đã dùng: {formatFileSize(currentTotalSize)} / 10MB</span>
          <span>Còn lại: {formatFileSize(remainingSize)}</span>
        </div>

        {remainingSize < 2 * 1024 * 1024 && remainingSize > 0 && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
            <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-[10px] text-warning">
              Sắp hết dung lượng. File lớn hơn hãy tải lên Drive và nộp bằng link.
            </p>
          </div>
        )}
      </div>

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
          {uploadedFiles.map((file, index) => (
            <div 
              key={file.file_path || index}
              className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30"
            >
              {getFileIcon(file.file_name)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{file.file_name}</p>
                <p className="text-[10px] text-muted-foreground">{formatFileSize(file.file_size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handlePreviewFile(file)}
                className="shrink-0 h-6 w-6 text-muted-foreground hover:text-primary"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveFile(file)}
                  className="shrink-0 h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
