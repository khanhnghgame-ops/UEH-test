import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function buildSystemPrompt(context: ProjectContext): string {
  const now = new Date();
  
  // Build task summary
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
  
  const userTasks = context.tasks.filter(t => 
    t.assignees.includes(context.currentUser.name)
  );
  
  return `Bạn là trợ lý AI thông minh cho team "${context.project.name}". Vai trò của bạn:

1. **Trả lời thắc mắc** về công việc, deadline, phân công, quy trình làm việc
2. **Hỗ trợ tra cứu** thông tin nhanh chóng
3. **Nhắc nhở nhẹ nhàng** khi có deadline gần hoặc task có nguy cơ trễ

## THÔNG TIN PROJECT
- **Tên project**: ${context.project.name}
- **Mô tả**: ${context.project.description || 'Không có mô tả'}
- **Mã lớp**: ${context.project.classCode || 'N/A'}
- **Giảng viên**: ${context.project.instructorName || 'N/A'}

## CÁC GIAI ĐOẠN (STAGES)
${context.stages.map(s => `- ${s.name}: ${s.taskCount} task`).join('\n')}

## THÀNH VIÊN NHÓM (${context.members.length} người)
${context.members.map(m => `- ${m.name} (${m.studentId}) - ${m.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}`).join('\n')}

## TỔNG QUAN CÔNG VIỆC
- Chờ làm (TODO): ${tasksByStatus.TODO.length} task
- Đang làm (IN_PROGRESS): ${tasksByStatus.IN_PROGRESS.length} task
- Hoàn thành (DONE): ${tasksByStatus.DONE.length} task
- Đã xác minh (VERIFIED): ${tasksByStatus.VERIFIED.length} task
- Tổng cộng: ${context.tasks.length} task

## DANH SÁCH CÔNG VIỆC CHI TIẾT
${context.tasks.map(t => {
  const deadlineInfo = t.deadline 
    ? (t.isOverdue 
      ? `⚠️ QUÁ HẠN` 
      : (t.daysUntilDeadline !== null && t.daysUntilDeadline <= 3 
        ? `⏰ Còn ${t.daysUntilDeadline} ngày` 
        : `📅 ${t.deadline}`))
    : 'Không có deadline';
  return `- "${t.title}" | ${t.status} | ${t.stageName || 'Chưa phân giai đoạn'} | ${deadlineInfo} | Người làm: ${t.assignees.join(', ') || 'Chưa phân công'}`;
}).join('\n')}

## CẢNH BÁO
${overdueTasks.length > 0 ? `🚨 **${overdueTasks.length} TASK QUÁ HẠN**: ${overdueTasks.map(t => t.title).join(', ')}` : '✅ Không có task quá hạn'}
${upcomingTasks.length > 0 ? `⏰ **${upcomingTasks.length} task sắp đến hạn (trong 3 ngày)**: ${upcomingTasks.map(t => t.title).join(', ')}` : ''}

## NGƯỜI DÙNG HIỆN TẠI
- **Tên**: ${context.currentUser.name}
- **Vai trò**: ${context.currentUser.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}
- **Công việc được giao**: ${context.currentUser.assignedTasks.length > 0 ? context.currentUser.assignedTasks.join(', ') : 'Chưa có'}

## NGUYÊN TẮC TRẢ LỜI
1. Trả lời ngắn gọn, súc tích, đi thẳng vào vấn đề
2. Sử dụng tiếng Việt tự nhiên, thân thiện
3. Khi nhắc deadline, ưu tiên nhắc cá nhân trước, không làm phiền cả team
4. Nếu người dùng hỏi về task của mình, ưu tiên hiển thị thông tin đó trước
5. Đưa ra gợi ý hành động cụ thể khi phù hợp
6. Nếu có task quá hạn hoặc sắp đến hạn của người dùng, nhắc nhở nhẹ nhàng

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

    // Get authorization header for Supabase client
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || "" } }
    });

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch project context
    const { data: project } = await supabase
      .from('groups')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const memberUserIds = members?.map(m => m.user_id) || [];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', memberUserIds);

    const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

    // Fetch tasks with assignments
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('group_id', projectId);

    const taskIds = tasks?.map(t => t.id) || [];
    const { data: assignments } = await supabase
      .from('task_assignments')
      .select('*')
      .in('task_id', taskIds);

    // Build context
    const now = new Date();
    const stageMap = new Map(stages?.map(s => [s.id, s.name]) || []);

    const context: ProjectContext = {
      project: {
        name: project.name,
        description: project.description,
        classCode: project.class_code,
        instructorName: project.instructor_name,
      },
      stages: (stages || []).map(s => ({
        name: s.name,
        taskCount: tasks?.filter(t => t.stage_id === s.id).length || 0,
      })),
      members: (members || []).map(m => {
        const profile = profilesMap.get(m.user_id);
        return {
          name: profile?.full_name || 'Unknown',
          role: m.role,
          studentId: profile?.student_id || '',
        };
      }),
      tasks: (tasks || []).map(t => {
        const taskAssignees = assignments?.filter(a => a.task_id === t.id) || [];
        const assigneeNames = taskAssignees.map(a => {
          const profile = profilesMap.get(a.user_id);
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
        name: profilesMap.get(user.id)?.full_name || user.email || 'User',
        role: members?.find(m => m.user_id === user.id)?.role || 'member',
        assignedTasks: (tasks || [])
          .filter(t => assignments?.some(a => a.task_id === t.id && a.user_id === user.id))
          .map(t => t.title),
      },
    };

    const systemPrompt = buildSystemPrompt(context);

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
        return new Response(JSON.stringify({ error: "Đã vượt quá giới hạn request, vui lòng thử lại sau." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Cần nạp thêm credits để sử dụng AI." }), {
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
