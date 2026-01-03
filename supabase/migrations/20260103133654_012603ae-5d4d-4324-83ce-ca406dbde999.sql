-- Thêm cột max_file_size cho tasks (đơn vị: bytes)
-- Mặc định 10MB = 10485760 bytes
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS max_file_size bigint DEFAULT 10485760;

-- Cập nhật storage bucket để hỗ trợ tối đa 100MB
UPDATE storage.buckets 
SET 
  file_size_limit = 104857600, -- 100MB in bytes
  allowed_mime_types = null    -- Cho phép mọi loại file
WHERE id = 'task-submissions';