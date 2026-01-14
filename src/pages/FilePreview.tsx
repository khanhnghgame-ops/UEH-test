import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Eye,
  FolderDown
} from 'lucide-react';
import uehLogo from '@/assets/ueh-logo-new.png';
import TaskNotes from '@/components/TaskNotes';
import JSZip from 'jszip';
import { isUUID } from '@/lib/urlUtils';

interface TaskFile {
  file_path: string;
  file_name: string;
  file_size: number;
  storage_name: string;
}

const getFileIcon = (fileName: string, size: 'sm' | 'lg' = 'lg') => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconClass = size === 'lg' ? 'w-16 h-16' : 'w-4 h-4';
  
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
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext || '');
};

const isPDF = (fileName: string) => {
  return fileName.toLowerCase().endsWith('.pdf');
};

const isOfficeDoc = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '');
};

const isTextFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'log', 'csv'].includes(ext || '');
};

const isVideoFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext || '');
};

const isAudioFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext || '');
};

export default function FilePreview() {
  // Support both semantic routes and legacy query params
  const { projectSlug, taskSlug, shareToken, fileIndex: fileIndexParam } = useParams<{
    projectSlug?: string;
    taskSlug?: string;
    shareToken?: string;
    fileIndex?: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([]);
  const [taskTitle, setTaskTitle] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'preview' | 'notes'>('preview');
  const [showNotesSidebar, setShowNotesSidebar] = useState(false);
  const [resolvedTaskId, setResolvedTaskId] = useState<string | null>(null);
  const [resolvedProjectSlug, setResolvedProjectSlug] = useState<string | null>(null);

  // Determine file index from route or query params
  const fileIndex = fileIndexParam ? parseInt(fileIndexParam) : null;
  
  // Legacy query params for backward compatibility
  const legacyFilePath = searchParams.get('path');
  const legacyFileName = searchParams.get('name') || 'file';
  const legacyFileSize = parseInt(searchParams.get('size') || '0');
  const legacyTaskId = searchParams.get('taskId') || searchParams.get('t');
  const legacyGroupId = searchParams.get('groupId') || searchParams.get('p');

  // Computed values
  const isSemanticRoute = !!(projectSlug && taskSlug);
  const isPublicRoute = !!shareToken;

  const handleGoBack = () => {
    if (isSemanticRoute || resolvedProjectSlug) {
      const slug = resolvedProjectSlug || projectSlug;
      navigate(`/p/${slug}?tab=tasks${resolvedTaskId ? `&task=${resolvedTaskId}` : ''}`);
    } else if (isPublicRoute) {
      navigate(`/s/${shareToken}`);
    } else if (legacyGroupId) {
      const projectPath = isUUID(legacyGroupId) ? `/groups/${legacyGroupId}` : `/p/${legacyGroupId}`;
      navigate(`${projectPath}?tab=tasks${legacyTaskId ? `&task=${legacyTaskId}` : ''}`);
    } else {
      navigate(-1);
    }
  };

  // Resolve task from semantic slug or legacy params
  useEffect(() => {
    if (isSemanticRoute) {
      resolveTaskFromSlugs();
    } else if (legacyTaskId) {
      setResolvedTaskId(legacyTaskId);
      fetchTaskData(legacyTaskId);
    }
  }, [projectSlug, taskSlug, legacyTaskId]);

  const resolveTaskFromSlugs = async () => {
    if (!projectSlug || !taskSlug) return;
    
    try {
      // Find project by slug
      const { data: group } = await supabase
        .from('groups')
        .select('id, slug')
        .eq('slug', projectSlug)
        .single();

      if (!group) {
        setError('Không tìm thấy project');
        setIsLoading(false);
        return;
      }

      setResolvedProjectSlug(group.slug);

      // Find task by slug within project
      const { data: task } = await supabase
        .from('tasks')
        .select('id, title, submission_link')
        .eq('group_id', group.id)
        .eq('slug', taskSlug)
        .single();

      if (!task) {
        setError('Không tìm thấy task');
        setIsLoading(false);
        return;
      }

      setResolvedTaskId(task.id);
      setTaskTitle(task.title || '');
      
      // Parse files from task
      if (task.submission_link) {
        try {
          const parsed = JSON.parse(task.submission_link);
          if (Array.isArray(parsed)) {
            const files = parsed.filter((item: any) => item.file_path) as TaskFile[];
            setTaskFiles(files);
            
            // Load file by index
            const idx = fileIndex ?? 0;
            if (files[idx]) {
              loadFileByPath(files[idx].file_path);
            } else {
              setError('File không tồn tại');
              setIsLoading(false);
            }
          }
        } catch (e) {
          console.error('Error parsing submission_link:', e);
        }
      }
    } catch (error) {
      console.error('Error resolving task:', error);
      setError('Có lỗi xảy ra');
      setIsLoading(false);
    }
  };

  const fetchTaskData = async (taskId: string) => {
    try {
      const { data: task } = await supabase
        .from('tasks')
        .select('title, submission_link, groups(slug)')
        .eq('id', taskId)
        .single();

      if (task) {
        setTaskTitle(task.title || '');
        if ((task as any).groups?.slug) {
          setResolvedProjectSlug((task as any).groups.slug);
        }
        
        // Parse files from submission_link
        if (task.submission_link) {
          try {
            const parsed = JSON.parse(task.submission_link);
            if (Array.isArray(parsed)) {
              const files = parsed.filter((item: any) => item.file_path) as TaskFile[];
              setTaskFiles(files);
            }
          } catch (e) {
            console.error('Error parsing submission_link:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching task data:', error);
    }
  };

  // Load file for legacy route
  useEffect(() => {
    if (!isSemanticRoute && legacyFilePath) {
      loadFileByPath(legacyFilePath);
    }
  }, [legacyFilePath, isSemanticRoute]);

  // Computed current file info
  const currentFileIndex = useMemo(() => {
    if (isSemanticRoute) {
      return fileIndex ?? 0;
    }
    if (!legacyFilePath || taskFiles.length === 0) return -1;
    return taskFiles.findIndex(f => f.file_path === legacyFilePath);
  }, [legacyFilePath, taskFiles, isSemanticRoute, fileIndex]);

  const currentFile = taskFiles[currentFileIndex] || null;
  const filePath = currentFile?.file_path || legacyFilePath;
  const fileName = currentFile?.file_name || legacyFileName || 'file';
  const fileSize = currentFile?.file_size || legacyFileSize || 0;
  const taskId = resolvedTaskId || legacyTaskId;

  const loadFileByPath = async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = supabase.storage
        .from('task-submissions')
        .getPublicUrl(path);

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

  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const handleDownloadAll = async () => {
    if (taskFiles.length === 0) return;
    
    setIsDownloadingAll(true);
    try {
      const zip = new JSZip();
      
      for (const file of taskFiles) {
        const { data } = supabase.storage
          .from('task-submissions')
          .getPublicUrl(file.file_path);
        
        const response = await fetch(data.publicUrl);
        const blob = await response.blob();
        zip.file(file.file_name, blob);
      }
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${taskTitle || 'task-files'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download all error:', err);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const navigateToFile = (file: TaskFile, index: number) => {
    if (isSemanticRoute) {
      // Use semantic URL
      navigate(`/p/${projectSlug}/t/${taskSlug}/f/${index}`);
    } else {
      // Legacy query params
      const params = new URLSearchParams(searchParams);
      params.set('path', file.file_path);
      params.set('name', file.file_name);
      params.set('size', file.file_size.toString());
      setSearchParams(params);
    }
  };

  const goToPrevFile = () => {
    if (currentFileIndex > 0) {
      navigateToFile(taskFiles[currentFileIndex - 1], currentFileIndex - 1);
    }
  };

  const goToNextFile = () => {
    if (currentFileIndex < taskFiles.length - 1) {
      navigateToFile(taskFiles[currentFileIndex + 1], currentFileIndex + 1);
    }
  };

  const canPreview = isPreviewableImage(fileName) || isPDF(fileName) || isOfficeDoc(fileName) || isTextFile(fileName) || isVideoFile(fileName) || isAudioFile(fileName);

  const getOfficeViewerUrl = (url: string) => {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  };
  
  // Text file content state
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  
  // Load text file content
  useEffect(() => {
    if (fileUrl && isTextFile(fileName)) {
      setIsLoadingText(true);
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => {
          setTextContent(text);
          setIsLoadingText(false);
        })
        .catch(err => {
          console.error('Error loading text file:', err);
          setIsLoadingText(false);
        });
    }
  }, [fileUrl, fileName]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-50 shrink-0">
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
                <div className="hidden sm:block">
                  <span className="font-semibold">Xem trước file</span>
                  {taskTitle && (
                    <span className="text-primary-foreground/70 text-sm ml-2">• {taskTitle}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {taskId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowNotesSidebar(!showNotesSidebar)}
                  className="gap-2"
                >
                  <FileEdit className="w-4 h-4" />
                  <span className="hidden sm:inline">Ghi chú</span>
                </Button>
              )}
              {taskFiles.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadAll}
                  disabled={isDownloadingAll}
                  className="gap-2"
                >
                  {isDownloadingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FolderDown className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Tải toàn bộ file</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* File Navigation Bar - only show if there are multiple files */}
      {taskFiles.length > 1 && (
        <div className="bg-muted/50 border-b shrink-0">
          <div className="container mx-auto px-4 py-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevFile}
                disabled={currentFileIndex <= 0}
                className="shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              <ScrollArea className="flex-1">
                <div className="flex gap-2 py-1">
                  {taskFiles.map((file, index) => (
                    <button
                      key={file.file_path}
                      onClick={() => navigateToFile(file, index)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors shrink-0 ${
                        index === currentFileIndex
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted border'
                      }`}
                    >
                      {getFileIcon(file.file_name, 'sm')}
                      <span className="max-w-[120px] truncate">{file.file_name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {formatFileSize(file.file_size)}
                      </Badge>
                    </button>
                  ))}
                </div>
              </ScrollArea>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextFile}
                disabled={currentFileIndex >= taskFiles.length - 1}
                className="shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              
              <span className="text-sm text-muted-foreground shrink-0">
                {currentFileIndex + 1} / {taskFiles.length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview Area */}
        <main className={`flex-1 container mx-auto px-4 py-4 overflow-auto ${showNotesSidebar ? 'hidden md:block md:w-1/2 lg:w-2/3' : ''}`}>
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
            <div className="space-y-4 h-full">
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
              <Card className="overflow-hidden flex-1">
                {canPreview ? (
                  <div className="bg-muted/30">
                    {isPreviewableImage(fileName) ? (
                      <div className="flex items-center justify-center p-2 sm:p-4 min-h-[50vh] sm:min-h-[60vh]">
                        <img
                          src={fileUrl!}
                          alt={fileName}
                          className="max-w-full max-h-[60vh] sm:max-h-[70vh] object-contain rounded-lg shadow-lg"
                          onError={() => setError('Không thể hiển thị ảnh')}
                        />
                      </div>
                    ) : isPDF(fileName) ? (
                      <div className="w-full" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
                        <iframe
                          src={`${fileUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`}
                          className="w-full h-full border-0"
                          title={fileName}
                          style={{ 
                            WebkitOverflowScrolling: 'touch',
                            overflow: 'auto'
                          }}
                          allow="fullscreen"
                        />
                      </div>
                    ) : isOfficeDoc(fileName) && fileUrl ? (
                      <div className="w-full" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
                        <iframe
                          src={getOfficeViewerUrl(fileUrl)}
                          className="w-full h-full border-0"
                          title={fileName}
                          style={{ 
                            WebkitOverflowScrolling: 'touch',
                            overflow: 'auto'
                          }}
                          allow="fullscreen"
                        />
                      </div>
                    ) : isVideoFile(fileName) && fileUrl ? (
                      <div className="flex items-center justify-center p-4 min-h-[50vh]">
                        <video
                          src={fileUrl}
                          controls
                          className="max-w-full max-h-[70vh] rounded-lg shadow-lg"
                          onError={() => setError('Không thể phát video')}
                        >
                          Trình duyệt không hỗ trợ phát video.
                        </video>
                      </div>
                    ) : isAudioFile(fileName) && fileUrl ? (
                      <div className="flex flex-col items-center justify-center p-8 min-h-[40vh]">
                        {getFileIcon(fileName)}
                        <h3 className="text-lg font-medium mt-4 mb-6">{fileName}</h3>
                        <audio
                          src={fileUrl}
                          controls
                          className="w-full max-w-md"
                          onError={() => setError('Không thể phát audio')}
                        >
                          Trình duyệt không hỗ trợ phát audio.
                        </audio>
                      </div>
                    ) : isTextFile(fileName) ? (
                      <div className="w-full" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
                        {isLoadingText ? (
                          <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          </div>
                        ) : (
                          <ScrollArea className="h-full">
                            <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words bg-muted/30">
                              {textContent || 'Không thể đọc nội dung file'}
                            </pre>
                          </ScrollArea>
                        )}
                      </div>
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

        {/* Notes Sidebar */}
        {taskId && showNotesSidebar && (
          <aside className="w-full md:w-1/2 lg:w-1/3 border-l bg-background overflow-hidden flex flex-col">
            <div className="p-4 border-b shrink-0 flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <FileEdit className="w-5 h-5 text-primary" />
                Ghi chú Task
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNotesSidebar(false)}
                className="md:hidden"
              >
                <Eye className="w-4 h-4 mr-1" />
                Xem file
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <TaskNotes taskId={taskId} compact />
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Tabs - only show on mobile when notes sidebar is open */}
      {taskId && showNotesSidebar && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t p-2">
          <div className="flex gap-2">
            <Button
              variant={activeTab === 'preview' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => {
                setActiveTab('preview');
                setShowNotesSidebar(false);
              }}
            >
              <Eye className="w-4 h-4 mr-2" />
              Xem file
            </Button>
            <Button
              variant={activeTab === 'notes' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => {
                setActiveTab('notes');
                setShowNotesSidebar(true);
              }}
            >
              <FileEdit className="w-4 h-4 mr-2" />
              Ghi chú
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}