import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Download, 
  Upload, 
  Loader2, 
  FolderArchive,
  AlertTriangle,
  CheckCircle,
  File,
  MessageSquare
} from 'lucide-react';
import JSZip from 'jszip';

interface Group {
  id: string;
  name: string;
  description: string | null;
  class_code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
  additional_info: string | null;
  zalo_link: string | null;
  leader_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  image_url: string | null;
}

interface FileSubmission {
  original_path: string;
  file_name: string;
  file_size: number;
  zip_path: string;
}

interface BackupMessage {
  student_id: string;
  content: string;
  source_type: string;
  created_at: string;
}

interface BackupData {
  version: string;
  exported_at: string;
  project_name: string;
  group: Omit<Group, 'id'>;
  members: Array<{ user_id: string; role: string; joined_at: string; profile: { student_id: string; full_name: string; email: string } }>;
  stages: Array<{ name: string; description: string | null; order_index: number; start_date: string | null; end_date: string | null; tasks: Array<any> }>;
  tasks: Array<{
    title: string;
    description: string | null;
    status: string;
    deadline: string | null;
    submission_link: string | null;
    stage_name: string | null;
    assignments: Array<{ student_id: string }>;
    scores: Array<any>;
    submissions: Array<any>;
  }>;
  messages?: BackupMessage[];
  files?: FileSubmission[];
}

export default function AdminBackupRestore() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [exportProgress, setExportProgress] = useState<number>(0);

  useEffect(() => {
    if (isAdmin) {
      fetchAllGroups();
    }
  }, [isAdmin]);

  const fetchAllGroups = async () => {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('name');
    
    if (data && !error) {
      setGroups(data);
    }
  };

  const generateNewId = () => crypto.randomUUID();

  // Parse submission links to find file submissions
  const parseFileSubmissions = (submissionLink: string | null): { file_path: string; file_name: string; file_size: number }[] => {
    if (!submissionLink) return [];
    try {
      const parsed = JSON.parse(submissionLink);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(item => item.file_path)
          .map(item => ({
            file_path: item.file_path,
            file_name: item.file_name || 'file',
            file_size: item.file_size || 0
          }));
      }
    } catch {
      return [];
    }
    return [];
  };

  const exportProject = async () => {
    if (!selectedGroupId) {
      toast({ title: 'Lỗi', description: 'Vui lòng chọn project để sao lưu', variant: 'destructive' });
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    
    try {
      const group = groups.find(g => g.id === selectedGroupId);
      if (!group) throw new Error('Không tìm thấy project');

      setExportProgress(10);

      // Fetch all related data including messages
      const [membersRes, stagesRes, tasksRes, messagesRes] = await Promise.all([
        supabase
          .from('group_members')
          .select('user_id, role, joined_at')
          .eq('group_id', selectedGroupId),
        supabase
          .from('stages')
          .select('*')
          .eq('group_id', selectedGroupId)
          .order('order_index'),
        supabase
          .from('tasks')
          .select('*')
          .eq('group_id', selectedGroupId),
        supabase
          .from('project_messages')
          .select('*')
          .eq('group_id', selectedGroupId)
          .order('created_at')
      ]);

      setExportProgress(30);

      // Fetch profiles for members
      const memberUserIds = membersRes.data?.map(m => m.user_id) || [];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, student_id, full_name, email')
        .in('id', memberUserIds);

      // Fetch task assignments, scores, and submissions
      const taskIds = tasksRes.data?.map(t => t.id) || [];
      const [assignmentsRes, scoresRes, submissionsRes] = await Promise.all([
        supabase.from('task_assignments').select('*').in('task_id', taskIds),
        supabase.from('task_scores').select('*').in('task_id', taskIds),
        supabase.from('submission_history').select('*').in('task_id', taskIds)
      ]);

      setExportProgress(50);

      // Collect all file paths from tasks and submissions
      const filesToDownload: { path: string; name: string; size: number }[] = [];
      
      // Check tasks for file submissions
      tasksRes.data?.forEach(task => {
        const files = parseFileSubmissions(task.submission_link);
        files.forEach(f => filesToDownload.push({ path: f.file_path, name: f.file_name, size: f.file_size }));
      });
      
      // Check submission history for file submissions
      submissionsRes.data?.forEach(sub => {
        if (sub.file_path && sub.file_name) {
          filesToDownload.push({ path: sub.file_path, name: sub.file_name, size: sub.file_size || 0 });
        }
        // Also check submission_link for file references
        const files = parseFileSubmissions(sub.submission_link);
        files.forEach(f => filesToDownload.push({ path: f.file_path, name: f.file_name, size: f.file_size }));
      });

      // Remove duplicates
      const uniqueFiles = Array.from(new Map(filesToDownload.map(f => [f.path, f])).values());

      // Build backup data with references by student_id instead of user_id
      const membersWithProfiles = membersRes.data?.map(m => {
        const profile = profilesData?.find(p => p.id === m.user_id);
        return {
          user_id: m.user_id,
          role: m.role,
          joined_at: m.joined_at,
          profile: {
            student_id: profile?.student_id || '',
            full_name: profile?.full_name || '',
            email: profile?.email || ''
          }
        };
      }) || [];

      const stagesMap = new Map<string, string>();
      stagesRes.data?.forEach(s => stagesMap.set(s.id, s.name));

      const userIdToStudentId = new Map<string, string>();
      profilesData?.forEach(p => userIdToStudentId.set(p.id, p.student_id));

      const tasksWithDetails = tasksRes.data?.map(task => {
        const taskAssignments = assignmentsRes.data?.filter(a => a.task_id === task.id) || [];
        const taskScores = scoresRes.data?.filter(s => s.task_id === task.id) || [];
        const taskSubmissions = submissionsRes.data?.filter(s => s.task_id === task.id) || [];

        return {
          title: task.title,
          description: task.description,
          status: task.status,
          deadline: task.deadline,
          submission_link: task.submission_link,
          stage_name: task.stage_id ? stagesMap.get(task.stage_id) || null : null,
          assignments: taskAssignments.map(a => ({
            student_id: userIdToStudentId.get(a.user_id) || ''
          })),
          scores: taskScores.map(s => ({
            student_id: userIdToStudentId.get(s.user_id) || '',
            base_score: s.base_score,
            late_penalty: s.late_penalty,
            review_penalty: s.review_penalty,
            review_count: s.review_count,
            early_bonus: s.early_bonus,
            bug_hunter_bonus: s.bug_hunter_bonus,
            final_score: s.final_score
          })),
          submissions: taskSubmissions.map(s => ({
            student_id: userIdToStudentId.get(s.user_id) || '',
            submission_link: s.submission_link,
            note: s.note,
            submitted_at: s.submitted_at,
            submission_type: s.submission_type,
            file_path: s.file_path,
            file_name: s.file_name,
            file_size: s.file_size
          }))
        };
      }) || [];

      // Process messages for backup
      const messagesForBackup: BackupMessage[] = messagesRes.data?.map(msg => ({
        student_id: userIdToStudentId.get(msg.user_id) || '',
        content: msg.content,
        source_type: msg.source_type,
        created_at: msg.created_at
      })) || [];

      setExportProgress(60);

      // Create ZIP file
      const zip = new JSZip();
      
      // File mapping for backup restoration
      const fileMapping: FileSubmission[] = [];

      // Download and add files to ZIP
      if (uniqueFiles.length > 0) {
        const filesFolder = zip.folder('files');
        let filesProcessed = 0;
        
        for (const file of uniqueFiles) {
          try {
            const { data } = supabase.storage
              .from('task-submissions')
              .getPublicUrl(file.path);
            
            if (data?.publicUrl) {
              const response = await fetch(data.publicUrl);
              if (response.ok) {
                const blob = await response.blob();
                const zipPath = `files/${file.path.replace(/\//g, '_')}`;
                filesFolder?.file(file.path.replace(/\//g, '_'), blob);
                fileMapping.push({
                  original_path: file.path,
                  file_name: file.name,
                  file_size: file.size,
                  zip_path: zipPath
                });
              }
            }
          } catch (err) {
            console.warn(`Could not download file: ${file.path}`, err);
          }
          
          filesProcessed++;
          setExportProgress(60 + Math.round((filesProcessed / uniqueFiles.length) * 20));
        }
      }

      setExportProgress(85);

      const backupData: BackupData = {
        version: '3.0', // Updated version for messages support
        exported_at: new Date().toISOString(),
        project_name: group.name,
        group: {
          name: group.name,
          description: group.description,
          class_code: group.class_code,
          instructor_name: group.instructor_name,
          instructor_email: group.instructor_email,
          additional_info: group.additional_info,
          zalo_link: group.zalo_link,
          leader_id: null,
          created_by: group.created_by,
          created_at: group.created_at,
          updated_at: group.updated_at,
          image_url: group.image_url
        },
        members: membersWithProfiles,
        stages: stagesRes.data?.map(s => ({
          name: s.name,
          description: s.description,
          order_index: s.order_index,
          start_date: s.start_date,
          end_date: s.end_date,
          tasks: []
        })) || [],
        tasks: tasksWithDetails,
        messages: messagesForBackup,
        files: fileMapping
      };

      zip.file('backup.json', JSON.stringify(backupData, null, 2));

      setExportProgress(95);

      const blob = await zip.generateAsync({ type: 'blob' });
      const fileName = `${group.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`;

      // Download file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);

      toast({ 
        title: 'Xuất thành công!', 
        description: `Đã sao lưu project "${group.name}" với ${fileMapping.length} file và ${messagesForBackup.length} tin nhắn.` 
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Lỗi xuất dữ liệu', description: String(error), variant: 'destructive' });
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const importProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress('Đang đọc file...');

    try {
      const zip = await JSZip.loadAsync(file);
      const backupFile = zip.file('backup.json');
      if (!backupFile) {
        throw new Error('File backup.json không tồn tại trong tệp ZIP');
      }

      const content = await backupFile.async('string');
      const backupData: BackupData = JSON.parse(content);

      if (!backupData.version || !backupData.group) {
        throw new Error('Định dạng file backup không hợp lệ');
      }

      setImportProgress('Đang tạo project mới...');

      // Create new group - let database generate the ID
      const { data: newGroup, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: `${backupData.group.name} (Bản sao)`,
          description: backupData.group.description,
          class_code: backupData.group.class_code,
          instructor_name: backupData.group.instructor_name,
          instructor_email: backupData.group.instructor_email,
          additional_info: backupData.group.additional_info,
          zalo_link: backupData.group.zalo_link,
          image_url: backupData.group.image_url || null,
          leader_id: user!.id,
          created_by: user!.id,
          slug: '', // Will be auto-generated by trigger
        })
        .select()
        .single();

      if (groupError || !newGroup) throw groupError || new Error('Không thể tạo project');
      
      const newGroupId = newGroup.id;

      setImportProgress('Đang thêm thành viên...');

      // Map student_id to user_id from existing profiles
      const studentIds = backupData.members.map(m => m.profile.student_id);
      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('id, student_id')
        .in('student_id', studentIds);

      const studentIdToUserId = new Map<string, string>();
      existingProfiles?.forEach(p => studentIdToUserId.set(p.student_id, p.id));

      // Add current admin as leader
      await supabase
        .from('group_members')
        .insert({
          group_id: newGroupId,
          user_id: user!.id,
          role: 'leader'
        });

      // Add existing members (if they exist in system)
      const memberInserts = backupData.members
        .filter(m => studentIdToUserId.has(m.profile.student_id) && studentIdToUserId.get(m.profile.student_id) !== user!.id)
        .map(m => ({
          group_id: newGroupId,
          user_id: studentIdToUserId.get(m.profile.student_id)!,
          role: m.role as 'admin' | 'leader' | 'member'
        }));

      if (memberInserts.length > 0) {
        await supabase.from('group_members').insert(memberInserts);
      }

      setImportProgress('Đang khôi phục file đính kèm...');

      // Upload files and create path mapping
      const oldToNewPath = new Map<string, string>();
      
      // Helper function to generate safe storage names (UUID-based) to avoid "Invalid key" errors
      const generateSafeStorageName = (originalName: string): string => {
        const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
        const uuid = crypto.randomUUID();
        return `${uuid}.${ext}`;
      };
      
      if (backupData.files && backupData.files.length > 0) {
        for (const fileInfo of backupData.files) {
          try {
            const zipPath = fileInfo.zip_path.replace('files/', '');
            const fileContent = await zip.file(`files/${zipPath}`)?.async('blob');
            
            if (fileContent) {
              // Use safe storage name to avoid "Invalid key" errors with special chars
              const safeStorageName = generateSafeStorageName(fileInfo.file_name);
              const newPath = `${user!.id}/${newGroupId}/${safeStorageName}`;
              
              const { error: uploadError } = await supabase.storage
                .from('task-submissions')
                .upload(newPath, fileContent);
              
              if (!uploadError) {
                oldToNewPath.set(fileInfo.original_path, newPath);
              }
            }
          } catch (err) {
            console.warn(`Could not restore file: ${fileInfo.file_name}`, err);
          }
        }
      }

      setImportProgress('Đang tạo các giai đoạn...');

      // Create stages and map old names to new IDs
      const stageNameToId = new Map<string, string>();
      for (const stage of backupData.stages) {
        const newStageId = generateNewId();
        await supabase
          .from('stages')
          .insert({
            id: newStageId,
            group_id: newGroupId,
            name: stage.name,
            description: stage.description,
            order_index: stage.order_index,
            start_date: stage.start_date,
            end_date: stage.end_date
          });
        stageNameToId.set(stage.name, newStageId);
      }

      setImportProgress('Đang khôi phục các task (không gửi thông báo)...');

      // Helper function to update file paths in submission_link JSON
      const updateFilePaths = (submissionLink: string | null): string | null => {
        if (!submissionLink) return null;
        try {
          const parsed = JSON.parse(submissionLink);
          if (Array.isArray(parsed)) {
            const updated = parsed.map(item => {
              if (item.file_path && oldToNewPath.has(item.file_path)) {
                return { ...item, file_path: oldToNewPath.get(item.file_path) };
              }
              return item;
            });
            return JSON.stringify(updated);
          }
        } catch {
          return submissionLink;
        }
        return submissionLink;
      };

      // Create tasks with is_restored = true to prevent notifications
      for (const task of backupData.tasks) {
        // Insert task with is_restored = true to skip notifications
        const { data: newTask } = await supabase
          .from('tasks')
          .insert({
            group_id: newGroupId,
            stage_id: task.stage_name ? stageNameToId.get(task.stage_name) || null : null,
            title: task.title,
            description: task.description,
            status: task.status as 'TODO' | 'IN_PROGRESS' | 'DONE' | 'VERIFIED',
            deadline: task.deadline,
            submission_link: updateFilePaths(task.submission_link),
            created_by: user!.id,
            is_restored: true, // Mark as restored to prevent notifications
            slug: '', // Will be auto-generated by trigger
          })
          .select()
          .single();
        
        const newTaskId = newTask?.id;
        if (!newTaskId) continue;

        // Create task assignments (no notification will be sent due to is_restored flag)
        const assignmentInserts = task.assignments
          .filter(a => studentIdToUserId.has(a.student_id))
          .map(a => ({
            task_id: newTaskId,
            user_id: studentIdToUserId.get(a.student_id)!
          }));

        if (assignmentInserts.length > 0) {
          await supabase.from('task_assignments').insert(assignmentInserts);
        }

        // Create task scores
        const scoreInserts = task.scores
          .filter(s => studentIdToUserId.has(s.student_id))
          .map(s => ({
            task_id: newTaskId,
            user_id: studentIdToUserId.get(s.student_id)!,
            base_score: s.base_score,
            late_penalty: s.late_penalty,
            review_penalty: s.review_penalty,
            review_count: s.review_count,
            early_bonus: s.early_bonus,
            bug_hunter_bonus: s.bug_hunter_bonus,
            final_score: s.final_score
          }));

        if (scoreInserts.length > 0) {
          await supabase.from('task_scores').insert(scoreInserts);
        }

        // Create submission history
        const submissionInserts = task.submissions
          .filter(s => studentIdToUserId.has(s.student_id))
          .map(s => {
            const newFilePath = s.file_path && oldToNewPath.has(s.file_path) 
              ? oldToNewPath.get(s.file_path) 
              : s.file_path;
            
            return {
              task_id: newTaskId,
              user_id: studentIdToUserId.get(s.student_id)!,
              submission_link: updateFilePaths(s.submission_link),
              note: s.note,
              submitted_at: s.submitted_at,
              submission_type: s.submission_type || 'link',
              file_path: newFilePath,
              file_name: s.file_name,
              file_size: s.file_size
            };
          });

        if (submissionInserts.length > 0) {
          await supabase.from('submission_history').insert(submissionInserts);
        }
      }

      // Restore messages if available
      let messagesRestored = 0;
      if (backupData.messages && backupData.messages.length > 0) {
        setImportProgress('Đang khôi phục tin nhắn...');
        
        const messageInserts = backupData.messages
          .filter(msg => studentIdToUserId.has(msg.student_id))
          .map(msg => ({
            group_id: newGroupId,
            user_id: studentIdToUserId.get(msg.student_id)!,
            content: msg.content,
            source_type: msg.source_type || 'direct',
            created_at: msg.created_at
          }));

        if (messageInserts.length > 0) {
          const { error: msgError } = await supabase.from('project_messages').insert(messageInserts);
          if (!msgError) {
            messagesRestored = messageInserts.length;
          }
        }
      }

      setImportProgress('Hoàn tất!');

      toast({ 
        title: 'Khôi phục thành công!', 
        description: `Đã tạo bản sao project "${backupData.project_name}" với ${oldToNewPath.size} file và ${messagesRestored} tin nhắn. Các task được đánh dấu là dữ liệu khôi phục, không có thông báo nào được gửi.` 
      });

      // Refresh groups list
      fetchAllGroups();

    } catch (error) {
      console.error('Import error:', error);
      toast({ title: 'Lỗi khôi phục', description: String(error), variant: 'destructive' });
    } finally {
      setIsImporting(false);
      setImportProgress('');
      // Reset file input
      event.target.value = '';
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <FolderArchive className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Sao lưu & Khôi phục
              <span className="text-xs font-normal text-amber-600 bg-amber-500/10 px-2 py-1 rounded-full">Admin</span>
            </CardTitle>
            <CardDescription>Xuất và nhập dữ liệu project với file đính kèm và tin nhắn</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export Section */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Download className="w-4 h-4" />
            Sao lưu Project
          </Label>
          <div className="flex gap-3">
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Chọn project để sao lưu..." />
              </SelectTrigger>
              <SelectContent>
                {groups.map(group => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={exportProject} 
              disabled={!selectedGroupId || isExporting}
              className="gap-2"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang xuất...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Xuất ZIP
                </>
              )}
            </Button>
          </div>
          {isExporting && exportProgress > 0 && (
            <div className="space-y-1">
              <Progress value={exportProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{exportProgress}%</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Xuất toàn bộ dữ liệu: thông tin project, thành viên, giai đoạn, task, điểm số, lịch sử nộp bài, tin nhắn và file đính kèm.
          </p>
        </div>

        <div className="border-t pt-6 space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Khôi phục Project
          </Label>
          <div className="flex items-center gap-3">
            <Input 
              type="file" 
              accept=".zip" 
              onChange={importProject}
              disabled={isImporting}
              className="flex-1"
            />
          </div>
          {isImporting && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {importProgress}
            </div>
          )}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-400">
              <p className="font-medium mb-1">Lưu ý quan trọng:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Dữ liệu sẽ được khôi phục thành project mới với ID hoàn toàn mới</li>
                <li>File đính kèm và tin nhắn sẽ được tải lên lại với đường dẫn mới</li>
                <li>Chỉ những thành viên đã tồn tại trong hệ thống mới được thêm vào project</li>
                <li>Admin hiện tại sẽ trở thành Leader của project mới</li>
                <li><strong>Task khôi phục sẽ KHÔNG gửi thông báo cho member</strong></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-green-700 dark:text-green-400">
            <p className="font-medium mb-1">Tính năng hỗ trợ:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Sao lưu đầy đủ: thông tin project, giai đoạn, task, điểm số</li>
              <li className="flex items-center gap-1">
                <File className="w-3 h-3 inline" />
                Đóng gói file đính kèm trực tiếp vào ZIP
              </li>
              <li className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3 inline" />
                Sao lưu và khôi phục tin nhắn
              </li>
              <li>Tự động làm mới ID để tránh xung đột dữ liệu</li>
              <li>Liên kết thành viên dựa trên MSSV (không phụ thuộc vào user_id cũ)</li>
              <li><strong>Task khôi phục được đánh dấu riêng, không gửi thông báo</strong></li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
