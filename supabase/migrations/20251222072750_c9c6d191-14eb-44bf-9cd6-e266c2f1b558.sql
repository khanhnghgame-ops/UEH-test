-- 1. Cập nhật function check_admin_user để hoàn chỉnh hơn
CREATE OR REPLACE FUNCTION public.check_admin_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Nếu là tài khoản admin đặc biệt theo email cố định
  IF NEW.email = 'khanhngh.ueh@gmail.com' THEN
    -- Đảm bảo hồ sơ được duyệt và đồng bộ thông tin cơ bản
    INSERT INTO public.profiles (id, student_id, full_name, email, is_approved)
    VALUES (
      NEW.id,
      '31241570562',
      'Nguyễn Hoàng Khánh',
      NEW.email,
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      is_approved = true,
      full_name = 'Nguyễn Hoàng Khánh',
      student_id = '31241570562',
      email = NEW.email;

    -- Cấp quyền admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Tạo function để khôi phục quyền admin (có thể gọi thủ công)
CREATE OR REPLACE FUNCTION public.ensure_admin_exists()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Tìm user id của admin
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'khanhngh.ueh@gmail.com'
  LIMIT 1;
  
  -- Nếu user tồn tại, đảm bảo có quyền admin
  IF admin_user_id IS NOT NULL THEN
    -- Cập nhật profile
    UPDATE public.profiles
    SET 
      is_approved = true,
      full_name = 'Nguyễn Hoàng Khánh',
      student_id = '31241570562'
    WHERE id = admin_user_id;
    
    -- Đảm bảo có role admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$function$;

-- 3. Tạo trigger bảo vệ role admin - không cho phép xóa
CREATE OR REPLACE FUNCTION public.protect_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_email text;
BEGIN
  -- Lấy email của user đang bị xóa role
  SELECT email INTO admin_email
  FROM auth.users
  WHERE id = OLD.user_id;
  
  -- Nếu là admin cứng và đang cố xóa role admin
  IF admin_email = 'khanhngh.ueh@gmail.com' AND OLD.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot remove admin role from system administrator';
  END IF;
  
  RETURN OLD;
END;
$function$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS protect_admin_role_trigger ON public.user_roles;
CREATE TRIGGER protect_admin_role_trigger
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_role();

-- 4. Tạo trigger ngăn thay đổi role admin
CREATE OR REPLACE FUNCTION public.prevent_admin_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_email text;
BEGIN
  -- Lấy email của user đang bị thay đổi role
  SELECT email INTO admin_email
  FROM auth.users
  WHERE id = OLD.user_id;
  
  -- Nếu là admin cứng và đang cố thay đổi role từ admin sang role khác
  IF admin_email = 'khanhngh.ueh@gmail.com' AND OLD.role = 'admin' AND NEW.role != 'admin' THEN
    RAISE EXCEPTION 'Cannot change admin role for system administrator';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS prevent_admin_role_change_trigger ON public.user_roles;
CREATE TRIGGER prevent_admin_role_change_trigger
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_admin_role_change();

-- 5. Đảm bảo trigger trên auth.users đã được tạo
DROP TRIGGER IF EXISTS on_auth_user_check_admin ON auth.users;
CREATE TRIGGER on_auth_user_check_admin
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.check_admin_user();

-- 6. Chạy function để đảm bảo admin hiện tại có quyền
SELECT public.ensure_admin_exists();