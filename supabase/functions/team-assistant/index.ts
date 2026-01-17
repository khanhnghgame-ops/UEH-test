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

// Map internal status to user-friendly display labels
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    'TODO': 'Chờ thực hiện',
    'IN_PROGRESS': 'Đang thực hiện',
    'DONE': 'Hoàn thành',
    'VERIFIED': 'Đã duyệt'
  };
  return statusMap[status] || status;
}

function buildProjectContext(context: ProjectContext): string {
  const tasksByStatus = {
    waiting: context.tasks.filter(t => t.status === 'TODO'),
    inProgress: context.tasks.filter(t => t.status === 'IN_PROGRESS'),
    done: context.tasks.filter(t => t.status === 'DONE'),
    verified: context.tasks.filter(t => t.status === 'VERIFIED'),
  };
  
  const overdueTasks = context.tasks.filter(t => t.isOverdue);
  const upcomingTasks = context.tasks.filter(t => 
    t.daysUntilDeadline !== null && 
    t.daysUntilDeadline >= 0 && 
    t.daysUntilDeadline <= 3 &&
    !t.isOverdue
  );
  
  // Build task list with user-friendly display (NO technical IDs)
  const taskListFormatted = context.tasks.map((t, index) => {
    const deadlineInfo = t.deadlineFormatted 
      ? (t.isOverdue 
          ? `⚠️ Quá hạn (${t.deadlineFormatted})` 
          : (t.daysUntilDeadline !== null && t.daysUntilDeadline <= 3 
              ? `⏰ Còn ${t.daysUntilDeadline} ngày (${t.deadlineFormatted})` 
              : `${t.deadlineFormatted}`))
      : 'Không có deadline';
    
    // Use display-friendly format without technical codes
    return `  ${index + 1}. "${t.title}"
     - Trạng thái: ${getStatusLabel(t.status)}
     - Giai đoạn: ${t.stageName || 'Chưa phân giai đoạn'}
     - Deadline: ${deadlineInfo}
     - Người thực hiện: ${t.assignees.length > 0 ? t.assignees.join(', ') : 'Chưa phân công'}`;
  }).join('\n');

  return `
=== DỰ ÁN: ${context.project.name} ===
Mô tả: ${context.project.description || 'Không có mô tả'}
Mã lớp: ${context.project.classCode || 'Không có'}
Giảng viên: ${context.project.instructorName || 'Không có'}

--- GIAI ĐOẠN ---
${context.stages.map((s, i) => `${i + 1}. "${s.name}" - ${s.taskCount} công việc`).join('\n')}

--- THÀNH VIÊN (${context.members.length} người) ---
${context.members.map((m, i) => `${i + 1}. ${m.name} - ${m.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}`).join('\n')}

--- TỔNG QUAN CÔNG VIỆC ---
Tổng: ${context.tasks.length} công việc
- Chờ thực hiện: ${tasksByStatus.waiting.length}
- Đang thực hiện: ${tasksByStatus.inProgress.length}
- Hoàn thành: ${tasksByStatus.done.length}
- Đã duyệt: ${tasksByStatus.verified.length}

--- DANH SÁCH CÔNG VIỆC ---
${taskListFormatted || '(Chưa có công việc nào)'}

--- LƯU Ý ---
${overdueTasks.length > 0 
  ? `🚨 ${overdueTasks.length} công việc quá hạn:\n${overdueTasks.map(t => `   - "${t.title}"`).join('\n')}` 
  : '✅ Không có công việc quá hạn'}
${upcomingTasks.length > 0 
  ? `\n⏰ ${upcomingTasks.length} công việc sắp đến hạn (trong 3 ngày):\n${upcomingTasks.map(t => `   - "${t.title}" - còn ${t.daysUntilDeadline} ngày`).join('\n')}` 
  : ''}

--- THÔNG TIN CỦA BẠN ---
Tên: ${context.currentUser.name}
Vai trò: ${context.currentUser.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}
Công việc được giao: ${context.currentUser.assignedTasks.length > 0 ? context.currentUser.assignedTasks.join(', ') : 'Chưa có'}
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
    ? `## PHẠM VI TRẢ LỜI
⚠️ Người dùng đang ở trong dự án: "${projectName}"

NGUYÊN TẮC:
1. CHỈ trả lời về dự án "${projectName}" - KHÔNG đề cập dự án khác
2. Nếu câu hỏi không liên quan, nói: "Câu hỏi này không liên quan đến dự án hiện tại"
3. Nếu không tìm thấy thông tin, nói: "Không tìm thấy thông tin này"`
    : `## PHẠM VI TRẢ LỜI
Người dùng đang ở ngoài phạm vi dự án cụ thể.
- Có thể trả lời tổng quan về tất cả các dự án
- Khi đề cập đến công việc, PHẢI nói rõ thuộc dự án nào`;

  return `Bạn là trợ lý AI hiển thị thông tin cho người dùng cuối.

## THÔNG TIN
- Người dùng: ${userName}
- Thời gian: ${dateTimeStr}

${contextInstructions}

${projectContexts.length > 0 ? `## DỮ LIỆU
${projectContexts.join('\n---\n')}` : '## Người dùng chưa tham gia dự án nào.'}

## QUY TẮC BẮT BUỘC - CỰC KỲ QUAN TRỌNG

### KHÔNG ĐƯỢC LÀM:
1. ❌ KHÔNG hiển thị bất kỳ mã kỹ thuật nào (ID, hash, code nội bộ, ký hiệu hệ thống như [#abc123])
2. ❌ KHÔNG liệt kê, giải thích hoặc chuyển đổi trạng thái theo kiểu kỹ thuật (TODO, IN_PROGRESS, DONE, VERIFIED)
3. ❌ KHÔNG dùng thuật ngữ nội bộ hệ thống
4. ❌ KHÔNG suy đoán hoặc thêm thông tin không có trên giao diện
5. ❌ KHÔNG giải thích kỹ thuật

### PHẢI LÀM:
1. ✅ CHỈ trả về nội dung người dùng nhìn thấy trên giao diện
2. ✅ Dùng TÊN công việc thay vì mã (ví dụ: "Viết báo cáo" thay vì "[#abc] Viết báo cáo")
3. ✅ Trạng thái PHẢI dùng đúng cách hiển thị: "Chờ thực hiện", "Đang thực hiện", "Hoàn thành", "Đã duyệt"
4. ✅ Deadline ghi đúng định dạng: ngày/tháng/năm – giờ:phút (ví dụ: 20/01/2026 – 23:59)
5. ✅ Trả lời ngắn gọn, rõ ràng, giống như đọc lại giao diện cho người dùng

## VÍ DỤ TRẢ LỜI ĐÚNG
- "Bạn có 2 công việc được giao: 'Viết báo cáo' và 'Thiết kế slide'"
- "Công việc 'Viết báo cáo' có deadline 20/01/2026 – 23:59, trạng thái: Đang thực hiện"
- "Hiện tại nhóm có 3 công việc đang thực hiện và 1 công việc đã hoàn thành"
- "Không tìm thấy công việc nào tên 'XYZ' trong dự án này"

## VÍ DỤ TRẢ LỜI SAI (KHÔNG ĐƯỢC LÀM)
- ❌ "Task [#abc123] có status IN_PROGRESS" → phải viết: "Công việc 'Tên task' đang thực hiện"
- ❌ "ID: abc-def-123" → KHÔNG hiển thị ID
- ❌ "TODO: 2, DONE: 1" → phải viết: "2 công việc chờ thực hiện, 1 công việc hoàn thành"`;
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
      name: (profilesMap.get(userId) as any)?.full_name || 'Người dùng',
      role: members?.find((m: any) => m.user_id === userId)?.role || 'member',
      // Display task titles only, no technical IDs
      assignedTasks: (tasks || [])
        .filter((t: any) => assignments?.some((a: any) => a.task_id === t.id && a.user_id === userId))
        .map((t: any) => `"${t.title}"`),
    },
  };
}
