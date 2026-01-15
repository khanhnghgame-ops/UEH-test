-- Add new profile fields for extended user information
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS year_batch text,
ADD COLUMN IF NOT EXISTS major text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS skills text,
ADD COLUMN IF NOT EXISTS bio text;

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.year_batch IS 'Khóa học của sinh viên (VD: K47, K48)';
COMMENT ON COLUMN public.profiles.major IS 'Ngành học của sinh viên';
COMMENT ON COLUMN public.profiles.phone IS 'Số điện thoại liên hệ';
COMMENT ON COLUMN public.profiles.skills IS 'Kỹ năng và thế mạnh';
COMMENT ON COLUMN public.profiles.bio IS 'Giới thiệu ngắn về bản thân';