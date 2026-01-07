import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Image, File, Download, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { ScoreAppeal, AppealAttachment } from '@/types/processScores';

interface AppealReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  appeal: ScoreAppeal | null;
  onApprove: (response: string) => Promise<void>;
  onReject: (response: string) => Promise<void>;
  isLoading?: boolean;
}

export default function AppealReviewDialog({
  isOpen,
  onClose,
  appeal,
  onApprove,
  onReject,
  isLoading = false,
}: AppealReviewDialogProps) {
  const [response, setResponse] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (!appeal) return null;

  const getFileIcon = (type: string | null) => {
    if (type?.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (type?.includes('pdf') || type?.includes('document')) return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handlePreview = async (attachment: AppealAttachment) => {
    const { data } = await supabase.storage
      .from('appeal-attachments')
      .createSignedUrl(attachment.file_path, 3600);
    
    if (data?.signedUrl) {
      if (attachment.file_type?.startsWith('image/') || attachment.file_type?.includes('pdf')) {
        setPreviewUrl(data.signedUrl);
      } else {
        window.open(data.signedUrl, '_blank');
      }
    }
  };

  const handleDownload = async (attachment: AppealAttachment) => {
    const { data } = await supabase.storage
      .from('appeal-attachments')
      .download(attachment.file_path);
    
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const getStatusBadge = () => {
    switch (appeal.status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Chờ xử lý</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Đã chấp nhận</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Đã từ chối</Badge>;
    }
  };

  const getTypeLabel = () => {
    switch (appeal.appeal_type) {
      case 'task': return 'Task';
      case 'stage': return 'Giai đoạn';
      case 'final': return 'Điểm cuối';
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>📋</span>
              Xem xét phúc khảo
            </DialogTitle>
            <DialogDescription>
              Phúc khảo điểm {getTypeLabel()} từ {appeal.profiles?.full_name || 'Thành viên'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Status & Info */}
            <div className="flex items-center gap-4 flex-wrap">
              {getStatusBadge()}
              <span className="text-sm text-muted-foreground">
                Gửi lúc: {new Date(appeal.created_at).toLocaleString('vi-VN')}
              </span>
            </div>

            {/* Appeal Content */}
            <div className="p-4 rounded-lg bg-muted/50">
              <Label className="text-sm font-medium mb-2 block">Nội dung phúc khảo:</Label>
              <p className="text-sm whitespace-pre-wrap">{appeal.content}</p>
            </div>

            {/* Attachments */}
            {appeal.attachments && appeal.attachments.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Minh chứng đính kèm:</Label>
                <div className="grid gap-2">
                  {appeal.attachments.map((attachment) => (
                    <div 
                      key={attachment.id} 
                      className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      {getFileIcon(attachment.file_type)}
                      <span className="flex-1 truncate text-sm">{attachment.file_name}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatFileSize(attachment.file_size)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(attachment)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(attachment)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Previous Response (if any) */}
            {appeal.response && (
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                <Label className="text-sm font-medium mb-2 block">Phản hồi từ Leader:</Label>
                <p className="text-sm whitespace-pre-wrap">{appeal.response}</p>
                {appeal.responded_at && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Phản hồi lúc: {new Date(appeal.responded_at).toLocaleString('vi-VN')}
                  </p>
                )}
              </div>
            )}

            {/* Response Input (only for pending) */}
            {appeal.status === 'pending' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Phản hồi của bạn <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Nhập phản hồi cho phúc khảo này..."
                  rows={3}
                />
              </div>
            )}
          </div>

          {appeal.status === 'pending' && (
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                Đóng
              </Button>
              <Button 
                variant="destructive"
                onClick={() => onReject(response)} 
                disabled={isLoading || !response.trim()}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                Từ chối
              </Button>
              <Button 
                onClick={() => onApprove(response)} 
                disabled={isLoading || !response.trim()}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Chấp nhận
              </Button>
            </DialogFooter>
          )}
          
          {appeal.status !== 'pending' && (
            <DialogFooter>
              <Button onClick={onClose}>Đóng</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      {previewUrl && (
        <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Xem trước minh chứng</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center min-h-[400px]">
              {previewUrl.includes('.pdf') ? (
                <iframe src={previewUrl} className="w-full h-[70vh]" />
              ) : (
                <img src={previewUrl} alt="Preview" className="max-w-full max-h-[70vh] object-contain" />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
