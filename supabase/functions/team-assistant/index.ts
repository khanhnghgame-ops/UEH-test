import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Usage limits - 100 words/message, quota calculated on client side
const MAX_MESSAGE_WORDS = 100;

interface TaskData {
  id: string;
  short_id: string;
  title: string;
  status: string;
  deadline: string | null;
  deadlineFormatted: string | null;
  stageName: string | null;
  assignees: string[];
  isOverdue: boolean;
  daysUntilDeadline: number | null;
}

interface ProjectContext {
  project: {
    id: string;
    name: string;
    description: string | null;
    classCode: string | null;
    instructorName: string | null;
  };
  stages: Array<{
    id: string;
    name: string;
    taskCount: number;
  }>;
  members: Array<{
    id: string;
    name: string;
    role: string;
    studentId: string;
  }>;
  tasks: TaskData[];
  currentUser: {
    name: string;
    role: string;
    assignedTasks: string[];
  };
}

function buildProjectContext(context: ProjectContext): string {
  const tasksByStatus = {
    TODO: context.tasks.filter(t => t.status === 'TODO'),
    IN_PROGRESS: context.tasks.filter(t => t.status === 'IN_PROGRESS'),
    DONE: context.tasks.filter(t => t.status === 'DONE'),
    VERIFIED: context.tasks.filter(t => t.status === 'VERIFIED'),
  };
  
  const overdueTasks = context.tasks.filter(t => t.isOverdue);
  const upcomingTasks = context.tasks.filter(t => 
    t.daysUntilDeadline !== null && 
    t.daysUntilDeadline >= 0 && 
    t.daysUntilDeadline <= 3 &&
    !t.isOverdue
  );
  
  // Build task list with clear identifiers
  const taskListFormatted = context.tasks.map((t, index) => {
    const deadlineInfo = t.deadlineFormatted 
      ? (t.isOverdue 
          ? `⚠️ QUÁ HẠN (${t.deadlineFormatted})` 
          : (t.daysUntilDeadline !== null && t.daysUntilDeadline <= 3 
              ? `⏰ Còn ${t.daysUntilDeadline} ngày (${t.deadlineFormatted})` 
              : `📅 ${t.deadlineFormatted}`))
      : 'Không có deadline';
    
    return `  ${index + 1}. [#${t.short_id}] "${t.title}"
     - Trạng thái: ${t.status}
     - Giai đoạn: ${t.stageName || 'Chưa phân giai đoạn'}
     - Deadline: ${deadlineInfo}
     - Người thực hiện: ${t.assignees.length > 0 ? t.assignees.join(', ') : 'Chưa phân công'}`;
  }).join('\n');

  return `
=== PROJECT: ${context.project.name} ===
ID: ${context.project.id}
Mô tả: ${context.project.description || 'Không có mô tả'}
Mã lớp: ${context.project.classCode || 'N/A'}
Giảng viên: ${context.project.instructorName || 'N/A'}

--- GIAI ĐOẠN ---
${context.stages.map((s, i) => `${i + 1}. "${s.name}" - ${s.taskCount} task`).join('\n')}

--- THÀNH VIÊN (${context.members.length} người) ---
${context.members.map((m, i) => `${i + 1}. ${m.name} (MSSV: ${m.studentId}) - ${m.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}`).join('\n')}

--- TỔNG QUAN CÔNG VIỆC ---
Tổng: ${context.tasks.length} task
- TODO: ${tasksByStatus.TODO.length}
- IN_PROGRESS: ${tasksByStatus.IN_PROGRESS.length}  
- DONE: ${tasksByStatus.DONE.length}
- VERIFIED: ${tasksByStatus.VERIFIED.length}

--- DANH SÁCH TASK CHI TIẾT ---
${taskListFormatted || '(Chưa có task nào)'}

--- CẢNH BÁO ---
${overdueTasks.length > 0 
  ? `🚨 ${overdueTasks.length} TASK QUÁ HẠN:\n${overdueTasks.map(t => `   - [#${t.short_id}] "${t.title}"`).join('\n')}` 
  : '✅ Không có task quá hạn'}
${upcomingTasks.length > 0 
  ? `\n⏰ ${upcomingTasks.length} TASK SẮP ĐẾN HẠN (trong 3 ngày):\n${upcomingTasks.map(t => `   - [#${t.short_id}] "${t.title}" - còn ${t.daysUntilDeadline} ngày`).join('\n')}` 
  : ''}

--- VAI TRÒ CỦA BẠN TRONG PROJECT ---
Tên: ${context.currentUser.name}
Vai trò: ${context.currentUser.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}
Task được giao: ${context.currentUser.assignedTasks.length > 0 ? context.currentUser.assignedTasks.join(', ') : 'Chưa có task nào'}
`;
}

function buildSystemPrompt(userName: string, projectContexts: string[], isProjectSpecific: boolean, projectName?: string): string {
  const now = new Date();
  const dateTimeStr = now.toLocaleString('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const contextInstructions = isProjectSpecific
    ? `## PHẠM VI TRẢ LỜI - RẤT QUAN TRỌNG
⚠️ NGƯỜI DÙNG ĐANG Ở TRONG PROJECT: "${projectName}"

NGUYÊN TẮC BẮT BUỘC:
1. CHỈ trả lời về project "${projectName}" này - KHÔNG BAO GIỜ đề cập đến project khác
2. Khi đề cập đến task, LUÔN sử dụng mã task [#xxx] và tên chính xác từ dữ liệu
3. Khi đề cập đến deadline, LUÔN lấy chính xác từ dữ liệu, KHÔNG được suy đoán
4. Nếu câu hỏi không liên quan đến project này, nói rõ: "Câu hỏi này không liên quan đến project hiện tại"
5. Nếu không tìm thấy thông tin, nói rõ: "Không tìm thấy thông tin này trong dữ liệu project"`
    : `## PHẠM VI TRẢ LỜI
Người dùng đang ở ngoài phạm vi project cụ thể.
- Có thể trả lời tổng quan về tất cả các project
- Có thể so sánh thông tin giữa các project
- Khi đề cập đến task hoặc deadline, PHẢI nói rõ thuộc project nào`;

  return `Bạn là trợ lý AI của hệ thống quản lý teamwork. 

## THÔNG TIN NGƯỜI DÙNG
- Tên: ${userName}
- Thời gian hiện tại: ${dateTimeStr}

${contextInstructions}

${projectContexts.length > 0 ? `## DỮ LIỆU PROJECT - CHỈ SỬ DỤNG DỮ LIỆU NÀY
${projectContexts.join('\n---\n')}` : '## Người dùng chưa tham gia project nào.'}

## NGUYÊN TẮC TRẢ LỜI CHÍNH XÁC
1. **Chính xác tuyệt đối**: CHỈ sử dụng thông tin có trong dữ liệu trên, KHÔNG suy đoán
2. **Mã task**: Khi nhắc đến task, LUÔN dùng format [#mã_task] "tên task"
3. **Deadline**: Khi nhắc deadline, LUÔN copy chính xác từ dữ liệu, kèm trạng thái (quá hạn/còn X ngày)
4. **Không có = Nói rõ**: Nếu thông tin không tồn tại, nói "Không có trong dữ liệu" 
5. **Ngắn gọn**: Trả lời súc tích, đúng trọng tâm
6. **Tiếng Việt**: Sử dụng tiếng Việt tự nhiên, thân thiện

## VÍ DỤ TRẢ LỜI ĐÚNG
- "Task [#abc123] 'Viết báo cáo' có deadline ngày 20/01/2026, còn 5 ngày nữa"
- "Bạn được giao 2 task: [#xyz] 'Task A' và [#def] 'Task B'"
- "Không tìm thấy task nào tên 'XYZ' trong project này"`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, projectId } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Validate message word count
    const lastMessage = messages?.[messages.length - 1];
    if (lastMessage?.content) {
      const wordCount = lastMessage.content.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
      if (wordCount > MAX_MESSAGE_WORDS) {
        return new Response(JSON.stringify({ 
          error: `Câu hỏi quá dài. Vui lòng giới hạn trong ${MAX_MESSAGE_WORDS} từ.`,
          code: "MESSAGE_TOO_LONG"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use service role to bypass RLS for AI queries
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: { user } } = await anonClient.auth.getUser();
      if (user) {
        userId = user.id;
        userEmail = user.email || null;
      }
    }

    // Get user profile
    let userName = userEmail || "Người dùng";
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();
      if (profile?.full_name) {
        userName = profile.full_name;
      }
    }

    // Build project contexts
    const projectContexts: string[] = [];
    let isProjectSpecific = false;
    let currentProjectName: string | undefined;

    // If projectId is provided, fetch that specific project only
    if (projectId && userId) {
      isProjectSpecific = true;
      const context = await fetchProjectContext(supabase, projectId, userId);
      if (context) {
        currentProjectName = context.project.name;
        projectContexts.push(buildProjectContext(context));
      }
    } else if (userId) {
      // Fetch all projects user is a member of (general context)
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);

      if (memberships && memberships.length > 0) {
        // Limit to 5 most recent projects for performance
        const projectIds = memberships.slice(0, 5).map(m => m.group_id);
        
        for (const pId of projectIds) {
          const context = await fetchProjectContext(supabase, pId, userId);
          if (context) {
            projectContexts.push(buildProjectContext(context));
          }
        }
      }
    }

    const systemPrompt = buildSystemPrompt(userName, projectContexts, isProjectSpecific, currentProjectName);

    // Call Lovable AI Gateway with streaming
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        temperature: 0.3, // Lower temperature for more accurate responses
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Đã vượt quá giới hạn request, vui lòng thử lại sau.",
          code: "RATE_LIMITED"
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "Hệ thống AI tạm thời không khả dụng.",
          code: "CREDITS_EXHAUSTED"
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("team-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchProjectContext(
  supabase: any, 
  projectId: string, 
  userId: string
): Promise<ProjectContext | null> {
  const now = new Date();

  // Fetch project
  const { data: project } = await supabase
    .from('groups')
    .select('*')
    .eq('id', projectId)
    .single();

  if (!project) return null;

  // Fetch stages
  const { data: stages } = await supabase
    .from('stages')
    .select('*')
    .eq('group_id', projectId)
    .order('order_index');

  // Fetch members with profiles
  const { data: members } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', projectId);

  const memberUserIds = members?.map((m: any) => m.user_id) || [];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', memberUserIds);

  const profilesMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

  // Fetch tasks with assignments - include short_id
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('group_id', projectId)
    .order('created_at', { ascending: true });

  const taskIds = tasks?.map((t: any) => t.id) || [];
  const { data: assignments } = await supabase
    .from('task_assignments')
    .select('*')
    .in('task_id', taskIds.length > 0 ? taskIds : ['none']);

  const stageMap = new Map(stages?.map((s: any) => [s.id, s.name]) || []);

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      classCode: project.class_code,
      instructorName: project.instructor_name,
    },
    stages: (stages || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      taskCount: tasks?.filter((t: any) => t.stage_id === s.id).length || 0,
    })),
    members: (members || []).map((m: any) => {
      const profile = profilesMap.get(m.user_id) as any;
      return {
        id: m.user_id,
        name: profile?.full_name || 'Unknown',
        role: m.role,
        studentId: profile?.student_id || '',
      };
    }),
    tasks: (tasks || []).map((t: any) => {
      const taskAssignees = assignments?.filter((a: any) => a.task_id === t.id) || [];
      const assigneeNames = taskAssignees.map((a: any) => {
        const profile = profilesMap.get(a.user_id) as any;
        return profile?.full_name || 'Unknown';
      });

      let isOverdue = false;
      let daysUntilDeadline: number | null = null;
      let deadlineFormatted: string | null = null;

      if (t.deadline) {
        const deadline = new Date(t.deadline);
        deadlineFormatted = deadline.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const diffTime = deadline.getTime() - now.getTime();
        daysUntilDeadline = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        isOverdue = diffTime < 0 && t.status !== 'DONE' && t.status !== 'VERIFIED';
      }

      return {
        id: t.id,
        short_id: t.short_id || t.id.substring(0, 6),
        title: t.title,
        status: t.status,
        deadline: t.deadline,
        deadlineFormatted,
        stageName: t.stage_id ? stageMap.get(t.stage_id) || null : null,
        assignees: assigneeNames,
        isOverdue,
        daysUntilDeadline,
      };
    }),
    currentUser: {
      name: (profilesMap.get(userId) as any)?.full_name || 'User',
      role: members?.find((m: any) => m.user_id === userId)?.role || 'member',
      assignedTasks: (tasks || [])
        .filter((t: any) => assignments?.some((a: any) => a.task_id === t.id && a.user_id === userId))
        .map((t: any) => `[#${t.short_id || t.id.substring(0, 6)}] ${t.title}`),
    },
  };
}
