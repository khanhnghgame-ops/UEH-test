-- Add slug column to groups table for semantic URLs
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS slug TEXT;

-- Add slug column to tasks table for semantic URLs  
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS slug TEXT;

-- Create function to generate URL-safe slug from Vietnamese text
CREATE OR REPLACE FUNCTION public.generate_slug(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  -- Convert to lowercase
  result := lower(input_text);
  
  -- Vietnamese character mappings
  result := translate(result, 
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  );
  
  -- Replace spaces and special chars with hyphens
  result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');
  
  -- Remove leading/trailing hyphens
  result := trim(both '-' from result);
  
  -- Limit length to 50 chars
  result := left(result, 50);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Generate slugs for existing groups (slug = short_id + name_slug)
UPDATE public.groups 
SET slug = short_id || '-' || generate_slug(name)
WHERE slug IS NULL;

-- Generate slugs for existing tasks (slug = short_id + title_slug)
UPDATE public.tasks
SET slug = short_id || '-' || generate_slug(title)
WHERE slug IS NULL;

-- Make slug NOT NULL after populating
ALTER TABLE public.groups ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN slug SET NOT NULL;

-- Create unique index on group slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_slug ON public.groups(slug);

-- Create index on task slug (not unique, scoped to group)
CREATE INDEX IF NOT EXISTS idx_tasks_slug ON public.tasks(slug);

-- Create function to auto-generate slug on insert/update for groups
CREATE OR REPLACE FUNCTION public.auto_generate_group_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := NEW.short_id || '-' || generate_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create function to auto-generate slug on insert/update for tasks
CREATE OR REPLACE FUNCTION public.auto_generate_task_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := NEW.short_id || '-' || generate_slug(NEW.title);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_auto_group_slug ON public.groups;
CREATE TRIGGER trigger_auto_group_slug
  BEFORE INSERT OR UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_group_slug();

DROP TRIGGER IF EXISTS trigger_auto_task_slug ON public.tasks;
CREATE TRIGGER trigger_auto_task_slug
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_task_slug();