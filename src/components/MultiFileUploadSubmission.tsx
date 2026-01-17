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
  maxTotalSize?: number; // in bytes, default 10MB
}

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

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB default

export default function MultiFileUploadSubmission({
  onFilesChanged,
  uploadedFiles,
  userId,
  taskId,
  disabled = false,
  compact = false,
  maxTotalSize = DEFAULT_MAX_SIZE
}: MultiFileUploadSubmissionProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytesToUpload, setTotalBytesToUpload] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const currentTotalSize = uploadedFiles.reduce((sum, f) => sum + f.file_size, 0);
  const remainingSize = maxTotalSize - currentTotalSize;

  const handleFilesSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let newFilesTotalSize = 0;
    for (let i = 0; i < files.length; i++) {
      newFilesTotalSize += files[i].size;
    }

    // Chỉ kiểm tra dung lượng, không kiểm tra loại file
    if (currentTotalSize + newFilesTotalSize > maxTotalSize) {
      const maxMB = Math.round(maxTotalSize / (1024 * 1024));
      toast({
        title: `Tổng dung lượng vượt ${maxMB}MB`,
        description: `Đã dùng: ${formatFileSize(currentTotalSize)}, File mới: ${formatFileSize(newFilesTotalSize)}. Còn lại: ${formatFileSize(remainingSize)}`,
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadedBytes(0);

    const newUploadedFiles: UploadedFile[] = [];
    const totalFiles = files.length;
    let totalBytes = 0;
    let bytesUploaded = 0;

    // Calculate total bytes
    for (let i = 0; i < files.length; i++) {
      totalBytes += files[i].size;
    }
    setTotalBytesToUpload(totalBytes);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileName(file.name);
        
        const storageName = generateSafeStorageName(file.name);
        const filePath = `${userId}/${taskId}/${storageName}`;

        // Calculate progress for this file
        const startProgress = Math.round((bytesUploaded / totalBytes) * 100);
        const endProgress = Math.round(((bytesUploaded + file.size) / totalBytes) * 100);
        
        // Set initial progress
        setUploadProgress(startProgress);
        setUploadedBytes(bytesUploaded);

        // Use standard Supabase upload
        const { data, error } = await supabase.storage
          .from('task-submissions')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
          });

        // Update progress after upload completes for this file
        bytesUploaded += file.size;
        setUploadProgress(Math.round((bytesUploaded / totalBytes) * 100));
        setUploadedBytes(bytesUploaded);

        if (error) {
          // Log chi tiết lỗi để debug
          console.error('Upload error details:', {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            error: error
          });
          
          // Phân loại lỗi rõ ràng hơn
          let errorMessage = `Không thể tải "${file.name}"`;
          if (error.message.includes('duplicate') || error.message.includes('already exists')) {
            errorMessage = `File "${file.name}" đã tồn tại, đang thử ghi đè...`;
            // Thử upload lại với upsert
            const retryResult = await supabase.storage
              .from('task-submissions')
              .upload(filePath, file, { cacheControl: '3600', upsert: true });
            
            if (retryResult.error) {
              throw new Error(`Lỗi hệ thống khi tải "${file.name}". Vui lòng thử lại.`);
            }
            
            newUploadedFiles.push({
              file_path: retryResult.data.path,
              file_name: file.name,
              file_size: file.size,
              storage_name: storageName
            });
            continue;
          }
          
          throw new Error(errorMessage);
        }

        newUploadedFiles.push({
          file_path: data.path,
          file_name: file.name,
          file_size: file.size,
          storage_name: storageName
        });
      }

      // Hoàn thành 100% với animation
      setUploadProgress(100);
      
      const allFiles = [...uploadedFiles, ...newUploadedFiles];
      onFilesChanged(allFiles);

      toast({
        title: 'Tải file thành công',
        description: `Đã tải lên ${newUploadedFiles.length} file`,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      
      // Rollback: xóa các file đã upload thành công trong batch này
      for (const uploadedFile of newUploadedFiles) {
        try {
          await supabase.storage.from('task-submissions').remove([uploadedFile.file_path]);
        } catch (e) {
          console.error('Rollback error:', e);
        }
      }

      toast({
        title: 'Lỗi tải file',
        description: error.message || 'Lỗi hệ thống, vui lòng thử lại',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadedBytes(0);
      setTotalBytesToUpload(0);
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
    const params = new URLSearchParams();
    params.set('path', file.file_path);
    params.set('name', file.file_name);
    params.set('size', file.file_size.toString());
    params.set('taskId', taskId);
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
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                Đang tải... {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytesToUpload)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground truncate px-2">{currentFileName}</p>
            <Progress value={uploadProgress} className="h-2 transition-all duration-150" />
            <p className="text-[10px] text-center text-muted-foreground">{uploadProgress}%</p>
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
          {formatFileSize(currentTotalSize)} / {formatFileSize(maxTotalSize)}
        </span>
        {remainingSize < maxTotalSize * 0.2 && remainingSize > 0 && (
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