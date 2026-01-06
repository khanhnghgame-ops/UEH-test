import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { 
  Download, 
  ArrowLeft, 
  FileText, 
  FileSpreadsheet, 
  Presentation,
  Image as ImageIcon,
  File,
  Loader2,
  AlertCircle
} from 'lucide-react';
import uehLogo from '@/assets/ueh-logo-new.png';

const getFileIcon = (fileName: string, size: 'sm' | 'lg' = 'lg') => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconClass = size === 'lg' ? 'w-16 h-16' : 'w-5 h-5';
  
  switch (ext) {
    case 'pdf':
      return <FileText className={`${iconClass} text-red-500`} />;
    case 'doc':
    case 'docx':
      return <FileText className={`${iconClass} text-blue-500`} />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className={`${iconClass} text-green-500`} />;
    case 'ppt':
    case 'pptx':
      return <Presentation className={`${iconClass} text-orange-500`} />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return <ImageIcon className={`${iconClass} text-purple-500`} />;
    default:
      return <File className={`${iconClass} text-muted-foreground`} />;
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const isPreviewableImage = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
};

const isPDF = (fileName: string) => {
  return fileName.toLowerCase().endsWith('.pdf');
};

const isOfficeDoc = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '');
};

export default function FilePreview() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filePath = searchParams.get('path');
  const fileName = searchParams.get('name') || 'file';
  const fileSize = parseInt(searchParams.get('size') || '0');
  const taskId = searchParams.get('taskId');
  const groupId = searchParams.get('groupId');

  const handleGoBack = () => {
    // Navigate to the correct project task page if we have group info
    if (groupId) {
      navigate(`/groups/${groupId}?tab=tasks${taskId ? `&task=${taskId}` : ''}`);
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    if (filePath) {
      loadFile();
    } else {
      setError('Không tìm thấy file');
      setIsLoading(false);
    }
  }, [filePath]);

  const loadFile = async () => {
    try {
      const { data } = supabase.storage
        .from('task-submissions')
        .getPublicUrl(filePath!);

      if (data?.publicUrl) {
        setFileUrl(data.publicUrl);
      } else {
        setError('Không thể tải file');
      }
    } catch (err) {
      setError('Lỗi khi tải file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!fileUrl) return;

    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const canPreview = isPreviewableImage(fileName) || isPDF(fileName) || isOfficeDoc(fileName);

  // Office Online Viewer URL
  const getOfficeViewerUrl = (url: string) => {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGoBack}
                className="text-primary-foreground hover:bg-primary-foreground/10"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Quay lại
              </Button>
              <div className="flex items-center gap-3">
                <img
                  src={uehLogo}
                  alt="Logo"
                  className="h-8 w-auto drop-shadow-md"
                  loading="lazy"
                />
                <span className="font-semibold hidden sm:block">Xem trước file</span>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={!fileUrl}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Tải xuống</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Đang tải file...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <AlertCircle className="w-16 h-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Không thể tải file</h2>
            <p className="text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File Info Card */}
            <Card className="p-4">
              <div className="flex items-center gap-4">
                {getFileIcon(fileName, 'sm')}
                <div className="flex-1 min-w-0">
                  <h1 className="font-semibold truncate">{fileName}</h1>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(fileSize)}
                  </p>
                </div>
                <Button onClick={handleDownload} className="gap-2 shrink-0">
                  <Download className="w-4 h-4" />
                  Tải xuống
                </Button>
              </div>
            </Card>

            {/* Preview Area */}
            <Card className="overflow-hidden">
              {canPreview ? (
                <div className="bg-muted/30">
                  {isPreviewableImage(fileName) ? (
                    <div className="flex items-center justify-center p-4 min-h-[60vh]">
                      <img
                        src={fileUrl!}
                        alt={fileName}
                        className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                        onError={() => setError('Không thể hiển thị ảnh')}
                      />
                    </div>
                  ) : isPDF(fileName) ? (
                    <iframe
                      src={`${fileUrl}#toolbar=0`}
                      className="w-full h-[80vh] border-0"
                      title={fileName}
                    />
                  ) : isOfficeDoc(fileName) && fileUrl ? (
                    <iframe
                      src={getOfficeViewerUrl(fileUrl)}
                      className="w-full h-[80vh] border-0"
                      title={fileName}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 min-h-[40vh] text-center">
                  {getFileIcon(fileName)}
                  <h2 className="text-xl font-semibold mt-6 mb-2">
                    Không thể xem trước file này
                  </h2>
                  <p className="text-muted-foreground mb-6 max-w-md">
                    Định dạng file này không hỗ trợ xem trước trực tiếp. 
                    Vui lòng tải file về để xem nội dung.
                  </p>
                  <Button onClick={handleDownload} className="gap-2">
                    <Download className="w-4 h-4" />
                    Tải xuống
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}