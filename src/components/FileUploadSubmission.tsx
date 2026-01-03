import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  AlertCircle
} from 'lucide-react';

interface UploadedFile {
  file_path: string;
  file_name: string;
  file_size: number;
}

interface FileUploadSubmissionProps {
  onFileUploaded: (file: UploadedFile) => void;
  onFileRemoved: () => void;
  uploadedFile: UploadedFile | null;
  userId: string;
  taskId: string;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return <FileText className="w-5 h-5 text-red-500" />;
    case 'doc':
    case 'docx':
      return <FileText className="w-5 h-5 text-blue-500" />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
    case 'ppt':
    case 'pptx':
      return <Presentation className="w-5 h-5 text-orange-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return <ImageIcon className="w-5 h-5 text-purple-500" />;
    default:
      return <File className="w-5 h-5 text-muted-foreground" />;
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

export default function FileUploadSubmission({
  onFileUploaded,
  onFileRemoved,
  uploadedFile,
  userId,
  taskId,
  disabled = false
}: FileUploadSubmissionProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File quá lớn',
        description: (
          <div className="space-y-2">
            <p>File vượt quá giới hạn 5MB ({formatFileSize(file.size)}).</p>
            <p className="text-xs text-muted-foreground">
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

    try {
      // Simulate progress for UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${userId}/${taskId}/${fileName}`;

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from('task-submissions')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      clearInterval(progressInterval);

      if (error) throw error;

      setUploadProgress(100);

      onFileUploaded({
        file_path: data.path,
        file_name: file.name,
        file_size: file.size
      });

      toast({
        title: 'Tải file thành công',
        description: `Đã tải lên: ${file.name}`,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
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

  const handleRemoveFile = async () => {
    if (!uploadedFile) return;

    try {
      await supabase.storage
        .from('task-submissions')
        .remove([uploadedFile.file_path]);
      
      onFileRemoved();
    } catch (error) {
      console.error('Remove error:', error);
    }
  };

  return (
    <div className="space-y-3">
      {!uploadedFile ? (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            disabled={disabled || isUploading}
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.rar"
          />
          
          <div 
            onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
              ${disabled || isUploading 
                ? 'border-muted bg-muted/20 cursor-not-allowed' 
                : 'border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10'
              }
            `}
          >
            {isUploading ? (
              <div className="space-y-3">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Đang tải lên...</p>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-2 text-primary/60" />
                <p className="text-sm font-medium">Kéo thả hoặc nhấn để chọn file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tối đa 5MB • PDF, Word, Excel, PowerPoint, ảnh
                </p>
              </>
            )}
          </div>

          <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
            <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning">
              File trên 5MB? Hãy tải lên Drive/OneDrive và nộp bằng link.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-muted/30">
          {getFileIcon(uploadedFile.file_name)}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{uploadedFile.file_name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(uploadedFile.file_size)}</p>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRemoveFile}
              className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
