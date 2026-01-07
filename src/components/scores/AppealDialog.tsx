import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, X, FileText, Image, File } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AppealDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, files: File[]) => Promise<void>;
  title: string;
  description: string;
  currentScore: number;
  adjustment: number;
  adjustmentReason: string | null;
  isLoading?: boolean;
}

export default function AppealDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  description,
  currentScore,
  adjustment,
  adjustmentReason,
  isLoading = false,
}: AppealDialogProps) {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    for (const file of selectedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: 'File quá lớn',
          description: `File "${file.name}" vượt quá 10MB`,
          variant: 'destructive',
        });
        return;
      }
    }
    
    setFiles(prev => [...prev, ...selectedFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (type.includes('pdf') || type.includes('document')) return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await onSubmit(content.trim(), files);
    setContent('');
    setFiles([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>📝</span>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Score Info */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Điểm gốc:</span>
              <span className="font-medium">100</span>
            </div>
            {adjustment !== 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Điều chỉnh:</span>
                <Badge variant={adjustment < 0 ? 'destructive' : 'default'}>
                  {adjustment > 0 ? '+' : ''}{adjustment}
                </Badge>
              </div>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t">
              <span className="text-muted-foreground">Điểm hiện tại:</span>
              <span className="font-bold text-lg">{currentScore}</span>
            </div>
          </div>

          {/* Adjustment Reason */}
          {adjustmentReason && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-medium text-destructive mb-1">Lý do điều chỉnh từ Leader:</p>
              <p className="text-sm">{adjustmentReason}</p>
            </div>
          )}

          {/* Appeal Content */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Nội dung phúc khảo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Trình bày lý do phúc khảo của bạn..."
              rows={4}
            />
          </div>

          {/* File Attachments */}
          <div className="space-y-2">
            <Label>Minh chứng đính kèm (tối đa 10MB/file)</Label>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            />
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              Chọn file minh chứng
            </Button>

            {files.length > 0 && (
              <div className="space-y-2 mt-2">
                {files.map((file, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm"
                  >
                    {getFileIcon(file.type)}
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatFileSize(file.size)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeFile(index)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || !content.trim()}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Gửi phúc khảo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
