import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Download, 
  Upload, 
  Loader2, 
  FolderArchive,
  AlertTriangle,
  CheckCircle
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
}

export default function AdminBackupRestore() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');

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

  const exportProject = async () => {
    if (!selectedGroupId) {
      toast({ title: 'Lỗi', description: 'Vui lòng chọn project để sao lưu', variant: 'destructive' });
      return;
    }

    setIsExporting(true);
    try {
      const group = groups.find(g => g.id === selectedGroupId);
      if (!group) throw new Error('Không tìm thấy project');

      // Fetch all related data
      const [membersRes, stagesRes, tasksRes] = await Promise.all([
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
          .eq('group_id', selectedGroupId)
      ]);

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
            submitted_at: s.submitted_at
          }))
        };
      }) || [];

      const backupData: BackupData = {
        version: '1.0',
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
          leader_id: null, // Will be re-assigned during import
          created_by: group.created_by,
          created_at: group.created_at,
          updated_at: group.updated_at
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
        tasks: tasksWithDetails
      };

      // Create ZIP file
      const zip = new JSZip();
      zip.file('backup.json', JSON.stringify(backupData, null, 2));

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

      toast({ 
        title: 'Xuất thành công!', 
        description: `Đã sao lưu project "${group.name}" thành công.` 
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Lỗi xuất dữ liệu', description: String(error), variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const importProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      toast({ title: 'Lỗi', description: 'Vui lòng chọn file .zip', variant: 'destructive' });
      event.target.value = '';
      return;
    }

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

      // Create new group with new ID
      const newGroupId = generateNewId();
      const { error: groupError } = await supabase
        .from('groups')
        .insert({
          id: newGroupId,
          name: `${backupData.group.name} (Bản sao)`,
          description: backupData.group.description,
          class_code: backupData.group.class_code,
          instructor_name: backupData.group.instructor_name,
          instructor_email: backupData.group.instructor_email,
          additional_info: backupData.group.additional_info,
          zalo_link: backupData.group.zalo_link,
          leader_id: user!.id,
          created_by: user!.id
        });

      if (groupError) throw groupError;

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

      setImportProgress('Đang tạo các task...');

      // Create tasks with new IDs
      for (const task of backupData.tasks) {
        const newTaskId = generateNewId();
        await supabase
          .from('tasks')
          .insert({
            id: newTaskId,
            group_id: newGroupId,
            stage_id: task.stage_name ? stageNameToId.get(task.stage_name) || null : null,
            title: task.title,
            description: task.description,
            status: task.status as 'TODO' | 'IN_PROGRESS' | 'DONE' | 'VERIFIED',
            deadline: task.deadline,
            submission_link: task.submission_link,
            created_by: user!.id
          });

        // Create task assignments
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
          .map(s => ({
            task_id: newTaskId,
            user_id: studentIdToUserId.get(s.student_id)!,
            submission_link: s.submission_link,
            note: s.note,
            submitted_at: s.submitted_at
          }));

        if (submissionInserts.length > 0) {
          await supabase.from('submission_history').insert(submissionInserts);
        }
      }

      setImportProgress('Hoàn tất!');

      toast({ 
        title: 'Khôi phục thành công!', 
        description: `Đã tạo bản sao project "${backupData.project_name}" với dữ liệu đầy đủ.` 
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
            <CardDescription>Xuất và nhập dữ liệu project với cơ chế tự động làm mới ID</CardDescription>
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
          <p className="text-xs text-muted-foreground">
            Xuất toàn bộ dữ liệu: thông tin project, thành viên, giai đoạn, task, điểm số và lịch sử nộp bài.
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
                <li>Chỉ những thành viên đã tồn tại trong hệ thống mới được thêm vào project</li>
                <li>Admin hiện tại sẽ trở thành Leader của project mới</li>
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
              <li>Tự động làm mới ID để tránh xung đột dữ liệu</li>
              <li>Liên kết thành viên dựa trên MSSV (không phụ thuộc vào user_id cũ)</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
