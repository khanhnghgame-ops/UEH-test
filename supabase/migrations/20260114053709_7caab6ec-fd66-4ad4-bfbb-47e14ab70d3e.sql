-- Update slug generation function to NOT include short_id prefix
-- Slug will be purely name-based with collision handling

CREATE OR REPLACE FUNCTION public.generate_unique_group_slug(group_name TEXT, group_id UUID)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
  existing_count INTEGER;
BEGIN
  -- Generate base slug from name only (no short_id)
  base_slug := public.generate_slug(group_name);
  final_slug := base_slug;
  
  -- Check for collisions and add suffix if needed
  LOOP
    SELECT COUNT(*) INTO existing_count 
    FROM public.groups 
    WHERE slug = final_slug AND id != group_id;
    
    IF existing_count = 0 THEN
      RETURN final_slug;
    END IF;
    
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Update slug generation function for tasks
CREATE OR REPLACE FUNCTION public.generate_unique_task_slug(task_title TEXT, task_id UUID, task_group_id UUID)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
  existing_count INTEGER;
BEGIN
  -- Generate base slug from title only (no short_id)
  base_slug := public.generate_slug(task_title);
  final_slug := base_slug;
  
  -- Check for collisions within same group and add suffix if needed
  LOOP
    SELECT COUNT(*) INTO existing_count 
    FROM public.tasks 
    WHERE slug = final_slug AND group_id = task_group_id AND id != task_id;
    
    IF existing_count = 0 THEN
      RETURN final_slug;
    END IF;
    
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Update group slug trigger to use new function
CREATE OR REPLACE FUNCTION public.auto_generate_group_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- Always regenerate slug on name change or if slug is empty
  IF NEW.slug IS NULL OR NEW.slug = '' OR 
     (TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name) THEN
    NEW.slug := public.generate_unique_group_slug(NEW.name, COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Update task slug trigger to use new function  
CREATE OR REPLACE FUNCTION public.auto_generate_task_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- Always regenerate slug on title change or if slug is empty
  IF NEW.slug IS NULL OR NEW.slug = '' OR 
     (TG_OP = 'UPDATE' AND OLD.title IS DISTINCT FROM NEW.title) THEN
    NEW.slug := public.generate_unique_task_slug(NEW.title, COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID), NEW.group_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Update existing groups to use clean slugs (without short_id prefix)
UPDATE public.groups 
SET slug = public.generate_unique_group_slug(name, id)
WHERE slug LIKE '%-%';

-- Update existing tasks to use clean slugs (without short_id prefix)
UPDATE public.tasks 
SET slug = public.generate_unique_task_slug(title, id, group_id)
WHERE slug LIKE '%-%';