import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Admin cứng - thông tin cố định
const ADMIN_EMAIL = 'khanhngh.ueh@gmail.com'
const ADMIN_STUDENT_ID = '31241570562'
const ADMIN_FULL_NAME = 'Nguyễn Hoàng Khánh'
const ADMIN_DEFAULT_PASSWORD = '14092005'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Sử dụng service role để tạo user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Kiểm tra admin đã tồn tại chưa
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const adminExists = existingUsers?.users?.find(u => u.email === ADMIN_EMAIL)

    if (adminExists) {
      // Admin đã tồn tại, đảm bảo có role và profile đúng
      const adminId = adminExists.id

      // Cập nhật/tạo profile
      await supabaseAdmin.from('profiles').upsert({
        id: adminId,
        email: ADMIN_EMAIL,
        student_id: ADMIN_STUDENT_ID,
        full_name: ADMIN_FULL_NAME,
        is_approved: true,
        must_change_password: false
      }, { onConflict: 'id' })

      // Đảm bảo có role admin
      await supabaseAdmin.from('user_roles').upsert({
        user_id: adminId,
        role: 'admin'
      }, { onConflict: 'user_id,role' })

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Admin account already exists and verified',
          admin_id: adminId 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Tạo admin user mới
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_DEFAULT_PASSWORD,
      email_confirm: true, // Tự động xác nhận email
      user_metadata: {
        student_id: ADMIN_STUDENT_ID,
        full_name: ADMIN_FULL_NAME
      }
    })

    if (createError) {
      throw createError
    }

    const adminId = newUser.user.id

    // Tạo profile
    await supabaseAdmin.from('profiles').upsert({
      id: adminId,
      email: ADMIN_EMAIL,
      student_id: ADMIN_STUDENT_ID,
      full_name: ADMIN_FULL_NAME,
      is_approved: true,
      must_change_password: false
    }, { onConflict: 'id' })

    // Gán role admin
    await supabaseAdmin.from('user_roles').upsert({
      user_id: adminId,
      role: 'admin'
    }, { onConflict: 'user_id,role' })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Admin account created successfully',
        admin_id: adminId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
