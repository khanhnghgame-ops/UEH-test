import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  ExternalLink, 
  ChevronDown, 
  Eye, 
  File, 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  Image as ImageIcon 
} from 'lucide-react';

interface SubmissionItem {
  title?: string;
  url?: string;
  file_path?: string;
  file_name?: string;
  file_size?: number;
  storage_name?: string; // Safe UUID-based storage name
  type?: 'link' | 'file';
}

interface SubmissionButtonProps {
  submissionLink: string | null;
  variant?: 'default' | 'compact';
  onStopPropagation?: boolean;
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return <FileText className="w-3 h-3 text-red-500" />;
    case 'doc':
    case 'docx':
      return <FileText className="w-3 h-3 text-blue-500" />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className="w-3 h-3 text-green-500" />;
    case 'ppt':
    case 'pptx':
      return <Presentation className="w-3 h-3 text-orange-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return <ImageIcon className="w-3 h-3 text-purple-500" />;
    default:
      return <File className="w-3 h-3 text-muted-foreground" />;
  }
};

export function parseSubmissionLinks(submissionLink: string | null): SubmissionItem[] {
  if (!submissionLink) return [];
  
  try {
    const parsed = JSON.parse(submissionLink);
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        ...item,
        type: item.file_path ? 'file' : 'link'
      }));
    }
    return [{ title: 'Bài nộp', url: submissionLink, type: 'link' }];
  } catch {
    return [{ title: 'Bài nộp', url: submissionLink, type: 'link' }];
  }
}

export default function SubmissionButton({ 
  submissionLink, 
  variant = 'default',
  onStopPropagation = true 
}: SubmissionButtonProps) {
  const navigate = useNavigate();
  
  if (!submissionLink) {
    return variant === 'compact' ? (
      <span className="text-[10px] text-muted-foreground px-2">Chưa có bài nộp</span>
    ) : null;
  }

  const items = parseSubmissionLinks(submissionLink);
  
  if (items.length === 0) {
    return variant === 'compact' ? (
      <span className="text-[10px] text-muted-foreground px-2">Chưa có bài nộp</span>
    ) : null;
  }

  const handleOpenItem = (item: SubmissionItem, e?: React.MouseEvent) => {
    if (onStopPropagation && e) {
      e.stopPropagation();
    }
    
    if (item.type === 'file' && item.file_path) {
      const params = new URLSearchParams({
        path: item.file_path,
        name: item.file_name || 'file',
        size: (item.file_size || 0).toString()
      });
      navigate(`/file-preview?${params.toString()}`);
    } else if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  if (items.length === 1) {
    const item = items[0];
    const isFile = item.type === 'file';
    
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs px-2 gap-1 text-primary"
        onClick={(e) => handleOpenItem(item, e)}
      >
        {isFile ? (
          <>
            <Eye className="w-3 h-3" />
            Xem file
          </>
        ) : (
          <>
            <ExternalLink className="w-3 h-3" />
            Xem bài nộp
          </>
        )}
      </Button>
    );
  }

  // Multiple items
  const hasFiles = items.some(i => i.type === 'file');
  const hasLinks = items.some(i => i.type === 'link');
  const filesCount = items.filter(i => i.type === 'file').length;
  const linksCount = items.filter(i => i.type === 'link').length;
  
  let label = `Xem bài (${items.length})`;
  if (hasFiles && hasLinks) {
    label = `${filesCount} file + ${linksCount} link`;
  } else if (hasFiles) {
    label = `Xem ${filesCount} file`;
  } else {
    label = `Xem ${linksCount} link`;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 text-primary"
          onClick={(e) => onStopPropagation && e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          {label}
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover min-w-[200px]">
        {items.map((item, i) => {
          const isFile = item.type === 'file';
          return (
            <DropdownMenuItem 
              key={i}
              onClick={(e) => handleOpenItem(item, e)}
              className="text-xs cursor-pointer"
            >
              {isFile ? (
                <>
                  {getFileIcon(item.file_name || 'file')}
                  <span className="ml-2 truncate">{item.title || item.file_name || 'File'}</span>
                  <Eye className="w-3 h-3 ml-auto opacity-50" />
                </>
              ) : (
                <>
                  <ExternalLink className="w-3 h-3 mr-2" />
                  <span className="truncate">{item.title || `Link ${i + 1}`}</span>
                </>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
