import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Usage limits
const MAX_QUESTIONS_PER_DAY = 50;
const MAX_MESSAGE_LENGTH = 500;

interface ProjectContext {
  project: {
    name: string;
    description: string | null;
    classCode: string | null;
    instructorName: string | null;
  };
  stages: Array<{
    name: string;
    taskCount: number;
  }>;
  members: Array<{
    name: string;
    role: string;
    studentId: string;
  }>;
  tasks: Array<{
    title: string;
    status: string;
    deadline: string | null;
    stageName: string | null;
    assignees: string[];
    isOverdue: boolean;
    daysUntilDeadline: number | null;
  }>;
  currentUser: {
    name: string;
    role: string;
    assignedTasks: string[];
  };
}

function buildProjectContext(context: ProjectContext): string {
  const now = new Date();
  
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
  
  return `
## PROJECT: ${context.project.name}
- Mô tả: ${context.project.description || 'Không có mô tả'}
- Mã lớp: ${context.project.classCode || 'N/A'}
- Giảng viên: ${context.project.instructorName || 'N/A'}

## GIAI ĐOẠN
${context.stages.map(s => `- ${s.name}: ${s.taskCount} task`).join('\n')}

## THÀNH VIÊN (${context.members.length} người)
${context.members.map(m => `- ${m.name} (${m.studentId}) - ${m.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}`).join('\n')}

## TỔNG QUAN
- TODO: ${tasksByStatus.TODO.length} | IN_PROGRESS: ${tasksByStatus.IN_PROGRESS.length} | DONE: ${tasksByStatus.DONE.length} | VERIFIED: ${tasksByStatus.VERIFIED.length}

## CÔNG VIỆC
${context.tasks.map(t => {
  const deadlineInfo = t.deadline 
    ? (t.isOverdue ? `⚠️ QUÁ HẠN` : (t.daysUntilDeadline !== null && t.daysUntilDeadline <= 3 ? `⏰ Còn ${t.daysUntilDeadline} ngày` : `📅 ${t.deadline}`))
    : 'Không deadline';
  return `- "${t.title}" | ${t.status} | ${t.stageName || 'Chưa phân giai đoạn'} | ${deadlineInfo} | Người làm: ${t.assignees.join(', ') || 'Chưa phân công'}`;
}).join('\n')}

## CẢNH BÁO
${overdueTasks.length > 0 ? `🚨 ${overdueTasks.length} task quá hạn: ${overdueTasks.map(t => t.title).join(', ')}` : '✅ Không có task quá hạn'}
${upcomingTasks.length > 0 ? `⏰ ${upcomingTasks.length} task sắp đến hạn: ${upcomingTasks.map(t => t.title).join(', ')}` : ''}

## VAI TRÒ NGƯỜI DÙNG TRONG PROJECT
- Tên: ${context.currentUser.name}
- Vai trò: ${context.currentUser.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}
- Task được giao: ${context.currentUser.assignedTasks.length > 0 ? context.currentUser.assignedTasks.join(', ') : 'Chưa có'}
`;
}

function buildSystemPrompt(userName: string, projectContexts: string[]): string {
  const now = new Date();
  
  return `Bạn là trợ lý AI thông minh của hệ thống quản lý teamwork. Vai trò của bạn:

1. **Giải đáp thắc mắc** về công việc, task, deadline, phân công và quy trình làm việc
2. **Hỗ trợ tra cứu** thông tin nhanh chóng
3. **Nhắc nhở nhẹ nhàng** (chỉ khi thật sự cần thiết) về deadline gần hoặc task có nguy cơ trễ

## THÔNG TIN NGƯỜI DÙNG
- Tên: ${userName}

${projectContexts.length > 0 ? `## DỮ LIỆU CÁC PROJECT CỦA NGƯỜI DÙNG
${projectContexts.join('\n---\n')}` : '## Người dùng chưa tham gia project nào.'}

## NGUYÊN TẮC TRẢ LỜI
1. Trả lời ngắn gọn, súc tích, đi thẳng vào vấn đề
2. Sử dụng tiếng Việt tự nhiên, thân thiện
3. Chỉ nhắc deadline khi người dùng hỏi hoặc khi có task sắp đến hạn của họ
4. Ưu tiên thông tin liên quan đến người dùng trước
5. Đưa ra gợi ý hành động cụ thể khi phù hợp
6. Không nói quá dài, tập trung vào câu trả lời
7. Nếu không biết hoặc không có thông tin, nói rõ ràng

Thời gian hiện tại: ${now.toLocaleString('vi-VN')}`;
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

    // Validate message length
    const lastMessage = messages?.[messages.length - 1];
    if (lastMessage?.content && lastMessage.content.length > MAX_MESSAGE_LENGTH) {
      return new Response(JSON.stringify({ 
        error: `Câu hỏi quá dài. Vui lòng giới hạn trong ${MAX_MESSAGE_LENGTH} ký tự.`,
        code: "MESSAGE_TOO_LONG"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // If projectId is provided, fetch that specific project
    if (projectId && userId) {
      const context = await fetchProjectContext(supabase, projectId, userId);
      if (context) {
        projectContexts.push(buildProjectContext(context));
      }
    } else if (userId) {
      // Fetch all projects user is a member of
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

    const systemPrompt = buildSystemPrompt(userName, projectContexts);

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

  // Fetch tasks with assignments
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('group_id', projectId);

  const taskIds = tasks?.map((t: any) => t.id) || [];
  const { data: assignments } = await supabase
    .from('task_assignments')
    .select('*')
    .in('task_id', taskIds.length > 0 ? taskIds : ['none']);

  const stageMap = new Map(stages?.map((s: any) => [s.id, s.name]) || []);

  return {
    project: {
      name: project.name,
      description: project.description,
      classCode: project.class_code,
      instructorName: project.instructor_name,
    },
    stages: (stages || []).map((s: any) => ({
      name: s.name,
      taskCount: tasks?.filter((t: any) => t.stage_id === s.id).length || 0,
    })),
    members: (members || []).map((m: any) => {
      const profile = profilesMap.get(m.user_id) as any;
      return {
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

      if (t.deadline) {
        const deadline = new Date(t.deadline);
        const diffTime = deadline.getTime() - now.getTime();
        daysUntilDeadline = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        isOverdue = diffTime < 0 && t.status !== 'DONE' && t.status !== 'VERIFIED';
      }

      return {
        title: t.title,
        status: t.status,
        deadline: t.deadline ? new Date(t.deadline).toLocaleDateString('vi-VN') : null,
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
        .map((t: any) => t.title),
    },
  };
}
