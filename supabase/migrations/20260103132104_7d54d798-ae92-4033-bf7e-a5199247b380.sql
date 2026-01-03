-- Cập nhật bucket task-submissions:
-- 1. Bỏ giới hạn loại file (allowed_mime_types = null)
-- 2. Tăng file_size_limit lên 10MB (vì mỗi task giới hạn 10MB tổng, 1 file có thể chiếm hết)
UPDATE storage.buckets 
SET 
  file_size_limit = 10485760, -- 10MB in bytes
  allowed_mime_types = null   -- Cho phép mọi loại file
WHERE id = 'task-submissions';